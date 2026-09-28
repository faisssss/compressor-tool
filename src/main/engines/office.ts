import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { copyFile, mkdtemp, readdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { pathToFileURL } from 'url'
import type { OfficeStatus, OutputFile, ToolOptions } from '@shared/types'
import { describe, ensureDir, ext, outDirFor, stem, uniquePath } from './util'

type Kind = 'word' | 'excel' | 'powerpoint'

const KINDS: Record<string, Kind> = {
  doc: 'word', docx: 'word', odt: 'word', rtf: 'word', txt: 'word',
  xls: 'excel', xlsx: 'excel', ods: 'excel', csv: 'excel',
  ppt: 'powerpoint', pptx: 'powerpoint', odp: 'powerpoint'
}
export const OFFICE_INPUTS = Object.keys(KINDS)

function run(cmd: string, args: string[], timeoutMs = 180_000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stdout, stderr }))
      else resolve({ stdout, stderr })
    })
  })
}

// ---------------------------------------------------------------- Detection

function libreOfficeCandidates(): string[] {
  if (process.platform === 'win32') {
    const roots = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)'], 'C:\\Program Files', 'C:\\Program Files (x86)']
    return roots.filter(Boolean).map((r) => join(r!, 'LibreOffice', 'program', 'soffice.exe'))
  }
  if (process.platform === 'darwin') {
    return ['/Applications/LibreOffice.app/Contents/MacOS/soffice', join(process.env.HOME ?? '', 'Applications/LibreOffice.app/Contents/MacOS/soffice')]
  }
  return ['/usr/bin/soffice', '/usr/local/bin/soffice', '/usr/bin/libreoffice', '/snap/bin/libreoffice']
}

export function findLibreOffice(): string | null {
  return libreOfficeCandidates().find((p) => existsSync(p)) ?? null
}

const msApps: Partial<Record<Kind, boolean>> = {}

async function hasMsApp(kind: Kind): Promise<boolean> {
  if (process.platform !== 'win32') return false
  if (msApps[kind] === undefined) {
    const progId = { word: 'Word.Application', excel: 'Excel.Application', powerpoint: 'PowerPoint.Application' }[kind]
    try {
      await run('reg', ['query', `HKCR\\${progId}`], 10_000)
      msApps[kind] = true
    } catch {
      msApps[kind] = false
    }
  }
  return msApps[kind]!
}

export async function officeStatus(): Promise<OfficeStatus> {
  return { libreOffice: findLibreOffice(), msOffice: await hasMsApp('word') }
}

// ---------------------------------------------------------------- LibreOffice

interface Converted {
  file: string
  /** Temporary folder to delete once the result has been copied out. */
  work: string
}

async function viaLibreOffice(soffice: string, input: string, convertTo: string, extraArgs: string[] = []): Promise<Converted> {
  const work = await mkdtemp(join(tmpdir(), 'aerowis-'))
  // A private profile lets conversions run even while the user has LibreOffice open.
  const profile = pathToFileURL(join(work, 'profile')).href
  const outDir = join(work, 'out')
  try {
    await run(soffice, [
      `-env:UserInstallation=${profile}`,
      '--headless',
      '--norestore',
      '--nolockcheck',
      ...extraArgs,
      '--convert-to',
      convertTo,
      '--outdir',
      outDir,
      input
    ])
  } catch (e) {
    const err = e as { killed?: boolean; stderr?: string }
    await rm(work, { recursive: true, force: true })
    throw new Error(err.killed ? 'LibreOffice took too long and was stopped' : `LibreOffice failed: ${(err.stderr || String(e)).trim().split('\n').pop()}`)
  }
  const produced = existsSync(outDir) ? await readdir(outDir) : []
  if (produced.length === 0) {
    await rm(work, { recursive: true, force: true })
    throw new Error('LibreOffice could not convert this file')
  }
  return { file: join(outDir, produced[0]), work }
}

// ---------------------------------------------------------------- Microsoft Office (Windows)

const PS_SCRIPT = String.raw`
param([string]$In, [string]$Out, [string]$Kind)
$ErrorActionPreference = 'Stop'
switch ($Kind) {
  'word' {
    $app = New-Object -ComObject Word.Application
    $app.Visible = $false; $app.DisplayAlerts = 0
    try { $d = $app.Documents.Open($In, $false, $true); $d.ExportAsFixedFormat($Out, 17); $d.Close(0) } finally { $app.Quit() }
  }
  'pdf2word' {
    $app = New-Object -ComObject Word.Application
    $app.Visible = $false; $app.DisplayAlerts = 0
    try { $d = $app.Documents.Open($In, $false, $false); $d.SaveAs2($Out, 16); $d.Close(0) } finally { $app.Quit() }
  }
  'excel' {
    $app = New-Object -ComObject Excel.Application
    $app.Visible = $false; $app.DisplayAlerts = $false
    try { $w = $app.Workbooks.Open($In, 0, $true); $w.ExportAsFixedFormat(0, $Out); $w.Close($false) } finally { $app.Quit() }
  }
  'powerpoint' {
    $app = New-Object -ComObject PowerPoint.Application
    try { $p = $app.Presentations.Open($In, -1, 0, 0); $p.SaveAs($Out, 32); $p.Close() } finally { $app.Quit() }
  }
}
`

async function viaMsOffice(input: string, kind: Kind | 'pdf2word', outExt: string): Promise<Converted> {
  const work = await mkdtemp(join(tmpdir(), 'aerowis-'))
  const script = join(work, 'convert.ps1')
  const out = join(work, `${stem(input)}.${outExt}`)
  await writeFile(script, PS_SCRIPT, 'utf8')
  try {
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-In', input, '-Out', out, '-Kind', kind])
  } catch (e) {
    await rm(work, { recursive: true, force: true })
    const stderr = (e as { stderr?: string }).stderr?.trim()
    throw new Error(`Microsoft Office failed${stderr ? `: ${stderr.split('\n')[0]}` : ''}`)
  }
  if (!existsSync(out)) {
    await rm(work, { recursive: true, force: true })
    throw new Error('Microsoft Office did not produce a file')
  }
  return { file: out, work }
}

// ---------------------------------------------------------------- Tools

const NO_ENGINE = 'LibreOffice is needed for this. Install it free from libreoffice.org, then try again.'

async function deliver(converted: Converted, input: string, outDir: string | null, outExt: string): Promise<OutputFile> {
  try {
    const dir = outDirFor(input, outDir)
    await ensureDir(dir)
    const target = uniquePath(dir, stem(input), outExt)
    await copyFile(converted.file, target)
    return describe(target)
  } finally {
    await rm(converted.work, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function pickEngine(kind: Kind, preference: string): Promise<'ms' | string> {
  const soffice = findLibreOffice()
  const ms = await hasMsApp(kind)
  if (preference === 'msoffice') {
    if (!ms) throw new Error('Microsoft Office was not found on this computer')
    return 'ms'
  }
  if (preference === 'auto' && ms) return 'ms'
  if (!soffice) throw new Error(NO_ENGINE)
  return soffice
}

export async function officeToPdf(input: string, o: ToolOptions, outDir: string | null): Promise<{ outputs: OutputFile[]; note: string }> {
  const kind = KINDS[ext(input)]
  if (!kind) throw new Error('Unsupported document type')
  const engine = await pickEngine(kind, String(o.engine))
  const tmp = engine === 'ms' ? await viaMsOffice(input, kind, 'pdf') : await viaLibreOffice(engine, input, 'pdf')
  return { outputs: [await deliver(tmp, input, outDir, 'pdf')], note: engine === 'ms' ? 'Converted with Microsoft Office' : 'Converted with LibreOffice' }
}

export async function pdfToWord(input: string, o: ToolOptions, outDir: string | null): Promise<{ outputs: OutputFile[]; note: string }> {
  const engine = await pickEngine('word', String(o.engine))
  const tmp =
    engine === 'ms'
      ? await viaMsOffice(input, 'pdf2word', 'docx')
      : await viaLibreOffice(engine, input, 'docx:MS Word 2007 XML', ['--infilter=writer_pdf_import'])
  return { outputs: [await deliver(tmp, input, outDir, 'docx')], note: engine === 'ms' ? 'Converted with Microsoft Word' : 'Converted with LibreOffice' }
}
