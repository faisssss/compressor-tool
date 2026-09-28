import { AnimatePresence, Reorder, motion } from 'framer-motion'
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
    <div className="glass flex h-full min-h-0 flex-col rounded-[24px]">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
        <div className="text-[13px] text-white/60">
          <span className="font-display text-base font-semibold text-white">{files.length}</span> file{files.length === 1 ? '' : 's'} ·{' '}
          {formatBytes(total)}
          {tool.combine && files.length > 1 && <span className="ml-2 text-white/40">— drag to set the order</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={onClear} className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-white/50 hover:bg-white/5 hover:text-white">
            Clear
          </button>
          <button onClick={onAdd} className="flex items-center gap-1.5 rounded-lg bg-white/[0.08] px-3 py-1.5 text-[12.5px] font-semibold hover:bg-white/[0.14]">
            <Plus className="h-3.5 w-3.5" /> Add files
          </button>
        </div>
      </div>

      <Reorder.Group axis="y" values={files} onReorder={onReorder} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3" layoutScroll>
        <AnimatePresence initial={false}>
          {files.map((f, i) => (
            <Reorder.Item
              key={f.path}
              value={f}
              dragListener={Boolean(tool.combine)}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24, transition: { duration: 0.15 } }}
              whileDrag={{ scale: 1.02, boxShadow: '0 20px 40px -12px rgb(0 0 0 / 0.7)' }}
              className={`group flex items-center gap-3 rounded-2xl border border-white/[0.05] bg-white/[0.03] p-2.5 pr-3 transition-colors hover:bg-white/[0.06] ${
                tool.combine ? 'cursor-grab active:cursor-grabbing' : ''
              }`}
            >
              {tool.combine && (
                <div className="flex w-6 flex-col items-center text-white/30">
                  <GripVertical className="h-4 w-4" />
                  <span className="text-[10px] font-semibold tabular-nums">{i + 1}</span>
                </div>
              )}
              <Thumb file={f} colors={tool.colors} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium">{f.name}</div>
                <div className="mt-0.5 text-[12px] text-white/45">
                  {formatBytes(f.size)}
                  {f.pages !== undefined && ` · ${f.pages} page${f.pages === 1 ? '' : 's'}`}
                </div>
              </div>
              <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10.5px] uppercase text-white/50">{f.ext}</span>
              <button
                onClick={() => onRemove(f.path)}
                onPointerDown={(e) => e.stopPropagation()}
                className="rounded-lg p-1.5 text-white/30 opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100"
                title="Remove"
              >
                <X className="h-4 w-4" />
              </button>
            </Reorder.Item>
          ))}
        </AnimatePresence>
      </Reorder.Group>
    </div>
  )
}

export function Thumb({ file, colors }: { file: InputFile; colors: [string, string] }): React.JSX.Element {
  if (file.thumb) {
    return <motion.img layout src={file.thumb} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover ring-1 ring-white/10" draggable={false} />
  }
  const Icon = file.ext === 'pdf' || file.ext.startsWith('doc') ? FileText : File
  return (
    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl" style={{ background: `linear-gradient(135deg, ${colors[0]}40, ${colors[1]}30)` }}>
      <Icon className="h-5 w-5 text-white/80" />
    </div>
  )
}
