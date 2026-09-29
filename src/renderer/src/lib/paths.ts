/** Small path helpers for the UI (paths may use / or \ depending on the OS). */

export const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p
export const dirName = (p: string): string => p.slice(0, Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')))

export function splitName(fileName: string): { stem: string; ext: string } {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? { stem: fileName.slice(0, dot), ext: fileName.slice(dot + 1) } : { stem: fileName, ext: '' }
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'jfif', 'png', 'webp', 'avif', 'gif', 'svg', 'bmp', 'tif', 'tiff', 'heic', 'heif'])

export function kindOf(path: string): 'image' | 'pdf' | 'other' {
  const ext = splitName(baseName(path)).ext.toLowerCase()
  if (ext === 'pdf') return 'pdf'
  return IMAGE_EXTS.has(ext) ? 'image' : 'other'
}

/** URL the window can load to display a file (or one PDF page) — served by the main process. */
export function previewUrl(path: string, page?: number): string {
  const q = new URLSearchParams({ path })
  if (page) q.set('page', String(page))
  return `preview://file/?${q.toString()}`
}
