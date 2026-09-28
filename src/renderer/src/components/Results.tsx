import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, animate, motion } from 'framer-motion'
import { AlertTriangle, ArrowRight, CheckCircle2, ExternalLink, FolderOpen, Loader2, RotateCcw, SlidersHorizontal } from 'lucide-react'
import type { FileStatus, TaskResult } from '@shared/types'
import type { ToolDef } from '../tools/registry'
import { formatBytes, savedPercent } from '../lib/format'

export interface Task {
  label: string
  status: FileStatus
  result?: TaskResult
}

export interface JobState {
  id: string
  tasks: Task[]
  done: boolean
  fatal?: string
}

interface Props {
  tool: ToolDef
  job: JobState
  onAdjust: () => void
  onReset: () => void
}

const SHOWS_SAVINGS = new Set(['compress-image', 'compress-pdf', 'resize-image'])

export default function Results({ tool, job, onAdjust, onReset }: Props): React.JSX.Element {
  const [c1, c2] = tool.colors
  const finished = job.tasks.filter((t) => t.status === 'done' || t.status === 'error').length
  const progress = job.tasks.length ? finished / job.tasks.length : 0

  const stats = useMemo(() => {
    const ok = job.tasks.filter((t) => t.result && !t.result.error)
    const before = ok.reduce((s, t) => s + t.result!.inputSize, 0)
    const after = ok.reduce((s, t) => s + t.result!.outputs.reduce((a, o) => a + o.size, 0), 0)
    const outputs = ok.flatMap((t) => t.result!.outputs)
    const errors = job.tasks.filter((t) => t.result?.error).length
    return { before, after, outputs, errors, ok: ok.length }
  }, [job])

  const showSavings = SHOWS_SAVINGS.has(tool.id) && stats.before > 0
  const firstOutput = stats.outputs[0]

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* Summary */}
      <motion.div layout className="glass relative overflow-hidden rounded-[24px] p-6">
        <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: `radial-gradient(500px circle at 12% 0%, ${c1}30, transparent 60%)` }} />
        {job.done && stats.errors === 0 && !job.fatal && <Confetti colors={[c1, c2, '#ffffff', '#fde047']} />}

        <div className="relative flex items-center gap-6">
          {!job.done ? (
            <div className="grid h-[104px] w-[104px] shrink-0 place-items-center">
              <Loader2 className="h-12 w-12 animate-spin" style={{ color: c1 }} />
            </div>
          ) : showSavings ? (
            <SavingsRing percent={savedPercent(stats.before, stats.after)} colors={tool.colors} />
          ) : (
            <motion.div
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16 }}
              className="grid h-[104px] w-[104px] shrink-0 place-items-center rounded-[30px]"
              style={{ background: stats.errors && !stats.ok ? 'linear-gradient(135deg,#f43f5e,#b91c1c)' : `linear-gradient(135deg, ${c1}, ${c2})`, boxShadow: `0 20px 50px -14px ${c1}` }}
            >
              {stats.errors && !stats.ok ? <AlertTriangle className="h-12 w-12" /> : <CheckCircle2 className="h-12 w-12" />}
            </motion.div>
          )}

          <div className="min-w-0 flex-1">
            <div className="font-display text-[26px] font-bold leading-tight">
              {job.fatal
                ? 'Something went wrong'
                : !job.done
                  ? `Working… ${finished} of ${job.tasks.length}`
                  : stats.ok === 0
                    ? 'That didn’t work'
                    : showSavings
                      ? stats.after < stats.before
                        ? `You saved ${formatBytes(stats.before - stats.after)}`
                        : 'Done — already optimized'
                      : `${stats.outputs.length} file${stats.outputs.length === 1 ? '' : 's'} ready`}
            </div>
            <div className="mt-1.5 text-[13.5px] text-white/55">
              {job.fatal
                ? job.fatal
                : job.done && showSavings
                  ? `${formatBytes(stats.before)} → ${formatBytes(stats.after)}`
                  : job.done
                    ? `${stats.ok} succeeded${stats.errors ? ` · ${stats.errors} failed` : ''}`
                    : 'Hang tight — everything happens on your computer.'}
            </div>

            {!job.done && (
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.08]">
                <motion.div
                  className="relative h-full overflow-hidden rounded-full"
                  style={{ background: `linear-gradient(90deg, ${c1}, ${c2})` }}
                  animate={{ width: `${Math.max(6, progress * 100)}%` }}
                  transition={{ type: 'spring', stiffness: 80, damping: 20 }}
                >
                  <span className="absolute inset-y-0 left-0 w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent" />
                </motion.div>
              </div>
            )}
          </div>

          {job.done && (
            <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="flex shrink-0 flex-col gap-2">
              {firstOutput && (
                <button
                  onClick={() => window.api.reveal(firstOutput.path)}
                  className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white transition hover:brightness-110"
                  style={{ background: `linear-gradient(135deg, ${c1}, ${c2})`, boxShadow: `0 10px 30px -10px ${c1}` }}
                >
                  <FolderOpen className="h-4 w-4" /> Show in folder
                </button>
              )}
              <div className="flex gap-2">
                <button onClick={onAdjust} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/[0.07] px-3 py-2 text-[12.5px] font-medium hover:bg-white/[0.12]" title="Same files, different settings">
                  <SlidersHorizontal className="h-3.5 w-3.5" /> Adjust
                </button>
                <button onClick={onReset} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/[0.07] px-3 py-2 text-[12.5px] font-medium hover:bg-white/[0.12]" title="Start with new files">
                  <RotateCcw className="h-3.5 w-3.5" /> New
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Per-file rows */}
      <div className="glass min-h-0 flex-1 space-y-2 overflow-y-auto rounded-[24px] p-3">
        {job.tasks.map((t, i) => (
          <TaskRow key={i} task={t} tool={tool} index={i} />
        ))}
      </div>
    </div>
  )
}

function TaskRow({ task, tool, index }: { task: Task; tool: ToolDef; index: number }): React.JSX.Element {
  const r = task.result
  const out = r?.outputs ?? []
  const outSize = out.reduce((s, o) => s + o.size, 0)
  const pct = r && !r.error && out.length ? savedPercent(r.inputSize, outSize) : null
  const [c1] = tool.colors

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 12) * 0.03 }}
      className="flex items-center gap-3 rounded-2xl border border-white/[0.05] bg-white/[0.03] px-4 py-3"
    >
      <StatusIcon status={task.status} color={c1} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[13.5px] font-medium">
          <span className="truncate">{task.label}</span>
          {out.length === 1 && out[0].name !== task.label && (
            <>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-white/30" />
              <span className="truncate text-white/70">{out[0].name}</span>
            </>
          )}
        </div>
        <div className="mt-0.5 truncate text-[12px] text-white/45">
          {task.status === 'queued' && 'Waiting…'}
          {task.status === 'working' && 'Processing…'}
          {r?.error && <span className="text-rose-300">{r.error}</span>}
          {r && !r.error && (
            <>
              {formatBytes(r.inputSize)} → {formatBytes(outSize)}
              {out.length > 1 && ` · ${out.length} files`}
              {r.note && ` · ${r.note}`}
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {pct !== null && SHOWS_SAVINGS.has(tool.id) && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className={`rounded-lg px-2 py-1 font-display text-[12.5px] font-bold tabular-nums ${
              pct > 0 ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-300'
            }`}
          >
            {pct > 0 ? `−${pct}%` : pct === 0 ? '0%' : `+${-pct}%`}
          </motion.span>
        )}
      </AnimatePresence>

      {out.length > 0 && (
        <div className="flex gap-1">
          {out.length === 1 && (
            <button onClick={() => window.api.open(out[0].path)} className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white" title="Open">
              <ExternalLink className="h-4 w-4" />
            </button>
          )}
          <button onClick={() => window.api.reveal(out[0].path)} className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white" title="Show in folder">
            <FolderOpen className="h-4 w-4" />
          </button>
        </div>
      )}
    </motion.div>
  )
}

function StatusIcon({ status, color }: { status: FileStatus; color: string }): React.JSX.Element {
  if (status === 'working') return <Loader2 className="h-5 w-5 shrink-0 animate-spin" style={{ color }} />
  if (status === 'done')
    return (
      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}>
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
      </motion.span>
    )
  if (status === 'error') return <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400" />
  return <span className="h-5 w-5 shrink-0 rounded-full border-2 border-white/15" />
}

function SavingsRing({ percent, colors }: { percent: number; colors: [string, string] }): React.JSX.Element {
  const [shown, setShown] = useState(0)
  const clamped = Math.max(0, Math.min(100, percent))
  useEffect(() => {
    const controls = animate(0, clamped, { duration: 1.4, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setShown(Math.round(v)) })
    return () => controls.stop()
  }, [clamped])
  const R = 44
  const C = 2 * Math.PI * R
  return (
    <div className="relative h-[104px] w-[104px] shrink-0">
      <svg viewBox="0 0 104 104" className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id="ring-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={colors[0]} />
            <stop offset="1" stopColor={colors[1]} />
          </linearGradient>
        </defs>
        <circle cx="52" cy="52" r={R} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="9" />
        <motion.circle
          cx="52"
          cy="52"
          r={R}
          fill="none"
          stroke="url(#ring-g)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (1 - clamped / 100) }}
          transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
          style={{ filter: `drop-shadow(0 0 8px ${colors[0]})` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <div className="font-display text-[26px] font-bold leading-none tabular-nums">{shown}%</div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-white/45">smaller</div>
        </div>
      </div>
    </div>
  )
}

function Confetti({ colors }: { colors: string[] }): React.JSX.Element {
  const pieces = useMemo(
    () =>
      Array.from({ length: 46 }, (_, i) => {
        const angle = (Math.random() * 140 + 200) * (Math.PI / 180) // mostly upward
        const speed = 140 + Math.random() * 220
        return {
          id: i,
          x: Math.cos(angle) * speed * 1.6,
          y: Math.sin(angle) * speed,
          rotate: Math.random() * 720 - 360,
          color: colors[i % colors.length],
          w: 5 + Math.random() * 6,
          h: 8 + Math.random() * 8,
          delay: Math.random() * 0.15
        }
      }),
    // Generated once per burst; re-rendering must not restart the animation.
    []
  )
  return (
    <div className="pointer-events-none absolute left-[70px] top-[70px]">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-[2px]"
          style={{ background: p.color, width: p.w, height: p.h }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: p.x, y: [0, p.y, p.y + 260], opacity: [1, 1, 0], rotate: p.rotate }}
          transition={{ duration: 1.8, delay: p.delay, ease: 'easeOut', times: [0, 0.4, 1] }}
        />
      ))}
    </div>
  )
}
