import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell, utilityProcess, type UtilityProcess } from 'electron'
import { randomUUID } from 'crypto'
import { rmSync } from 'fs'
import { copyFile, readdir, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { basename, dirname, extname, join, resolve, sep } from 'path'
import { pathToFileURL } from 'url'
import type { InputFile, JobEvent, JobRequest, SaveItem, SaveOutcome } from '@shared/types'
import type { InspectResult, RenderResult, WorkerRequest } from './worker'
import { officeStatus } from './engines/office'
import { ensureDir, errorMessage, uniqueDir, uniquePath } from './engines/util'

let win: BrowserWindow | null = null

// ---------------------------------------------------------------- Review area
//
// Jobs write their results into a private temporary folder. Nothing lands next to the user's
// files until they review the results and press Save. Each app instance gets its own folder,
// which is deleted when the app quits.

const STAGING_PARENT = join(tmpdir(), 'aerowis-compressor')
const STAGING_ROOT = join(STAGING_PARENT, String(process.pid))

const isInside = (path: string, dir: string): boolean => resolve(path).startsWith(resolve(dir) + sep)
const isStaged = (path: string): boolean => isInside(path, STAGING_ROOT)

async function cleanStaleStaging(): Promise<void> {
  // Folders left behind by a crash or a force-quit.
  const entries = await readdir(STAGING_PARENT).catch(() => [] as string[])
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000
  for (const name of entries) {
    const dir = join(STAGING_PARENT, name)
    const s = await stat(dir).catch(() => null)
    if (s && name !== String(process.pid) && s.mtimeMs < dayAgo) await rm(dir, { recursive: true, force: true })
  }
}

/** File names can't contain these on Windows; keep names valid on both systems. */
function cleanName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/[. ]+$/, '')
    .trim()
    .slice(0, 180)
  return cleaned || 'file'
}

async function saveItem(item: SaveItem): Promise<SaveOutcome> {
  try {
    if (item.outputs.length === 0 || !item.outputs.every(isStaged)) throw new Error('This result is no longer available — run the tool again')
    const destDir = item.dest.kind === 'beside' ? dirname(item.dest.original) : item.dest.folder
    await ensureDir(destDir)
    const name = cleanName(item.name)

    if (item.outputs.length === 1) {
      const src = item.outputs[0]
      const target = uniquePath(destDir, name, extname(src).slice(1))
      await copyFile(src, target)
      return { key: item.key, saved: [target] }
    }

    // Several outputs (split pages, PDF → images) are saved together in one folder.
    const folder = uniqueDir(destDir, name)
    await ensureDir(folder)
    const saved: string[] = []
    for (const src of item.outputs) {
      const target = join(folder, basename(src))
      await copyFile(src, target)
      saved.push(target)
    }
    return { key: item.key, saved }
  } catch (e) {
    return { key: item.key, saved: [], error: errorMessage(e) }
  }
}

// ---------------------------------------------------------------- Worker process

let worker: UtilityProcess | null = null
const pendingInspect = new Map<string, (r: InspectResult) => void>()
const pendingRender = new Map<string, (r: RenderResult) => void>()
const activeJobs = new Set<string>()

function getWorker(): UtilityProcess {
  if (worker) return worker
  const child = utilityProcess.fork(join(__dirname, 'worker.js'), [], { serviceName: 'Aerowis Compressor engine' })
  child.on('message', (msg: { kind: 'job-event'; event: JobEvent } | InspectResult | RenderResult) => {
    if (msg.kind === 'job-event') {
      if (msg.event.type === 'done' || msg.event.type === 'fatal') activeJobs.delete(msg.event.jobId)
      win?.webContents.send('job:event', msg.event)
    } else if (msg.kind === 'inspect') {
      pendingInspect.get(msg.reqId)?.(msg)
      pendingInspect.delete(msg.reqId)
    } else if (msg.kind === 'render') {
      pendingRender.get(msg.reqId)?.(msg)
      pendingRender.delete(msg.reqId)
    }
  })
  child.on('exit', () => {
    // A crash (usually running out of memory on a gigantic file) fails the running jobs; the next job gets a fresh worker.
    for (const jobId of activeJobs) {
      win?.webContents.send('job:event', { type: 'fatal', jobId, error: 'The processing engine stopped unexpectedly — the file may be too large or damaged.' } satisfies JobEvent)
    }
    activeJobs.clear()
    for (const done of pendingInspect.values()) done({ kind: 'inspect', reqId: '' })
    pendingInspect.clear()
    for (const done of pendingRender.values()) done({ kind: 'render', reqId: '', error: 'The processing engine stopped' })
    pendingRender.clear()
    worker = null
  })
  worker = child
  return child
}

function send(msg: WorkerRequest): void {
  getWorker().postMessage(msg)
}

const THUMB_EXTS = new Set(['jpg', 'jpeg', 'jfif', 'png', 'webp', 'avif', 'gif', 'tif', 'tiff', 'heic', 'heif', 'svg'])

function inspect(path: string, ext: string): Promise<InspectResult> {
  const thumb = THUMB_EXTS.has(ext)
  const pdf = ext === 'pdf'
  if (!thumb && !pdf) return Promise.resolve({ kind: 'inspect', reqId: '' })
  const reqId = randomUUID()
  return new Promise((resolve) => {
    pendingInspect.set(reqId, resolve)
    send({ kind: 'inspect', reqId, path, thumb, pdf })
  })
}

function render(path: string, what: 'image' | 'pdf-page', page = 1, dpi = 110): Promise<RenderResult> {
  const reqId = randomUUID()
  return new Promise((resolve) => {
    pendingRender.set(reqId, resolve)
    send({ kind: 'render', reqId, path, what, page, dpi })
  })
}

// ---------------------------------------------------------------- Preview protocol
//
// The window loads previews from preview://file?path=…  Only files the user added and files in
// the review area can be read, so the page can't be used to peek at anything else on disk.

protocol.registerSchemesAsPrivileged([{ scheme: 'preview', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

/** Formats the window can display directly; others (HEIC, TIFF) are converted for display. */
const NATIVE_IMAGES = new Set(['jpg', 'jpeg', 'jfif', 'png', 'webp', 'avif', 'gif', 'svg', 'bmp'])
const RENDERABLE_IMAGES = new Set(['tif', 'tiff', 'heic', 'heif'])
const userFiles = new Set<string>()

function registerPreviewProtocol(): void {
  protocol.handle('preview', async (request) => {
    const url = new URL(request.url)
    const path = url.searchParams.get('path') ?? ''
    if (!path || (!isStaged(path) && !userFiles.has(path))) return new Response('Not allowed', { status: 403 })
    const e = extname(path).slice(1).toLowerCase()

    let result: RenderResult | null = null
    if (e === 'pdf') {
      const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
      const dpi = Math.min(200, Math.max(50, Number(url.searchParams.get('dpi')) || 110))
      result = await render(path, 'pdf-page', page, dpi)
    } else if (NATIVE_IMAGES.has(e)) {
      return net.fetch(pathToFileURL(path).toString())
    } else if (RENDERABLE_IMAGES.has(e)) {
      result = await render(path, 'image')
    }
    if (!result?.data) return new Response(result?.error ?? 'No preview for this file type', { status: 415 })
    return new Response(Buffer.from(result.data), { headers: { 'content-type': result.mime ?? 'application/octet-stream' } })
  })
}

// ---------------------------------------------------------------- IPC

function registerIpc(): void {
  ipcMain.handle('files:pick', async (_e, extensions: string[]) => {
    const r = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Supported files', extensions }]
    })
    return r.canceled ? [] : r.filePaths
  })

  ipcMain.handle('folder:pick', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('files:describe', async (_e, paths: string[]): Promise<InputFile[]> => {
    const described = await Promise.all(
      paths.map(async (path) => {
        try {
          const s = await stat(path)
          if (!s.isFile()) return null
          const ext = extname(path).slice(1).toLowerCase()
          const info = await inspect(path, ext)
          if (!isStaged(path)) userFiles.add(path) // the user picked it, so it may be previewed
          return { path, name: basename(path), size: s.size, ext, thumb: info.thumb, pages: info.pages }
        } catch {
          return null
        }
      })
    )
    return described.filter((f): f is NonNullable<typeof f> => f !== null)
  })

  ipcMain.on('job:run', (_e, req: JobRequest) => {
    activeJobs.add(req.jobId)
    // Results always go to the review area first; the user saves them afterwards.
    send({ kind: 'job', req: { ...req, outDir: join(STAGING_ROOT, req.jobId) } })
  })

  ipcMain.on('job:discard', (_e, jobId: string) => {
    if (/^[\w-]+$/.test(jobId)) void rm(join(STAGING_ROOT, jobId), { recursive: true, force: true })
  })

  ipcMain.handle('results:save', async (_e, items: SaveItem[]): Promise<SaveOutcome[]> => {
    const outcomes: SaveOutcome[] = []
    // One at a time, so two results given the same name get "name" and "name (2)" rather than colliding.
    for (const item of items) outcomes.push(await saveItem(item))
    return outcomes
  })

  ipcMain.on('shell:reveal', (_e, path: string) => shell.showItemInFolder(path))
  ipcMain.on('shell:open', (_e, path: string) => void shell.openPath(path))
  ipcMain.on('shell:external', (_e, url: string) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url)
  })
  ipcMain.handle('office:status', () => officeStatus())
}

// ---------------------------------------------------------------- Window

function createWindow(): void {
  const isMac = process.platform === 'darwin'
  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    backgroundColor: '#0a1030',
    title: 'Aerowis Compressor',
    titleBarStyle: 'hidden',
    ...(isMac
      ? { trafficLightPosition: { x: 18, y: 18 } }
      : { titleBarOverlay: { color: '#00000000', symbolColor: '#dbe4ff', height: 48 } }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })

  win.once('ready-to-show', () => win?.show())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  if (process.env['ELECTRON_RENDERER_URL']) void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else void win.loadFile(join(__dirname, '../renderer/index.html'))

  win.on('closed', () => (win = null))
}

app.whenReady().then(() => {
  registerPreviewProtocol()
  registerIpc()
  createWindow()
  getWorker() // warm up so the first job starts instantly
  void cleanStaleStaging()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  // Anything not saved is discarded with the app.
  rmSync(STAGING_ROOT, { recursive: true, force: true })
})
