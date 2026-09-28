import { existsSync } from 'fs'
import { mkdir, stat } from 'fs/promises'
import { basename, dirname, extname, join } from 'path'
import type { OutputFile } from '@shared/types'

export const ext = (p: string): string => extname(p).slice(1).toLowerCase()
export const stem = (p: string): string => basename(p, extname(p))

/** Returns a path that does not exist yet, so originals and earlier results are never overwritten. */
export function uniquePath(dir: string, name: string, extension: string): string {
  let candidate = join(dir, `${name}.${extension}`)
  for (let i = 2; existsSync(candidate); i++) candidate = join(dir, `${name} (${i}).${extension}`)
  return candidate
}

export function uniqueDir(dir: string, name: string): string {
  let candidate = join(dir, name)
  for (let i = 2; existsSync(candidate); i++) candidate = join(dir, `${name} (${i})`)
  return candidate
}

export function outDirFor(input: string, outDir: string | null): string {
  return outDir ?? dirname(input)
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

export async function describe(path: string): Promise<OutputFile> {
  const s = await stat(path)
  return { path, name: basename(path), size: s.size }
}

/**
 * Parses page ranges like "1-3, 5, 8-" into groups of zero-based page indexes.
 * Each comma-separated part becomes one group; "8-" means page 8 to the end.
 */
export function parseRanges(spec: string, pageCount: number): number[][] {
  const groups: number[][] = []
  for (const raw of spec.split(/[,;]/)) {
    const part = raw.trim()
    if (!part) continue
    const m = /^(\d*)\s*-\s*(\d*)$/.exec(part)
    let from: number
    let to: number
    if (m) {
      from = m[1] ? parseInt(m[1], 10) : 1
      to = m[2] ? parseInt(m[2], 10) : pageCount
    } else if (/^\d+$/.test(part)) {
      from = to = parseInt(part, 10)
    } else {
      throw new Error(`"${part}" is not a valid page or range`)
    }
    if (from < 1 || to < 1 || from > pageCount || to > pageCount) {
      throw new Error(`Page ${Math.max(from, to)} is out of range (document has ${pageCount} pages)`)
    }
    const group: number[] = []
    const step = from <= to ? 1 : -1
    for (let p = from; p !== to + step; p += step) group.push(p - 1)
    groups.push(group)
  }
  if (groups.length === 0) throw new Error('Enter at least one page or range, e.g. 1-3, 5')
  return groups
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
