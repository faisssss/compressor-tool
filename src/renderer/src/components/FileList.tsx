import { Reorder } from 'framer-motion'
import { File, FileText, GripVertical, Plus, X } from 'lucide-react'
import type { InputFile } from '@shared/types'
import type { ToolDef } from '../tools/registry'
import { formatBytes } from '../lib/format'

interface Props {
  tool: ToolDef
  files: InputFile[]
  onReorder: (files: InputFile[]) => void
  onRemove: (path: string) => void
  onAdd: () => void
  onClear: () => void
}

export default function FileList({ tool, files, onReorder, onRemove, onAdd, onClear }: Props): React.JSX.Element {
  const total = files.reduce((s, f) => s + f.size, 0)
  return (
    <div className="panel flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="text-[13px] text-white/55">
          <span className="font-medium text-white">
            {files.length} file{files.length === 1 ? '' : 's'}
          </span>{' '}
          · {formatBytes(total)}
          {tool.combine && files.length > 1 && <span className="ml-2 text-white/40">Drag to change the order</span>}
        </div>
        <div className="flex gap-1.5">
          <button onClick={onClear} className="rounded-md px-2.5 py-1.5 text-[12.5px] text-white/50 transition-colors hover:bg-white/5 hover:text-white">
            Clear
          </button>
          <button onClick={onAdd} className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[12.5px] font-medium transition-colors hover:border-line-strong hover:bg-white/5">
            <Plus className="h-3.5 w-3.5" /> Add files
          </button>
        </div>
      </div>

      <Reorder.Group axis="y" values={files} onReorder={onReorder} className="min-h-0 flex-1 overflow-y-auto p-2" layoutScroll>
        {files.map((f, i) => (
          <Reorder.Item
            key={f.path}
            value={f}
            dragListener={Boolean(tool.combine)}
            className={`group flex items-center gap-3 rounded-lg bg-surface px-2.5 py-2 transition-colors hover:bg-surface-2 ${
              tool.combine ? 'cursor-grab active:cursor-grabbing' : ''
            }`}
          >
            {tool.combine && (
              <div className="flex w-5 flex-col items-center text-white/30">
                <GripVertical className="h-4 w-4" />
                <span className="text-[10px] tabular-nums">{i + 1}</span>
              </div>
            )}
            <Thumb file={f} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{f.name}</div>
              <div className="text-[12px] text-white/45">
                {formatBytes(f.size)}
                {f.pages !== undefined && ` · ${f.pages} page${f.pages === 1 ? '' : 's'}`}
              </div>
            </div>
            <span className="text-[10.5px] font-medium uppercase text-white/35">{f.ext}</span>
            <button
              onClick={() => onRemove(f.path)}
              onPointerDown={(e) => e.stopPropagation()}
              className="rounded-md p-1.5 text-white/30 opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100"
              title="Remove"
            >
              <X className="h-4 w-4" />
            </button>
          </Reorder.Item>
        ))}
      </Reorder.Group>
    </div>
  )
}

export function Thumb({ file }: { file: InputFile }): React.JSX.Element {
  if (file.thumb) return <img src={file.thumb} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" draggable={false} />
  return <FileIcon ext={file.ext} />
}

export function FileIcon({ ext }: { ext: string }): React.JSX.Element {
  const Icon = ext === 'pdf' || ext.startsWith('doc') ? FileText : File
  return (
    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-surface-3">
      <Icon className="h-5 w-5 text-white/60" />
    </div>
  )
}
