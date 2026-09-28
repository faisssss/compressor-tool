import { readFile, writeFile, stat } from 'fs/promises'
import sharp, { type Sharp } from 'sharp'
import type { ToolOptions, OutputFile } from '@shared/types'
import { describe, ext, outDirFor, ensureDir, stem, uniquePath } from './util'

// Big photos and scans are fine, but refuse absurd "decompression bomb" images (~268 MP is sharp's own default).
sharp.cache(false)

export type ImageFormat = 'jpg' | 'jpeg' | 'png' | 'webp' | 'avif' | 'gif' | 'tiff'

export const IMAGE_INPUTS = ['jpg', 'jpeg', 'jfif', 'png', 'webp', 'avif', 'gif', 'tif', 'tiff', 'heic', 'heif', 'svg']

/** Format a file keeps when the user picks "same as original". */
export function naturalFormat(path: string): ImageFormat {
  switch (ext(path)) {
    case 'jpeg':
      return 'jpeg'
    case 'png':
    case 'svg':
      return 'png'
    case 'webp':
      return 'webp'
    case 'avif':
      return 'avif'
    case 'gif':
      return 'gif'
    case 'tif':
    case 'tiff':
      return 'tiff'
    default:
      return 'jpg' // jpg, jfif, heic, heif
  }
}

const sameFormat = (a: ImageFormat, b: ImageFormat): boolean =>
  a === b || ((a === 'jpg' || a === 'jpeg') && (b === 'jpg' || b === 'jpeg'))

/** Opens any supported image as a sharp pipeline, upright according to its EXIF orientation. */
export async function openImage(path: string): Promise<Sharp> {
  const e = ext(path)
  if (e === 'heic' || e === 'heif') {
    // sharp's prebuilt binaries can't decode HEIC (patent-encumbered), so decode it with libheif first.
    const convert = require('heic-convert') as (o: { buffer: Buffer; format: 'PNG' | 'JPEG'; quality?: number }) => Promise<ArrayBuffer>
    const png = Buffer.from(await convert({ buffer: await readFile(path), format: 'PNG' }))
    return sharp(png, { limitInputPixels: 268_402_689 })
  }
  return sharp(path, { limitInputPixels: 268_402_689, density: e === 'svg' ? 300 : undefined, animated: e === 'gif' }).rotate()
}

function applyFormat(img: Sharp, format: ImageFormat, quality: number): Sharp {
  const q = Math.max(1, Math.min(100, Math.round(quality)))
  switch (format) {
    case 'jpg':
    case 'jpeg':
      // JPEG has no transparency: put transparent areas on white instead of black.
      return img.flatten({ background: '#ffffff' }).jpeg({ quality: q, mozjpeg: true })
    case 'webp':
      return img.webp({ quality: q, effort: 5 })
    case 'avif':
      return img.avif({ quality: Math.max(1, q - 10), effort: 2 })
    case 'png':
      // PNG is lossless unless a quality below 100 asks for colour-palette reduction (the big PNG saver).
      return q >= 100 ? img.png({ compressionLevel: 8 }) : img.png({ palette: true, quality: q, compressionLevel: 9, effort: 6 })
    case 'gif':
      return img.gif({ effort: 8 })
    case 'tiff':
      return img.tiff({ compression: 'lzw' })
  }
}

async function encode(img: Sharp, format: ImageFormat, quality: number, keepMeta: boolean): Promise<Buffer> {
  let pipeline = img.clone()
  if (keepMeta) pipeline = pipeline.keepMetadata()
  return applyFormat(pipeline, format, quality).toBuffer()
}

function limitSize(img: Sharp, maxSide: number): Sharp {
  if (!maxSide) return img
  return img.resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
}

/**
 * Finds the highest quality that fits under `targetBytes`, using a binary search over quality.
 * If even the lowest sensible quality is too big, the image is scaled down and the search repeats.
 */
async function encodeToTarget(src: Sharp, format: ImageFormat, targetBytes: number): Promise<{ data: Buffer; scale: number; quality: number }> {
  // Decode once to raw pixels so every attempt starts from the same bitmap.
  const { data: raw, info } = await src.clone().raw().toBuffer({ resolveWithObject: true })
  const fromRaw = (w: number, h: number): Sharp => {
    const base = sharp(raw, { raw: { width: info.width, height: info.height, channels: info.channels } })
    return w === info.width ? base : base.resize({ width: w, height: h, fit: 'fill' })
  }

  let scale = 1
  let smallest: { data: Buffer; scale: number; quality: number } | null = null
  const minQuality = format === 'png' ? 1 : 8

  for (let round = 0; round < 10; round++) {
    const w = Math.max(16, Math.round(info.width * scale))
    const h = Math.max(16, Math.round(info.height * scale))
    const img = fromRaw(w, h)

    let lo = minQuality
    let hi = 92
    let best: Buffer | null = null
    let bestQ = lo
    while (lo <= hi) {
      const q = Math.floor((lo + hi) / 2)
      const out = await applyFormat(img.clone(), format, q).toBuffer()
      if (out.length <= targetBytes) {
        best = out
        bestQ = q
        lo = q + 1
      } else {
        if (!smallest || out.length < smallest.data.length) smallest = { data: out, scale, quality: q }
        hi = q - 1
      }
    }
    if (best) return { data: best, scale, quality: bestQ }
    if (w <= 16 || h <= 16) break

    // Shrink by roughly the amount still missing (file size scales with pixel area), within sane steps.
    const lowest = await applyFormat(img.clone(), format, minQuality).toBuffer()
    const factor = Math.sqrt(targetBytes / lowest.length) * 0.95
    scale *= Math.min(0.9, Math.max(0.35, factor))
  }
  if (!smallest) throw new Error('Could not compress this image')
  return smallest
}

const LEVELS: Record<string, number> = { best: 86, balanced: 74, small: 58, tiny: 40 }

async function writeResult(input: string, outDir: string | null, suffix: string, format: ImageFormat, data: Buffer): Promise<OutputFile> {
  const dir = outDirFor(input, outDir)
  await ensureDir(dir)
  const target = uniquePath(dir, `${stem(input)}${suffix}`, format)
  await writeFile(target, data)
  return describe(target)
}

export async function compressImage(input: string, o: ToolOptions, outDir: string | null): Promise<{ outputs: OutputFile[]; note?: string }> {
  const format = o.format === 'same' ? naturalFormat(input) : (o.format as ImageFormat)
  const original = (await stat(input)).size
  const img = limitSize(await openImage(input), Number(o.maxSide))

  if (o.mode === 'target') {
    const targetBytes = Math.max(1, Number(o.targetKB)) * 1024
    const { data, scale, quality } = await encodeToTarget(img, format, targetBytes)
    const notes: string[] = []
    if (data.length > targetBytes) notes.push(`Smallest possible was ${Math.round(data.length / 1024)} KB`)
    if (scale < 1) notes.push(`resized to ${Math.round(scale * 100)}% to fit`)
    notes.push(`quality ${quality}`)
    return { outputs: [await writeResult(input, outDir, '-compressed', format, data)], note: notes.join(' · ') }
  }

  const quality = LEVELS[String(o.level)] ?? 74
  const data = await encode(img, format, quality, !o.strip)
  if (sameFormat(format, naturalFormat(input)) && data.length >= original && !Number(o.maxSide)) {
    // Never hand back a bigger file than the user started with.
    return { outputs: [await writeResult(input, outDir, '-compressed', format, await readFile(input))], note: 'Already well optimized — kept the original' }
  }
  return { outputs: [await writeResult(input, outDir, '-compressed', format, data)] }
}

export async function convertImage(input: string, o: ToolOptions, outDir: string | null): Promise<{ outputs: OutputFile[] }> {
  const format = o.format as ImageFormat
  const img = await openImage(input)
  // Converting to PNG should never lose quality; the quality slider only applies to lossy formats.
  const data = await encode(img, format, format === 'png' ? 100 : Number(o.quality), !o.strip)
  return { outputs: [await writeResult(input, outDir, '', format, data)] }
}

export async function resizeImage(input: string, o: ToolOptions, outDir: string | null): Promise<{ outputs: OutputFile[]; note: string }> {
  const format = naturalFormat(input)
  const img = await openImage(input)
  const meta = await img.clone().metadata()
  const srcW = meta.autoOrient?.width ?? meta.width ?? 0
  const srcH = meta.autoOrient?.height ?? meta.height ?? 0

  let resized: Sharp
  if (o.by === 'percent') {
    const p = Math.max(1, Number(o.percent)) / 100
    resized = img.resize({ width: Math.max(1, Math.round(srcW * p)), height: Math.max(1, Math.round(srcH * p)), fit: 'fill' })
  } else {
    const width = Number(o.width) || undefined
    const height = Number(o.height) || undefined
    if (!width && !height) throw new Error('Enter a width, a height, or both')
    const fit = width && height ? (o.fit as 'inside' | 'cover' | 'fill') : 'inside'
    resized = img.resize({ width, height, fit, withoutEnlargement: !o.enlarge })
  }
  const data = await encode(resized, format, 90, true)
  const out = await sharp(data).metadata()
  return {
    outputs: [await writeResult(input, outDir, '-resized', format, data)],
    note: `${srcW}×${srcH} → ${out.width}×${out.height}`
  }
}

/** Tiny preview for the file list in the UI. */
export async function thumbnail(path: string): Promise<string | undefined> {
  try {
    const img = await openImage(path)
    const buf = await img.resize({ width: 112, height: 112, fit: 'cover' }).webp({ quality: 60 }).toBuffer()
    return `data:image/webp;base64,${buf.toString('base64')}`
  } catch {
    return undefined
  }
}
