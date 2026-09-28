import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Folder, FolderInput, Info, Zap } from 'lucide-react'
import type { InputFile, JobEvent, OptionValue, ToolOptions } from '@shared/types'
import type { ToolDef } from '../tools/registry'
import { load, save } from '../lib/storage'
import DropZone from './DropZone'
import FileList from './FileList'
import Fields from './Fields'
import Results, { type JobState } from './Results'
import OfficeNotice from './OfficeNotice'

interface OutputSetting {
  mode: 'beside' | 'folder'
  folder: string | null
}

function applyEvent(job: JobState | null, e: JobEvent): JobState | null {
  if (!job || job.id !== e.jobId) return job
  switch (e.type) {
    case 'start':
      return { ...job, tasks: e.labels.map((label) => ({ label, status: 'queued' })) }
    case 'task-start':
      return { ...job, tasks: job.tasks.map((t, i) => (i === e.index ? { ...t, status: 'working' } : t)) }
    case 'task-done':
      return {
        ...job,
        tasks: job.tasks.map((t, i) => (i === e.result.index ? { ...t, status: e.result.error ? 'error' : 'done', result: e.result } : t))
      }
    case 'done':
      return { ...job, done: true }
    case 'fatal':
      return { ...job, done: true, fatal: e.error }
  }
}

/** Returns why the job can't start yet, or null when it's ready. */
function blocker(tool: ToolDef, files: InputFile[], o: ToolOptions): string | null {
  if (files.length === 0) return 'Add some files first'
  if (tool.minFiles && files.length < tool.minFiles) return `Add at least ${tool.minFiles} files`
  if (tool.id === 'protect-pdf' && !String(o.password)) return 'Choose a password'
  if (tool.id === 'remove-pages' && !String(o.pages).trim()) return 'Enter the pages to remove'
  if (tool.id === 'split-pdf' && o.mode !== 'each' && !String(o.ranges).trim()) return 'Enter the pages or ranges'
  if ((tool.id === 'compress-image' || tool.id === 'compress-pdf') && o.mode === 'target' && !(Number(o.targetKB) > 0)) return 'Enter a target size'
  if (tool.id === 'resize-image' && o.by === 'pixels' && !(Number(o.width) > 0) && !(Number(o.height) > 0)) return 'Enter a width or height'
  return null
}

export default function ToolView({ tool }: { tool: ToolDef }): React.JSX.Element {
  const [c1, c2] = tool.colors
  const Icon = tool.icon
  const [files, setFiles] = useState<InputFile[]>([])
  const [options, setOptions] = useState<ToolOptions>(() => load(`options:${tool.id}`, tool.defaults))
  const [output, setOutput] = useState<OutputSetting>(() => load('output', { mode: 'beside', folder: null }))
  const [job, setJob] = useState<JobState | null>(null)
  const [dragging, setDragging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const dragDepth = useRef(0)

  useEffect(() => window.api.onJobEvent((e) => setJob((j) => applyEvent(j, e))), [])
  useEffect(() => save(`options:${tool.id}`, { ...options, password: '' }), [tool.id, options])
  useEffect(() => save('output', output), [output])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const running = job !== null && !job.done

  const addPaths = useCallback(
    async (paths: string[]) => {
      const accepted = paths.filter((p) => tool.accept.includes(p.split('.').pop()?.toLowerCase() ?? ''))
      const skipped = paths.length - accepted.length
      if (skipped) setToast(`Skipped ${skipped} file${skipped === 1 ? '' : 's'} this tool can’t open`)
      if (!accepted.length) return
      const described = await window.api.describeFiles(accepted)
      setJob(null)
      setFiles((prev) => {
        const seen = new Set(prev.map((f) => f.path))
        return [...prev, ...described.filter((f) => !seen.has(f.path))]
      })
    },
    [tool.accept]
  )

  const browse = async (): Promise<void> => addPaths(await window.api.pickFiles(tool.accept))

  const setOption = (key: string, value: OptionValue): void => setOptions((o) => ({ ...o, [key]: value }))

  const run = (): void => {
    const id = crypto.randomUUID()
    setJob({ id, tasks: [], done: false })
    window.api.runJob({
      jobId: id,
      tool: tool.id,
      files: files.map((f) => f.path),
      options,
      outDir: output.mode === 'folder' ? output.folder : null
    })
  }

  const chooseFolder = async (): Promise<void> => {
    const folder = await window.api.pickFolder()
    if (folder) setOutput({ mode: 'folder', folder })
  }

  const reason = blocker(tool, files, options)

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -14 }}
      transition={{ duration: 0.28 }}
      className="relative flex h-full min-h-0 flex-col px-8 pb-8"
      onDragEnter={(e) => {
        e.preventDefault()
        if (running) return
        dragDepth.current++
        setDragging(true)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        dragDepth.current = 0
        setDragging(false)
        if (running) return
        void addPaths(Array.from(e.dataTransfer.files).map((f) => window.api.pathForFile(f)).filter(Boolean))
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-4 pb-6">
        <motion.div
          initial={{ scale: 0.6, rotate: -20, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          className="grid h-14 w-14 place-items-center rounded-[18px]"
          style={{ background: `linear-gradient(135deg, ${c1}, ${c2})`, boxShadow: `0 16px 40px -10px ${c1}` }}
        >
          <Icon className="h-7 w-7 text-white" />
        </motion.div>
        <div>
          <h1 className="font-display text-[30px] font-bold leading-none tracking-tight">{tool.name}</h1>
          <p className="mt-1.5 text-[14px] text-white/50">{tool.tagline}</p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-6">
        {/* Left: files or results */}
        <div className="relative min-h-0 min-w-0 flex-1">
          <AnimatePresence mode="wait">
            {job ? (
              <motion.div key="results" className="h-full" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                <Results
                  tool={tool}
                  job={job}
                  onAdjust={() => setJob(null)}
                  onReset={() => {
                    setJob(null)
                    setFiles([])
                  }}
                />
              </motion.div>
            ) : files.length === 0 ? (
              <motion.div key="drop" className="h-full" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}>
                <DropZone tool={tool} dragging={dragging} onBrowse={browse} />
              </motion.div>
            ) : (
              <motion.div key="list" className="h-full" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                <FileList
                  tool={tool}
                  files={files}
                  onReorder={setFiles}
                  onRemove={(p) => setFiles((fs) => fs.filter((f) => f.path !== p))}
                  onAdd={browse}
                  onClear={() => setFiles([])}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Drag overlay when files are already listed */}
          <AnimatePresence>
            {dragging && (files.length > 0 || job) && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="pointer-events-none absolute inset-0 grid place-items-center rounded-[24px] border-2 border-dashed backdrop-blur-md"
                style={{ borderColor: c1, background: `${c1}1f` }}
              >
                <div className="font-display text-2xl font-semibold">Drop to add</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right: settings */}
        <motion.aside
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.08 }}
          className={`glass flex w-[340px] shrink-0 flex-col rounded-[24px] ${running ? 'pointer-events-none opacity-60' : ''}`}
        >
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
            {tool.category === 'office' && <OfficeNotice toolId={tool.id} />}
            {tool.fields.length > 0 ? (
              <Fields fields={tool.fields} values={options} colors={tool.colors} onChange={setOption} />
            ) : (
              <div className="flex gap-2.5 rounded-xl bg-white/[0.04] p-3 text-[12.5px] leading-snug text-white/55">
                <Info className="mt-0.5 h-4 w-4 shrink-0" style={{ color: c1 }} />
                Files are combined top to bottom. Drag them in the list to change the order.
              </div>
            )}

            <div className="border-t border-white/[0.07] pt-5">
              <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/45">Save to</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setOutput((o) => ({ ...o, mode: 'beside' }))}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[12.5px] font-medium transition ${
                    output.mode === 'beside' ? 'border-transparent text-white' : 'border-white/[0.07] text-white/55 hover:bg-white/5'
                  }`}
                  style={output.mode === 'beside' ? { boxShadow: `inset 0 0 0 1.5px ${c1}`, background: `${c1}22` } : undefined}
                >
                  <Folder className="h-4 w-4" /> Same folder
                </button>
                <button
                  onClick={() => (output.folder ? setOutput((o) => ({ ...o, mode: 'folder' })) : chooseFolder())}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[12.5px] font-medium transition ${
                    output.mode === 'folder' ? 'border-transparent text-white' : 'border-white/[0.07] text-white/55 hover:bg-white/5'
                  }`}
                  style={output.mode === 'folder' ? { boxShadow: `inset 0 0 0 1.5px ${c1}`, background: `${c1}22` } : undefined}
                >
                  <FolderInput className="h-4 w-4" /> Other folder
                </button>
              </div>
              {output.mode === 'folder' && output.folder && (
                <button onClick={chooseFolder} className="mt-2 w-full truncate rounded-lg bg-black/25 px-3 py-2 text-left font-mono text-[11px] text-white/55 hover:text-white" title="Change folder">
                  {output.folder}
                </button>
              )}
              <p className="mt-2 text-[11.5px] text-white/35">Originals are never changed or overwritten.</p>
            </div>
          </div>

          <div className="border-t border-white/[0.07] p-5">
            <motion.button
              whileHover={reason ? undefined : { scale: 1.02 }}
              whileTap={reason ? undefined : { scale: 0.97 }}
              disabled={Boolean(reason) || running}
              onClick={run}
              className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl py-3.5 font-display text-[16px] font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40 disabled:saturate-50"
              style={{ background: `linear-gradient(135deg, ${c1}, ${c2})`, boxShadow: reason ? 'none' : `0 18px 40px -14px ${c1}` }}
            >
              {!reason && <span className="absolute inset-y-0 left-0 w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-white/40 to-transparent" />}
              <Zap className="relative h-5 w-5" fill="currentColor" />
              <span className="relative">
                {tool.action}
                {files.length > 1 && !tool.combine ? ` ${files.length} files` : ''}
              </span>
            </motion.button>
            <div className="mt-2 h-4 text-center text-[12px] text-white/40">{reason && files.length > 0 ? reason : ''}</div>
          </div>
        </motion.aside>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className="glass fixed bottom-8 left-1/2 z-50 rounded-xl px-4 py-2.5 text-[13px] font-medium"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
