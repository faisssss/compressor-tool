import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, ChevronsLeftRight, Columns2, ExternalLink, FileQuestion, Loader2, SplitSquareHorizontal, X } from 'lucide-react'
import type { ToolDef } from '../tools/registry'
import type { Task } from './Results'
import { outputSize, SHOWS_SAVINGS } from './Results'
import { formatBytes, savedPercent } from '../lib/format'
import { baseName, kindOf, previewUrl, splitName } from '../lib/paths'

interface Props {
  tool: ToolDef
  task: Task
  /** The original file this result came from (null for combine tools like Merge). */
  original: string | null
  position: { index: number; total: number }
  onNavigate: (delta: number) => void
  onRename: (name: string) => void
  onSave: () => void
  saving: boolean
  onClose: () => void
}

/** A thing to show in a pane: a whole image, or one page of a PDF. */
interface Source {
  path: string
  page?: number
}

export default function PreviewModal({ tool, task, original, position, onNavigate, onRename, onSave, saving, onClose }: Props): React.JSX.Element {
  const r = task.result!
  const [outIndex, setOutIndex] = useState(0)
  const [page, setPage] = useState(1)
  const [mode, setMode] = useState<'slider' | 'side'>('slider')
  const [pageCounts, setPageCounts] = useState<Record<string, number>>({})

  // Reset when moving to another result.
  useEffect(() => {
    setOutIndex(0)
    setPage(1)
  }, [task])

  const output = r.outputs[Math.min(outIndex, r.outputs.length - 1)]
  const outKind = kindOf(output.path)
  const origKind = original ? kindOf(original) : null
  const single = r.outputs.length === 1
  const ext = single ? splitName(output.name).ext : ''

  // Decide what goes on the left ("before") and right ("after").
  let before: Source | null = null
  let after: Source | null = null
  if (outKind === 'image') after = { path: output.path }
  if (outKind === 'pdf') after = { path: output.path, page }
  if (original && single && origKind === outKind) before = origKind === 'pdf' ? { path: original, page } : { path: original }
  if (original && tool.id === 'pdf-to-images') before = { path: original, page: outIndex + 1 }

  const pdfPaths = [before, after].filter((s): s is Source => !!s?.page).map((s) => s.path)
  useEffect(() => {
    const missing = pdfPaths.filter((p) => pageCounts[p] === undefined)
    if (missing.length === 0) return
    void window.api.describeFiles(missing).then((files) =>
      setPageCounts((c) => ({ ...c, ...Object.fromEntries(files.map((f) => [f.path, f.pages ?? 1])) }))
    )
  }, [pdfPaths.join('|')])
  const maxPage = Math.max(1, ...pdfPaths.map((p) => pageCounts[p] ?? 1))
  const showsPages = pdfPaths.length > 0 && tool.id !== 'pdf-to-images'

  const canCompare = !!before && !!after && outKind === 'image' && origKind === 'image'

  // Keyboard: Esc closes, ←/→ move between pages (or results).
  const keys = useRef({ onClose, onNavigate, maxPage, showsPages, total: position.total })
  keys.current = { onClose, onNavigate, maxPage, showsPages, total: position.total }
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      const k = keys.current
      if (e.key === 'Escape') k.onClose()
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const d = e.key === 'ArrowRight' ? 1 : -1
        if (k.showsPages && k.maxPage > 1) setPage((p) => Math.min(k.maxPage, Math.max(1, p + d)))
        else if (k.total > 1) k.onNavigate(d)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pct = savedPercent(r.inputSize, outputSize(r))

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12 }}
      className="fixed inset-0 z-50 flex bg-black/60 p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.14, ease: 'easeOut' }}
        className="panel flex min-h-0 w-full flex-col overflow-hidden bg-ink-900 shadow-2xl"
      >
        {/* Header: name (renamable) and sizes */}
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          {position.total > 1 && (
            <div className="flex items-center gap-1 text-[12px] text-white/50">
              <IconButton onClick={() => onNavigate(-1)} title="Previous result">
                <ChevronLeft className="h-4 w-4" />
              </IconButton>
              <span className="tabular-nums">
                {position.index + 1} / {position.total}
              </span>
              <IconButton onClick={() => onNavigate(1)} title="Next result">
                <ChevronRight className="h-4 w-4" />
              </IconButton>
            </div>
          )}
          <div className="flex min-w-0 max-w-lg flex-1 items-center rounded-md border border-line bg-ink-950/60 focus-within:border-accent">
            <input
              value={task.name}
              onChange={(e) => onRename(e.target.value)}
              disabled={!!task.saved}
              spellCheck={false}
              className="w-full min-w-0 bg-transparent px-2.5 py-1.5 text-[13.5px] font-medium outline-none disabled:text-white/60"
              title="File name"
            />
            <span className="shrink-0 pr-2.5 text-[12.5px] text-white/40">{single ? `.${ext}` : `/ ${r.outputs.length} files`}</span>
          </div>
          <div className="text-[12.5px] text-white/55">
            {formatBytes(r.inputSize)} → <span className="text-white">{formatBytes(outputSize(r))}</span>
            {SHOWS_SAVINGS.has(tool.id) && <span className={pct > 0 ? 'text-emerald-300' : 'text-amber-300'}> ({pct > 0 ? `−${pct}%` : `+${-pct}%`})</span>}
          </div>
          <div className="flex-1" />
          <IconButton onClick={onClose} title="Close (Esc)">
            <X className="h-4 w-4" />
          </IconButton>
        </div>

        {/* Several outputs (split pages, PDF → images): pick which one to look at */}
        {!single && (
          <div className="flex gap-1.5 overflow-x-auto border-b border-line px-4 py-2">
            {r.outputs.map((o, i) => (
              <button
                key={o.path}
                onClick={() => {
                  setOutIndex(i)
                  setPage(1)
                }}
                className={`shrink-0 rounded-md border px-2.5 py-1 text-[12px] transition-colors ${
                  i === outIndex ? 'border-accent bg-accent-soft text-white' : 'border-line text-white/55 hover:text-white'
                }`}
              >
                {o.name}
              </button>
            ))}
          </div>
        )}

        {/* Viewer */}
        <div className="flex min-h-0 flex-1 gap-3 p-4">
          {!after ? (
            <NoPreview path={output.path} />
          ) : canCompare && mode === 'slider' ? (
            <CompareSlider before={before!} after={after} />
          ) : before ? (
            <>
              <Pane label={original ? `Before · ${baseName(original)}` : 'Before'} source={before} />
              <Pane label="After" source={after} />
            </>
          ) : (
            <Pane label={tool.combine ? `Result · made from ${task.label}` : 'Result'} source={after} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-line px-4 py-3">
          {canCompare && (
            <div className="flex rounded-lg border border-line bg-ink-950/60 p-0.5">
              <ModeButton active={mode === 'slider'} onClick={() => setMode('slider')} icon={SplitSquareHorizontal} label="Slider" />
              <ModeButton active={mode === 'side'} onClick={() => setMode('side')} icon={Columns2} label="Side by side" />
            </div>
          )}
          {showsPages && maxPage > 1 && (
            <div className="flex items-center gap-1 text-[12.5px] text-white/60">
              <IconButton onClick={() => setPage((p) => Math.max(1, p - 1))} title="Previous page">
                <ChevronLeft className="h-4 w-4" />
              </IconButton>
              <span className="tabular-nums">
                Page {page} of {maxPage}
              </span>
              <IconButton onClick={() => setPage((p) => Math.min(maxPage, p + 1))} title="Next page">
                <ChevronRight className="h-4 w-4" />
              </IconButton>
            </div>
          )}
          <div className="flex-1" />
          <button onClick={() => window.api.open(output.path)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] text-white/65 transition-colors hover:bg-white/5 hover:text-white">
            <ExternalLink className="h-4 w-4" /> Open in default app
          </button>
          {task.saved ? (
            <button onClick={() => window.api.reveal(task.saved![0])} className="rounded-lg border border-line px-4 py-2 text-[13px] font-medium hover:bg-white/5">
              Saved — show in folder
            </button>
          ) : (
            <button
              onClick={onSave}
              disabled={saving || !task.name.trim()}
              className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? 'Saving…' : single ? 'Save this file' : `Save these ${r.outputs.length} files`}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

function Pane({ label, source }: { label: string; source: Source }): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="mb-2 truncate text-[12px] font-medium text-white/50">{label}</div>
      <div className="checker relative min-h-0 flex-1 overflow-hidden rounded-lg border border-line">
        <PreviewImage source={source} className="absolute inset-0 h-full w-full object-contain" />
      </div>
    </div>
  )
}

function PreviewImage({ source, className, onLoad }: { source: Source; className: string; onLoad?: () => void }): React.JSX.Element {
  const src = previewUrl(source.path, source.page)
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  useEffect(() => setState('loading'), [src])
  return (
    <>
      <img
        src={src}
        alt=""
        draggable={false}
        className={`${className} transition-opacity duration-150 ${state === 'ok' ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => {
          setState('ok')
          onLoad?.()
        }}
        onError={() => setState('error')}
      />
      {state === 'loading' && (
        <div className="absolute inset-0 grid place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
        </div>
      )}
      {state === 'error' && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-[13px] text-white/50">
          Preview not available for this file
          {source.path.toLowerCase().endsWith('.pdf') ? ' (it may be password-protected)' : ''}.
        </div>
      )}
    </>
  )
}

/** Before and after stacked on top of each other; drag the divider to compare. */
function CompareSlider({ before, after }: { before: Source; after: Source }): React.JSX.Element {
  const [pos, setPos] = useState(50)
  const box = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const move = (clientX: number): void => {
    const rect = box.current!.getBoundingClientRect()
    setPos(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)))
  }

  return (
    <div
      ref={box}
      className="checker relative min-h-0 flex-1 cursor-ew-resize overflow-hidden rounded-lg border border-line"
      onPointerDown={(e) => {
        dragging.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        move(e.clientX)
      }}
      onPointerMove={(e) => dragging.current && move(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
    >
      <PreviewImage source={after} className="absolute inset-0 h-full w-full object-contain" />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <PreviewImage source={before} className="absolute inset-0 h-full w-full object-contain" />
      </div>
      <div className="pointer-events-none absolute inset-y-0" style={{ left: `${pos}%` }}>
        <div className="absolute inset-y-0 -ml-px w-0.5 bg-white/90 shadow-[0_0_8px_rgba(0,0,0,0.6)]" />
        <div className="absolute top-1/2 -ml-4 -mt-4 grid h-8 w-8 place-items-center rounded-full bg-white text-ink-900 shadow-lg">
          <ChevronsLeftRight className="h-4 w-4" />
        </div>
      </div>
      <span className="pointer-events-none absolute left-3 top-3 rounded bg-black/60 px-2 py-0.5 text-[11.5px] font-medium">Before</span>
      <span className="pointer-events-none absolute right-3 top-3 rounded bg-black/60 px-2 py-0.5 text-[11.5px] font-medium">After</span>
    </div>
  )
}

function NoPreview({ path }: { path: string }): React.JSX.Element {
  return (
    <div className="grid flex-1 place-items-center rounded-lg border border-line bg-surface/50">
      <div className="text-center">
        <FileQuestion className="mx-auto h-10 w-10 text-white/30" />
        <div className="mt-3 text-[14px] font-medium">No preview for {splitName(baseName(path)).ext.toUpperCase()} files</div>
        <div className="mt-1 text-[13px] text-white/50">Open it in its default app to check it before saving.</div>
        <button onClick={() => window.api.open(path)} className="mt-4 rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium hover:bg-white/5">
          Open in default app
        </button>
      </div>
    </div>
  )
}

function IconButton({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <button onClick={onClick} title={title} className="rounded-md p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white">
      {children}
    </button>
  )
}

function ModeButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string }): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12.5px] font-medium transition-colors ${active ? 'bg-accent text-white' : 'text-white/55 hover:text-white'}`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  )
}
