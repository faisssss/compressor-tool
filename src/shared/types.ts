export type ToolId =
  | 'compress-image'
  | 'convert-image'
  | 'resize-image'
  | 'images-to-pdf'
  | 'compress-pdf'
  | 'merge-pdf'
  | 'split-pdf'
  | 'remove-pages'
  | 'rotate-pdf'
  | 'pdf-to-images'
  | 'protect-pdf'
  | 'unlock-pdf'
  | 'office-to-pdf'
  | 'pdf-to-word'

export type OptionValue = string | number | boolean
export type ToolOptions = Record<string, OptionValue>

export interface InputFile {
  path: string
  name: string
  size: number
  ext: string
  /** Small data-URL preview for images. */
  thumb?: string
  /** Page count for PDFs. */
  pages?: number
}

export interface OutputFile {
  path: string
  name: string
  size: number
}

export type FileStatus = 'queued' | 'working' | 'done' | 'error'

export interface JobRequest {
  jobId: string
  tool: ToolId
  files: string[]
  options: ToolOptions
  /** Folder to write results into; null means "next to each original". */
  outDir: string | null
}

/** One unit of work. Batch tools produce one per input file, combine tools (merge, images → PDF) produce one. */
export interface TaskResult {
  index: number
  label: string
  inputSize: number
  outputs: OutputFile[]
  note?: string
  error?: string
}

export type JobEvent =
  | { type: 'start'; jobId: string; total: number; labels: string[] }
  | { type: 'task-start'; jobId: string; index: number }
  | { type: 'task-done'; jobId: string; result: TaskResult }
  | { type: 'done'; jobId: string }
  | { type: 'fatal'; jobId: string; error: string }

export interface OfficeStatus {
  libreOffice: string | null
  msOffice: boolean
}

/** Where a reviewed result should be saved. */
export type SaveDestination = { kind: 'beside'; original: string } | { kind: 'folder'; folder: string }

export interface SaveItem {
  /** Caller's identifier, echoed back in the outcome. */
  key: string
  /** Files in the temporary review area. Several outputs are saved together in one folder named `name`. */
  outputs: string[]
  /** New name without extension (single file) or the folder name (several files). */
  name: string
  dest: SaveDestination
}

export interface SaveOutcome {
  key: string
  saved: string[]
  error?: string
}
