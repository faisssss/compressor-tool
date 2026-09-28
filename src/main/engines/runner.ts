import { basename } from 'path'
import { stat } from 'fs/promises'
import type { JobEvent, JobRequest, OutputFile, TaskResult, ToolId, ToolOptions } from '@shared/types'
import { compressImage, convertImage, resizeImage } from './image'
import { compressPdf, imagesToPdf, mergePdfs, pdfToImages, protectPdf, removePages, rotatePdf, splitPdf, unlockPdf } from './pdf'
import { officeToPdf, pdfToWord } from './office'
import { errorMessage } from './util'

type Outcome = { outputs: OutputFile[]; note?: string }
type PerFile = (input: string, o: ToolOptions, outDir: string | null) => Promise<Outcome>
type Combine = (inputs: string[], o: ToolOptions, outDir: string | null) => Promise<Outcome>

const PER_FILE: Partial<Record<ToolId, PerFile>> = {
  'compress-image': compressImage,
  'convert-image': convertImage,
  'resize-image': resizeImage,
  'compress-pdf': compressPdf,
  'split-pdf': splitPdf,
  'remove-pages': removePages,
  'rotate-pdf': rotatePdf,
  'pdf-to-images': pdfToImages,
  'protect-pdf': protectPdf,
  'unlock-pdf': unlockPdf,
  'office-to-pdf': officeToPdf,
  'pdf-to-word': pdfToWord
}

const COMBINE: Partial<Record<ToolId, Combine>> = {
  'images-to-pdf': imagesToPdf,
  'merge-pdf': mergePdfs
}

/** Image work is light enough to run a few files side by side; PDF and Office work goes one at a time. */
const PARALLEL: Partial<Record<ToolId, number>> = { 'compress-image': 3, 'convert-image': 3, 'resize-image': 3 }

const sizeOf = async (p: string): Promise<number> => (await stat(p).catch(() => ({ size: 0 }))).size

export async function runJob(req: JobRequest, emit: (e: JobEvent) => void): Promise<void> {
  const { jobId, tool, files, options, outDir } = req
  const combine = COMBINE[tool]

  if (combine) {
    const label = files.length === 1 ? basename(files[0]) : `${files.length} files`
    emit({ type: 'start', jobId, total: 1, labels: [label] })
    emit({ type: 'task-start', jobId, index: 0 })
    const inputSize = (await Promise.all(files.map(sizeOf))).reduce((a, b) => a + b, 0)
    let result: TaskResult
    try {
      result = { index: 0, label, inputSize, ...(await combine(files, options, outDir)) }
    } catch (e) {
      result = { index: 0, label, inputSize, outputs: [], error: errorMessage(e) }
    }
    emit({ type: 'task-done', jobId, result })
    emit({ type: 'done', jobId })
    return
  }

  const perFile = PER_FILE[tool]
  if (!perFile) {
    emit({ type: 'fatal', jobId, error: `Unknown tool: ${tool}` })
    return
  }

  emit({ type: 'start', jobId, total: files.length, labels: files.map((f) => basename(f)) })
  let next = 0
  const workerLoop = async (): Promise<void> => {
    while (next < files.length) {
      const index = next++
      const input = files[index]
      emit({ type: 'task-start', jobId, index })
      const inputSize = await sizeOf(input)
      let result: TaskResult
      try {
        result = { index, label: basename(input), inputSize, ...(await perFile(input, options, outDir)) }
      } catch (e) {
        result = { index, label: basename(input), inputSize, outputs: [], error: errorMessage(e) }
      }
      emit({ type: 'task-done', jobId, result })
    }
  }
  const lanes = Math.min(PARALLEL[tool] ?? 1, files.length)
  await Promise.all(Array.from({ length: lanes }, workerLoop))
  emit({ type: 'done', jobId })
}
