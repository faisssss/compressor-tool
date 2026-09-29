import { AlertTriangle, Check, CheckCircle2, Eye, FolderOpen, Loader2 } from 'lucide-react'
import type { FileStatus, TaskResult } from '@shared/types'
import type { ToolDef } from '../tools/registry'
import { formatBytes, savedPercent } from '../lib/format'
import { kindOf, previewUrl, splitName } from '../lib/paths'
import { FileIcon } from './FileList'

export interface Task {
  label: string
  status: FileStatus
  result?: TaskResult
  /** Name the result will be saved under (no extension; folder name when there are several files). */
  name: string
  /** Included when pressing "Save selected". */
  selected: boolean
  saved?: string[]
  saveError?: string
}

export interface JobState {
  id: string
  /** Input paths in the order they were processed. */
  inputs: string[]
  tasks: Task[]
  done: boolean
  fatal?: string
}

interface Props {
  tool: ToolDef
  job: JobState
  onToggle: (index: number) => void
  onToggleAll: (selected: boolean) => void
  onRename: (index: number, name: string) => void
  onPreview: (index: number) => void
}

export const SHOWS_SAVINGS = new Set(['compress-image', 'compress-pdf', 'resize-image'])

export const outputSize = (r: TaskResult): number => r.outputs.reduce((s, o) => s + o.size, 0)

export default function Results({ tool, job, onToggle, onToggleAll, onRename, onPreview }: Props): React.JSX.Element {
  const finished = job.tasks.filter((t) => t.status === 'done' || t.status === 'error').length
  const ok = job.tasks.filter((t) => t.result && !t.result.error)
  const before = ok.reduce((s, t) => s + t.result!.inputSize, 0)
  const after = ok.reduce((s, t) => s + outputSize(t.result!), 0)
  const selectable = ok.filter((t) => !t.saved)
  const allSelected = selectable.length > 0 && selectable.every((t) => t.selected)

  return (
    <div className="panel flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        {job.done && selectable.length > 0 && (
          <Checkbox checked={allSelected} onChange={() => onToggleAll(!allSelected)} title={allSelected ? 'Deselect all' : 'Select all'} />
        )}
        <div className="min-w-0 flex-1 text-[13px]">
          {job.fatal ? (
            <span className="text-rose-300">{job.fatal}</span>
          ) : !job.done ? (
            <span className="text-white/70">
              Processing {Math.min(finished + 1, job.tasks.length || 1)} of {job.tasks.length || '…'}
            </span>
          ) : (
            <>
              <span className="font-medium text-white">
                {ok.length} result{ok.length === 1 ? '' : 's'} ready to review
              </span>
              {SHOWS_SAVINGS.has(tool.id) && before > 0 && (
                <span className="text-white/50">
                  {' '}
                  · {formatBytes(before)} → {formatBytes(after)}
                  <span className={after < before ? ' text-emerald-300' : ' text-amber-300'}> ({savedLabel(before, after)})</span>
                </span>
              )}
              {job.tasks.length > ok.length && <span className="text-rose-300"> · {job.tasks.length - ok.length} failed</span>}
            </>
          )}
        </div>
      </div>

      {!job.done && (
        <div className="h-0.5 bg-white/5">
          <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${job.tasks.length ? (finished / job.tasks.length) * 100 : 5}%` }} />
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {job.tasks.map((t, i) => (
          <Row key={i} task={t} tool={tool} onToggle={() => onToggle(i)} onRename={(n) => onRename(i, n)} onPreview={() => onPreview(i)} />
        ))}
      </div>
    </div>
  )
}

const savedLabel = (before: number, after: number): string => {
  const pct = savedPercent(before, after)
  return pct > 0 ? `−${pct}%` : pct === 0 ? 'same size' : `+${-pct}%`
}

function Row({ task, tool, onToggle, onRename, onPreview }: { task: Task; tool: ToolDef; onToggle: () => void; onRename: (name: string) => void; onPreview: () => void }): React.JSX.Element {
  const r = task.result
  const ready = r && !r.error && r.outputs.length > 0
  const single = ready && r.outputs.length === 1
  const ext = single ? splitName(r.outputs[0].name).ext : ''
  const first = ready ? r.outputs[0] : null

  return (
    <div className={`flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors ${ready ? 'bg-surface hover:bg-surface-2' : 'bg-surface/60'}`}>
      <div className="w-5">
        {ready && !task.saved && <Checkbox checked={task.selected} onChange={onToggle} />}
        {task.saved && <Check className="h-4 w-4 text-emerald-400" />}
        {task.status === 'working' && <Loader2 className="h-4 w-4 animate-spin text-accent-hover" />}
        {task.status === 'queued' && <span className="block h-4 w-4 rounded-full border-2 border-white/15" />}
        {r?.error && <AlertTriangle className="h-4 w-4 text-rose-400" />}
      </div>

      {first && kindOf(first.path) === 'image' ? (
        <button onClick={onPreview} className="checker h-10 w-10 shrink-0 overflow-hidden rounded-md">
          <img src={previewUrl(first.path)} alt="" loading="lazy" className="h-full w-full object-cover" draggable={false} />
        </button>
      ) : (
        <FileIcon ext={first ? splitName(first.name).ext.toLowerCase() : ''} />
      )}

      <div className="min-w-0 flex-1">
        {ready && !task.saved ? (
          <div className="flex w-fit max-w-full items-center rounded-md border border-transparent transition-colors focus-within:border-accent hover:border-line">
            <input
              value={task.name}
              onChange={(e) => onRename(e.target.value)}
              spellCheck={false}
              title="Click to rename"
              // Grows with the text so the extension sits right after the name.
              style={{ fieldSizing: 'content' } as React.CSSProperties}
              className="min-w-[4ch] max-w-[420px] bg-transparent py-0.5 pl-1.5 text-[13px] font-medium outline-none"
            />
            <span className="shrink-0 pr-1.5 text-[13px] text-white/40">{single ? `.${ext}` : `/ ${r.outputs.length} files`}</span>
          </div>
        ) : (
          <div className="truncate px-1.5 text-[13px] font-medium">{task.saved ? savedName(task) : task.label}</div>
        )}
        <div className="truncate px-1.5 text-[12px] text-white/45">
          {task.status === 'queued' && 'Waiting…'}
          {task.status === 'working' && `Processing ${task.label}…`}
          {r?.error && <span className="text-rose-300">{task.label}: {r.error}</span>}
          {task.saveError && <span className="text-rose-300">Couldn’t save: {task.saveError}</span>}
          {ready && !task.saveError && (
            <>
              {task.saved ? 'Saved' : `From ${task.label}`} · {formatBytes(r.inputSize)} → {formatBytes(outputSize(r))}
              {r.note && ` · ${r.note}`}
            </>
          )}
        </div>
      </div>

      {ready && SHOWS_SAVINGS.has(tool.id) && (
        <span className={`rounded-md px-1.5 py-0.5 text-[12px] font-semibold tabular-nums ${outputSize(r) < r.inputSize ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-300'}`}>
          {savedLabel(r.inputSize, outputSize(r))}
        </span>
      )}

      {ready && (
        <div className="flex items-center gap-1">
          <button onClick={onPreview} className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[12.5px] font-medium transition-colors hover:border-line-strong hover:bg-white/5">
            <Eye className="h-3.5 w-3.5" /> Preview
          </button>
          {task.saved && (
            <button onClick={() => window.api.reveal(task.saved![0])} className="rounded-md p-1.5 text-white/50 hover:bg-white/10 hover:text-white" title="Show in folder">
              <FolderOpen className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
      {task.status === 'done' && !ready && !r?.error && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
    </div>
  )
}

const savedName = (t: Task): string => {
  const p = t.saved![0]
  if (t.saved!.length > 1) return p.split(/[\\/]/).slice(-2, -1)[0]
  return p.split(/[\\/]/).pop() ?? p
}

export function Checkbox({ checked, onChange, title }: { checked: boolean; onChange: () => void; title?: string }): React.JSX.Element {
  return (
    <button
      onClick={onChange}
      title={title}
      role="checkbox"
      aria-checked={checked}
      className={`grid h-4 w-4 place-items-center rounded border transition-colors duration-100 ${checked ? 'border-accent bg-accent' : 'border-white/30 hover:border-white/60'}`}
    >
      {checked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
    </button>
  )
}
