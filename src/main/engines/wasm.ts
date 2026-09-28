import { readFileSync } from 'fs'
import { dirname, join } from 'path'

/**
 * Ghostscript and qpdf are shipped as WebAssembly, so they run identically on Windows and macOS
 * with nothing extra to install. Each call gets a fresh instance: both tools keep global state,
 * and a fresh instance also releases its memory as soon as the job finishes.
 */

interface EmscriptenFS {
  writeFile(path: string, data: Uint8Array): void
  readFile(path: string): Uint8Array
  readdir(path: string): string[]
  mkdir(path: string): void
}

interface EmscriptenModule {
  FS: EmscriptenFS
  callMain(args: string[]): number
}

type Factory = (opts: Record<string, unknown>) => Promise<EmscriptenModule>

/** In the packaged app the .wasm files live in app.asar.unpacked (see electron-builder.yml). */
function unpacked(p: string): string {
  return p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')
}

const wasmCache = new Map<string, Buffer>()

/**
 * The qpdf build ignores print/printErr and writes straight to console.log/console.error, binding them
 * when the module is created. Route the console through a sink so a run's output can be captured.
 * callMain is synchronous, so only one run can be writing at a time.
 */
let sink: string[] | null = null
for (const method of ['log', 'error'] as const) {
  const original = console[method].bind(console)
  console[method] = (...args: unknown[]) => (sink ? void sink.push(args.map(String).join(' ')) : original(...args))
}

function loadWasm(path: string): Buffer {
  let bytes = wasmCache.get(path)
  if (!bytes) {
    bytes = readFileSync(unpacked(path))
    wasmCache.set(path, bytes)
  }
  return bytes
}

async function instantiate(factory: Factory, wasmPath: string, log: string[]): Promise<EmscriptenModule> {
  const bytes = loadWasm(wasmPath)
  return factory({
    noInitialRun: true,
    print: (s: string) => log.push(s),
    printErr: (s: string) => log.push(s),
    // Supplying the binary ourselves avoids the loader's fetch/URL logic, which trips over plain file paths.
    instantiateWasm(imports: WebAssembly.Imports, done: (i: WebAssembly.Instance, m: WebAssembly.Module) => void) {
      WebAssembly.instantiate(new Uint8Array(bytes), imports).then((r) => done(r.instance, r.module))
      return {}
    }
  })
}

export interface WasmRun {
  code: number
  fs: EmscriptenFS
  log: string[]
}

async function run(factory: Factory, wasmPath: string, files: Record<string, Uint8Array>, args: string[]): Promise<WasmRun> {
  const log: string[] = []
  const mod = await instantiate(factory, wasmPath, log)
  for (const [name, data] of Object.entries(files)) mod.FS.writeFile(name, data)
  let code: number
  sink = log
  try {
    code = mod.callMain(args)
  } catch (e) {
    const status = (e as { status?: number }).status
    if (typeof status !== 'number') throw e
    code = status
  } finally {
    sink = null
  }
  return { code, fs: mod.FS, log }
}

const gsEntry = require.resolve('@jspawn/ghostscript-wasm')
const qpdfEntry = require.resolve('@neslinesli93/qpdf-wasm')

export function ghostscript(files: Record<string, Uint8Array>, args: string[]): Promise<WasmRun> {
  const factory = require('@jspawn/ghostscript-wasm') as Factory
  return run(factory, join(dirname(gsEntry), 'gs.wasm'), files, [
    '-dNOPAUSE',
    '-dBATCH',
    '-dSAFER',
    '-dQUIET',
    ...args
  ])
}

export function qpdf(files: Record<string, Uint8Array>, args: string[]): Promise<WasmRun> {
  const mod = require('@neslinesli93/qpdf-wasm') as { default?: Factory } & Factory
  const factory = mod.default ?? mod
  return run(factory, join(dirname(qpdfEntry), 'qpdf.wasm'), files, args)
}

/** Picks the most useful line out of a tool's output for an error message. */
export function lastError(log: string[], fallback: string): string {
  const lines = log.map((l) => l.trim()).filter(Boolean)
  const err = [...lines].reverse().find((l) => /error|invalid|password|unable|fail/i.test(l))
  return err ?? lines[lines.length - 1] ?? fallback
}
