import { app, BrowserWindow, dialog, ipcMain, shell, utilityProcess, type UtilityProcess } from 'electron'
import { randomUUID } from 'crypto'
import { stat } from 'fs/promises'
import { basename, extname, join } from 'path'
import type { InputFile, JobEvent, JobRequest } from '@shared/types'
import type { InspectResult, WorkerRequest } from './worker'
import { officeStatus } from './engines/office'

let win: BrowserWindow | null = null

// ---------------------------------------------------------------- Worker process

let worker: UtilityProcess | null = null
const pendingInspect = new Map<string, (r: InspectResult) => void>()
const activeJobs = new Set<string>()

function getWorker(): UtilityProcess {
  if (worker) return worker
  const child = utilityProcess.fork(join(__dirname, 'worker.js'), [], { serviceName: 'Aerowis Compressor engine' })
  child.on('message', (msg: { kind: 'job-event'; event: JobEvent } | InspectResult) => {
    if (msg.kind === 'job-event') {
      if (msg.event.type === 'done' || msg.event.type === 'fatal') activeJobs.delete(msg.event.jobId)
      win?.webContents.send('job:event', msg.event)
    } else if (msg.kind === 'inspect') {
      pendingInspect.get(msg.reqId)?.(msg)
      pendingInspect.delete(msg.reqId)
    }
  })
  child.on('exit', () => {
    // A crash (usually running out of memory on a gigantic file) fails the running jobs; the next job gets a fresh worker.
    for (const jobId of activeJobs) {
      win?.webContents.send('job:event', { type: 'fatal', jobId, error: 'The processing engine stopped unexpectedly — the file may be too large or damaged.' } satisfies JobEvent)
    }
    activeJobs.clear()
    for (const resolve of pendingInspect.values()) resolve({ kind: 'inspect', reqId: '' })
    pendingInspect.clear()
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
    send({ kind: 'job', req })
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
    backgroundColor: '#070c26',
    title: 'Aerowis Compressor',
    titleBarStyle: 'hidden',
    ...(isMac
      ? { trafficLightPosition: { x: 18, y: 18 } }
      : { titleBarOverlay: { color: '#00000000', symbolColor: '#e9e7ff', height: 48 } }),
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
  registerIpc()
  createWindow()
  getWorker() // warm up so the first job starts instantly
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
