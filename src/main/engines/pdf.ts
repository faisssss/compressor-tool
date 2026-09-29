import { readFile, writeFile, copyFile } from 'fs/promises'
import { dirname } from 'path'
import { PDFDocument, degrees } from 'pdf-lib'
import type { ToolOptions, OutputFile } from '@shared/types'
import { openImage } from './image'
import { ghostscript, qpdf, lastError } from './wasm'
import { describe, ensureDir, ext, outDirFor, parseRanges, stem, uniqueDir, uniquePath } from './util'

type Result = { outputs: OutputFile[]; note?: string }

async function loadPdf(path: string): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(await readFile(path), { updateMetadata: false })
  } catch (e) {
    if (/encrypt/i.test(String(e))) throw new Error('This PDF is password-protected — use "Unlock PDF" first')
    throw new Error('This file could not be read as a PDF')
  }
}

async function savePdf(doc: PDFDocument, dir: string, name: string): Promise<OutputFile> {
  await ensureDir(dir)
  const target = uniquePath(dir, name, 'pdf')
  await writeFile(target, await doc.save({ useObjectStreams: true }))
  return describe(target)
}

// ---------------------------------------------------------------- Images → PDF

const PAGE_SIZES: Record<string, [number, number]> = { a4: [595.28, 841.89], letter: [612, 792] }
const MARGINS: Record<string, number> = { none: 0, small: 20, large: 48 }

export async function imagesToPdf(inputs: string[], o: ToolOptions, outDir: string | null): Promise<Result> {
  const doc = await PDFDocument.create()
  const margin = MARGINS[String(o.margin)] ?? 0
  const maxSide = o.imageQuality === 'compact' ? 1600 : o.imageQuality === 'high' ? 2480 : 0
  const jpegQuality = o.imageQuality === 'compact' ? 70 : o.imageQuality === 'high' ? 85 : 92

  for (const input of inputs) {
    const img = await openImage(input)
    const meta = await img.clone().metadata()
    const untouchedJpeg = ['jpg', 'jpeg', 'jfif'].includes(ext(input)) && !maxSide && (meta.orientation ?? 1) === 1

    let embedded
    if (untouchedJpeg) {
      embedded = await doc.embedJpg(await readFile(input))
    } else {
      const sized = maxSide ? img.resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true }) : img
      if (meta.hasAlpha && o.imageQuality === 'original') {
        embedded = await doc.embedPng(await sized.png().toBuffer())
      } else {
        embedded = await doc.embedJpg(await sized.flatten({ background: '#ffffff' }).jpeg({ quality: jpegQuality, mozjpeg: true }).toBuffer())
      }
    }

    const imgW = embedded.width * 0.75 // pixels at 96 dpi → PDF points
    const imgH = embedded.height * 0.75
    let pageW: number
    let pageH: number
    if (o.pageSize === 'fit') {
      pageW = imgW + margin * 2
      pageH = imgH + margin * 2
    } else {
      ;[pageW, pageH] = PAGE_SIZES[String(o.pageSize)] ?? PAGE_SIZES.a4
      const landscape = o.orientation === 'landscape' || (o.orientation === 'auto' && imgW > imgH)
      if (landscape) [pageW, pageH] = [pageH, pageW]
    }
    const scale = Math.min((pageW - margin * 2) / imgW, (pageH - margin * 2) / imgH, o.pageSize === 'fit' ? 1 : Infinity)
    const w = imgW * scale
    const h = imgH * scale
    const page = doc.addPage([pageW, pageH])
    page.drawImage(embedded, { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h })
  }

  const dir = outDir ?? dirname(inputs[0])
  const name = inputs.length === 1 ? stem(inputs[0]) : `${stem(inputs[0])} and ${inputs.length - 1} more`
  return { outputs: [await savePdf(doc, dir, name)], note: `${inputs.length} page${inputs.length === 1 ? '' : 's'}` }
}

// ---------------------------------------------------------------- Compress (Ghostscript)

const LEVEL_ARGS: Record<string, string[]> = {
  light: ['-dPDFSETTINGS=/printer'],
  recommended: ['-dPDFSETTINGS=/ebook'],
  strong: ['-dPDFSETTINGS=/screen'],
  extreme: [
    '-dPDFSETTINGS=/screen',
    '-dDownsampleColorImages=true',
    '-dDownsampleGrayImages=true',
    '-dDownsampleMonoImages=true',
    '-dColorImageDownsampleType=/Bicubic',
    '-dGrayImageDownsampleType=/Bicubic',
    '-dColorImageResolution=50',
    '-dGrayImageResolution=50',
    '-dMonoImageResolution=150',
    '-dColorImageDownsampleThreshold=1.0',
    '-dGrayImageDownsampleThreshold=1.0'
  ]
}
const LEVEL_ORDER = ['light', 'recommended', 'strong', 'extreme']

async function gsCompress(data: Uint8Array, level: string, grayscale: boolean): Promise<Uint8Array> {
  const args = [
    '-sDEVICE=pdfwrite',
    '-dCompatibilityLevel=1.5',
    '-dDetectDuplicateImages=true',
    '-dCompressFonts=true',
    '-dSubsetFonts=true',
    ...LEVEL_ARGS[level],
    ...(grayscale ? ['-sColorConversionStrategy=Gray', '-dProcessColorModel=/DeviceGray'] : []),
    '-sOutputFile=/out.pdf',
    '/in.pdf'
  ]
  const r = await ghostscript({ '/in.pdf': data }, args)
  let out: Uint8Array | null = null
  try {
    out = r.fs.readFile('/out.pdf')
  } catch {
    // no output produced
  }
  if (r.code !== 0 || !out || out.length === 0) {
    const msg = lastError(r.log, 'Ghostscript could not process this PDF')
    if (/password|encrypt/i.test(msg)) throw new Error('This PDF is password-protected — use "Unlock PDF" first')
    throw new Error(msg)
  }
  return out
}

export async function compressPdf(input: string, o: ToolOptions, outDir: string | null): Promise<Result> {
  const data = await readFile(input)
  const grayscale = Boolean(o.grayscale)
  const dir = outDirFor(input, outDir)
  await ensureDir(dir)
  const target = uniquePath(dir, `${stem(input)}-compressed`, 'pdf')

  let best: Uint8Array
  let note: string | undefined
  if (o.mode === 'target') {
    const targetBytes = Number(o.targetKB) * 1024
    let smallest: Uint8Array | null = null
    let used = ''
    for (const level of LEVEL_ORDER) {
      const out = await gsCompress(data, level, grayscale)
      if (!smallest || out.length < smallest.length) {
        smallest = out
        used = level
      }
      if (out.length <= targetBytes) break
    }
    best = smallest!
    note = best.length <= targetBytes ? `Fit using "${used}" compression` : `Smallest possible was ${Math.round(best.length / 1024)} KB`
  } else {
    best = await gsCompress(data, String(o.level), grayscale)
  }

  if (best.length >= data.length && !grayscale) {
    await copyFile(input, target)
    return { outputs: [await describe(target)], note: 'Already well optimized — kept the original' }
  }
  await writeFile(target, best)
  return { outputs: [await describe(target)], note }
}

// ---------------------------------------------------------------- Merge / split / pages

export async function mergePdfs(inputs: string[], _o: ToolOptions, outDir: string | null): Promise<Result> {
  const merged = await PDFDocument.create()
  for (const input of inputs) {
    const src = await loadPdf(input)
    const pages = await merged.copyPages(src, src.getPageIndices())
    pages.forEach((p) => merged.addPage(p))
  }
  const dir = outDir ?? dirname(inputs[0])
  return { outputs: [await savePdf(merged, dir, `${stem(inputs[0])}-merged`)], note: `${merged.getPageCount()} pages total` }
}

async function extract(src: PDFDocument, indexes: number[]): Promise<PDFDocument> {
  const doc = await PDFDocument.create()
  const pages = await doc.copyPages(src, indexes)
  pages.forEach((p) => doc.addPage(p))
  return doc
}

const describeGroup = (g: number[]): string => (g.length === 1 ? `page-${g[0] + 1}` : `pages-${g[0] + 1}-${g[g.length - 1] + 1}`)

export async function splitPdf(input: string, o: ToolOptions, outDir: string | null): Promise<Result> {
  const src = await loadPdf(input)
  const count = src.getPageCount()
  const base = outDirFor(input, outDir)

  if (o.mode === 'extract') {
    const groups = parseRanges(String(o.ranges), count)
    const doc = await extract(src, groups.flat())
    return { outputs: [await savePdf(doc, base, `${stem(input)}-extracted`)], note: `${doc.getPageCount()} pages` }
  }

  const groups = o.mode === 'each' ? src.getPageIndices().map((i) => [i]) : parseRanges(String(o.ranges), count)
  const dir = uniqueDir(base, `${stem(input)} (split)`)
  const outputs: OutputFile[] = []
  for (const g of groups) outputs.push(await savePdf(await extract(src, g), dir, `${stem(input)}-${describeGroup(g)}`))
  return { outputs, note: `${outputs.length} files in "${stem(dir)}"` }
}

export async function removePages(input: string, o: ToolOptions, outDir: string | null): Promise<Result> {
  const src = await loadPdf(input)
  const remove = new Set(parseRanges(String(o.pages), src.getPageCount()).flat())
  const keep = src.getPageIndices().filter((i) => !remove.has(i))
  if (keep.length === 0) throw new Error('That would remove every page')
  const doc = await extract(src, keep)
  return { outputs: [await savePdf(doc, outDirFor(input, outDir), `${stem(input)}-edited`)], note: `Removed ${remove.size}, ${keep.length} left` }
}

export async function rotatePdf(input: string, o: ToolOptions, outDir: string | null): Promise<Result> {
  const doc = await loadPdf(input)
  const angle = Number(o.angle)
  const spec = String(o.pages ?? '').trim()
  const targets = spec ? new Set(parseRanges(spec, doc.getPageCount()).flat()) : null
  doc.getPages().forEach((page, i) => {
    if (targets && !targets.has(i)) return
    page.setRotation(degrees((page.getRotation().angle + angle) % 360))
  })
  return { outputs: [await savePdf(doc, outDirFor(input, outDir), `${stem(input)}-rotated`)] }
}

// ---------------------------------------------------------------- PDF → images

export async function pdfToImages(input: string, o: ToolOptions, outDir: string | null): Promise<Result> {
  const format = o.format === 'png' ? 'png' : 'jpg'
  const dpi = Number(o.dpi) || 150
  const device = format === 'png' ? ['-sDEVICE=png16m'] : ['-sDEVICE=jpeg', '-dJPEGQ=90']
  const r = await ghostscript({ '/in.pdf': await readFile(input) }, [
    ...device,
    `-r${dpi}`,
    '-dTextAlphaBits=4',
    '-dGraphicsAlphaBits=4',
    `-sOutputFile=/page-%03d.${format}`,
    '/in.pdf'
  ])
  const pages = r.fs.readdir('/').filter((f) => f.startsWith('page-')).sort()
  if (pages.length === 0) {
    const msg = lastError(r.log, 'Could not render this PDF')
    throw new Error(/password|encrypt/i.test(msg) ? 'This PDF is password-protected — use "Unlock PDF" first' : msg)
  }

  const base = outDirFor(input, outDir)
  const dir = pages.length === 1 ? base : uniqueDir(base, `${stem(input)} (images)`)
  await ensureDir(dir)
  const outputs: OutputFile[] = []
  for (const [i, page] of pages.entries()) {
    const name = pages.length === 1 ? stem(input) : `${stem(input)}-page-${String(i + 1).padStart(3, '0')}`
    const target = uniquePath(dir, name, format)
    await writeFile(target, r.fs.readFile(`/${page}`))
    outputs.push(await describe(target))
  }
  return { outputs, note: pages.length === 1 ? undefined : `${pages.length} images in "${stem(dir)}"` }
}

// ---------------------------------------------------------------- Passwords (qpdf)

async function runQpdf(input: string, args: string[], outDir: string | null, suffix: string): Promise<Result> {
  const r = await qpdf({ '/in.pdf': await readFile(input) }, [...args, '/in.pdf', '/out.pdf'])
  // qpdf exit code 3 means "succeeded with warnings".
  if (r.code !== 0 && r.code !== 3) {
    const msg = lastError(r.log, 'qpdf failed')
    if (/invalid password/i.test(msg)) throw new Error('Wrong password')
    throw new Error(msg.replace(/^.*?\/in\.pdf:\s*/, ''))
  }
  const dir = outDirFor(input, outDir)
  await ensureDir(dir)
  const target = uniquePath(dir, `${stem(input)}${suffix}`, 'pdf')
  await writeFile(target, r.fs.readFile('/out.pdf'))
  return { outputs: [await describe(target)] }
}

export async function protectPdf(input: string, o: ToolOptions, outDir: string | null): Promise<Result> {
  const password = String(o.password ?? '')
  if (!password) throw new Error('Enter a password')
  return runQpdf(input, ['--encrypt', `--user-password=${password}`, `--owner-password=${password}`, '--bits=256', '--'], outDir, '-protected')
}

export async function unlockPdf(input: string, o: ToolOptions, outDir: string | null): Promise<Result> {
  return runQpdf(input, [`--password=${String(o.password ?? '')}`, '--decrypt'], outDir, '-unlocked')
}

export async function pdfPageCount(path: string): Promise<number | undefined> {
  try {
    const doc = await PDFDocument.load(await readFile(path), { ignoreEncryption: true, updateMetadata: false })
    return doc.getPageCount()
  } catch {
    return undefined
  }
}


/** Renders one page (1-based) of a PDF to PNG for the before/after preview. */
export async function renderPdfPage(path: string, page: number, dpi: number): Promise<Buffer> {
  const r = await ghostscript({ '/in.pdf': await readFile(path) }, [
    '-sDEVICE=png16m',
    `-r${dpi}`,
    `-dFirstPage=${page}`,
    `-dLastPage=${page}`,
    '-dTextAlphaBits=4',
    '-dGraphicsAlphaBits=4',
    '-sOutputFile=/page.png',
    '/in.pdf'
  ])
  let out: Uint8Array | null = null
  try {
    out = r.fs.readFile('/page.png')
  } catch {
    // not rendered
  }
  if (!out || out.length === 0) {
    const msg = lastError(r.log, 'Could not render this page')
    throw new Error(/password|encrypt/i.test(msg) ? 'Password-protected PDF' : msg)
  }
  return Buffer.from(out)
}
