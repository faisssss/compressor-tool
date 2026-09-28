/**
 * Runs every tool against generated sample files and checks the results.
 * Usage: npm run smoke   (Office tools are skipped when LibreOffice / MS Office isn't installed)
 */
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import sharp from 'sharp'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import type { JobRequest, TaskResult, ToolId, ToolOptions } from '../src/shared/types'
import { runJob } from '../src/main/engines/runner'
import { officeStatus } from '../src/main/engines/office'

async function makePhoto(path: string, w: number, h: number): Promise<void> {
  // A gradient with shapes plus grain compresses like a real photo (pure noise would not).
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7a59"/><stop offset="1" stop-color="#3b2cc9"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="${w * 0.3}" cy="${h * 0.4}" r="${h * 0.25}" fill="#ffe066" opacity="0.8"/>
    <rect x="${w * 0.55}" y="${h * 0.5}" width="${w * 0.3}" height="${h * 0.35}" rx="40" fill="#20c997" opacity="0.7"/>
  </svg>`
  const grain = await sharp({ create: { width: w, height: h, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 18 } } }).png().toBuffer()
  await sharp(Buffer.from(svg)).composite([{ input: grain, blend: 'overlay' }]).jpeg({ quality: 96 }).toFile(path)
}

async function main(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'squeeze-smoke-'))
  const out = join(dir, 'out')
  const photo = join(dir, 'photo.jpg')
  const photo2 = join(dir, 'photo2.jpg')
  const logo = join(dir, 'logo.png')
  const pdf = join(dir, 'report.pdf')
  const pdf2 = join(dir, 'appendix.pdf')
  const doc = join(dir, 'letter.rtf')

  await makePhoto(photo, 3000, 2000)
  await makePhoto(photo2, 1200, 1600)
  await sharp({ create: { width: 800, height: 800, channels: 4, background: { r: 120, g: 60, b: 220, alpha: 0.6 } } }).png().toFile(logo)

  const photoBytes = await sharp(photo).toBuffer()
  const makePdf = async (path: string, pages: number): Promise<void> => {
    const d = await PDFDocument.create()
    const font = await d.embedFont(StandardFonts.Helvetica)
    const img = await d.embedJpg(photoBytes)
    for (let i = 0; i < pages; i++) {
      const p = d.addPage([595, 842])
      p.drawImage(img, { x: 40, y: 300, width: 515, height: 343 })
      p.drawText(`Page ${i + 1}`, { x: 40, y: 200, size: 28, font })
    }
    await writeFile(path, await d.save())
  }
  await makePdf(pdf, 5)
  await makePdf(pdf2, 2)
  await writeFile(doc, '{\\rtf1\\ansi{\\fonttbl\\f0\\fswiss Helvetica;}\\f0\\pard {\\b Hello} from Squeeze.\\par}')

  const cases: { tool: ToolId; files: string[]; options: ToolOptions; check?: (r: TaskResult[]) => string | null }[] = [
    { tool: 'compress-image', files: [photo, photo2], options: { mode: 'quality', level: 'balanced', format: 'same', maxSide: '0', strip: true } },
    {
      tool: 'compress-image',
      files: [photo],
      options: { mode: 'target', targetKB: 70, format: 'jpg', maxSide: '0', strip: true },
      check: (r) => (r[0].outputs[0].size <= 70 * 1024 ? null : `target missed: ${r[0].outputs[0].size}`)
    },
    {
      tool: 'compress-image',
      files: [logo],
      options: { mode: 'target', targetKB: 10, format: 'same', maxSide: '0', strip: true },
      check: (r) => (r[0].outputs[0].size <= 10 * 1024 ? null : `target missed: ${r[0].outputs[0].size}`)
    },
    { tool: 'compress-image', files: [photo], options: { mode: 'quality', level: 'small', format: 'webp', maxSide: '1920', strip: true } },
    { tool: 'convert-image', files: [photo], options: { format: 'png', quality: 90, strip: false } },
    { tool: 'convert-image', files: [logo], options: { format: 'jpeg', quality: 90, strip: false }, check: (r) => (r[0].outputs[0].name.endsWith('.jpeg') ? null : 'wrong extension') },
    { tool: 'convert-image', files: [photo2], options: { format: 'avif', quality: 70, strip: true } },
    { tool: 'resize-image', files: [photo], options: { by: 'percent', percent: 25 }, check: (r) => (r[0].note === '3000×2000 → 750×500' ? null : `bad size ${r[0].note}`) },
    { tool: 'resize-image', files: [photo], options: { by: 'pixels', width: 800, height: 0, fit: 'inside', enlarge: false } },
    { tool: 'images-to-pdf', files: [photo, photo2, logo], options: { pageSize: 'a4', orientation: 'auto', margin: 'small', imageQuality: 'high' } },
    { tool: 'images-to-pdf', files: [photo2], options: { pageSize: 'fit', orientation: 'auto', margin: 'none', imageQuality: 'original' } },
    { tool: 'compress-pdf', files: [pdf], options: { mode: 'level', level: 'recommended', grayscale: false } },
    {
      tool: 'compress-pdf',
      files: [pdf],
      options: { mode: 'target', targetKB: 300, grayscale: false },
      check: (r) => (r[0].outputs[0].size <= 300 * 1024 ? null : `target missed: ${r[0].outputs[0].size}`)
    },
    { tool: 'merge-pdf', files: [pdf, pdf2], options: {}, check: (r) => (r[0].note === '7 pages total' ? null : `bad merge ${r[0].note}`) },
    { tool: 'split-pdf', files: [pdf], options: { mode: 'each', ranges: '' }, check: (r) => (r[0].outputs.length === 5 ? null : 'expected 5 files') },
    { tool: 'split-pdf', files: [pdf], options: { mode: 'ranges', ranges: '1-2, 3-' }, check: (r) => (r[0].outputs.length === 2 ? null : 'expected 2 files') },
    { tool: 'split-pdf', files: [pdf], options: { mode: 'extract', ranges: '1, 4-5' }, check: (r) => (r[0].note === '3 pages' ? null : `bad extract ${r[0].note}`) },
    { tool: 'split-pdf', files: [pdf], options: { mode: 'ranges', ranges: '9' }, check: (r) => (r[0].error?.includes('out of range') ? null : 'expected range error') },
    { tool: 'remove-pages', files: [pdf], options: { pages: '2, 4' }, check: (r) => (r[0].note === 'Removed 2, 3 left' ? null : `bad remove ${r[0].note}`) },
    { tool: 'rotate-pdf', files: [pdf], options: { angle: '90', pages: '' } },
    { tool: 'pdf-to-images', files: [pdf], options: { format: 'jpg', dpi: '72' }, check: (r) => (r[0].outputs.length === 5 ? null : 'expected 5 images') },
    { tool: 'protect-pdf', files: [pdf2], options: { password: 's3cret' } }
  ]

  const status = await officeStatus()
  const office = Boolean(status.libreOffice || status.msOffice)
  if (office) {
    cases.push({ tool: 'office-to-pdf', files: [doc], options: { engine: 'auto' } })
    cases.push({ tool: 'pdf-to-word', files: [pdf2], options: { engine: 'auto' } })
  }

  let failures = 0
  let protectedPdf = ''
  const run = async (c: (typeof cases)[number]): Promise<TaskResult[]> => {
    const req: JobRequest = { jobId: 'smoke', tool: c.tool, files: c.files, options: c.options, outDir: out }
    const results: TaskResult[] = []
    await runJob(req, (e) => {
      if (e.type === 'task-done') results.push(e.result)
      if (e.type === 'fatal') results.push({ index: 0, label: '', inputSize: 0, outputs: [], error: e.error })
    })
    return results.sort((a, b) => a.index - b.index)
  }

  for (const c of cases) {
    const started = Date.now()
    const results = await run(c)
    const expectsError = c.check?.toString().includes('error')
    const error = expectsError ? null : results.find((r) => r.error)?.error
    const problem = error ?? c.check?.(results) ?? null
    const summary = results
      .map((r) => `${(r.inputSize / 1024).toFixed(0)}KB→${(r.outputs.reduce((s, o) => s + o.size, 0) / 1024).toFixed(0)}KB${r.note ? ` (${r.note})` : ''}`)
      .join(', ')
    console.log(`${problem ? '✗' : '✓'} ${c.tool.padEnd(15)} ${String(Date.now() - started).padStart(5)}ms  ${problem ?? summary}`)
    if (problem) failures++
    if (c.tool === 'protect-pdf' && !problem) protectedPdf = results[0].outputs[0].path
  }

  // Unlock round-trip: wrong password must fail, right one must succeed.
  if (protectedPdf) {
    const wrong = await run({ tool: 'unlock-pdf', files: [protectedPdf], options: { password: 'nope' } })
    const right = await run({ tool: 'unlock-pdf', files: [protectedPdf], options: { password: 's3cret' } })
    const ok = wrong[0].error === 'Wrong password' && !right[0].error
    console.log(`${ok ? '✓' : '✗'} unlock-pdf       wrong password → "${wrong[0].error}", right password → ${right[0].error ?? 'unlocked'}`)
    if (!ok) failures++
  }
  if (!office) console.log('- office tools skipped (no LibreOffice or Microsoft Office found)')

  await rm(dir, { recursive: true, force: true })
  console.log(failures ? `\n${failures} failure(s)` : '\nAll good.')
  process.exit(failures ? 1 : 0)
}

void main()
