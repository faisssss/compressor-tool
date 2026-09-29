import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Folder, FolderInput, Info, RotateCcw } from 'lucide-react'
import type { InputFile, JobEvent, OptionValue, SaveItem, TaskResult, ToolOptions } from '@shared/types'
import type { ToolDef } from '../tools/registry'
import { load, save } from '../lib/storage'
import { baseName, dirName, splitName } from '../lib/paths'
import DropZone from './DropZone'
import FileList from './FileList'
import Fields from './Fields'
import Results, { type JobState, type Task } from './Results'
import PreviewModal from './PreviewModal'
import OfficeNotice from './OfficeNotice'

interface OutputSetting {
  mode: 'beside' | 'folder'
  folder: string | null
}

/** The name a result is offered under: the output's file name, or its folder's name when there are several files. */
function defaultName(r: TaskResult): string {
  if (r.outputs.length === 1) return splitName(r.outputs[0].name).stem
  return baseName(dirName(r.outputs[0].path))
}

function applyEvent(job: JobState | null, e: JobEvent): JobState | null {
  if (!job || job.id !== e.jobId) return job
  switch (e.type) {
    case 'start':
      return { ...job, tasks: e.labels.map((label) => ({ label, status: 'queued', name: '', selected: false })) }
    case 'task-start':
      return { ...job, tasks: job.tasks.map((t, i) => (i === e.index ? { ...t, status: 'working' } : t)) }
    case 'task-done': {
      const r = e.result
      const ok = !r.error && r.outputs.length > 0
      return {
        ...job,
        tasks: job.tasks.map((t, i) =>
          i === r.index ? { ...t, status: r.error ? 'error' : 'done', result: r, name: ok ? defaultName(r) : '', selected: ok } : t
        )
      }
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
  const Icon = tool.icon
  const [files, setFiles] = useState<InputFile[]>([])
  const [options, setOptions] = useState<ToolOptions>(() => load(`options:${tool.id}`, tool.defaults))
  const [output, setOutput] = useState<OutputSetting>(() => load('output', { mode: 'beside', folder: null }))
  const [job, setJob] = useState<JobState | null>(null)
  const [previewing, setPreviewing] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [toast, setToast] = useState<{ text: string; reveal?: string } | null>(null)
  const dragDepth = useRef(0)

  useEffect(() => window.api.onJobEvent((e) => setJob((j) => applyEvent(j, e))), [])
  useEffect(() => save(`options:${tool.id}`, { ...options, password: '' }), [tool.id, options])
  useEffect(() => save('output', output), [output])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const running = job !== null && !job.done
  const reviewing = job !== null && job.done

  const addPaths = useCallback(
    async (paths: string[]) => {
      const accepted = paths.filter((p) => tool.accept.includes(p.split('.').pop()?.toLowerCase() ?? ''))
      const skipped = paths.length - accepted.length
      if (skipped) setToast({ text: `Skipped ${skipped} file${skipped === 1 ? '' : 's'} this tool can’t open` })
      if (!accepted.length) return
      const described = await window.api.describeFiles(accepted)
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
    const inputs = files.map((f) => f.path)
    setJob({ id, inputs, tasks: [], done: false })
    window.api.runJob({ jobId: id, tool: tool.id, files: inputs, options, outDir: null })
  }

  const unsavedCount = job ? job.tasks.filter((t) => t.result && !t.result.error && !t.saved).length : 0

  /** Leaves the review, deleting its unsaved results. */
  const closeJob = (clearFiles: boolean): void => {
    if (unsavedCount > 0 && !window.confirm(`Discard ${unsavedCount} unsaved result${unsavedCount === 1 ? '' : 's'}?`)) return
    if (job) window.api.discardJob(job.id)
    setJob(null)
    setPreviewing(null)
    if (clearFiles) setFiles([])
  }

  const updateTask = (index: number, patch: Partial<Task>): void =>
    setJob((j) => (j ? { ...j, tasks: j.tasks.map((t, i) => (i === index ? { ...t, ...patch } : t)) } : j))

  const originalFor = (index: number): string | null => (!job || tool.combine ? null : (job.inputs[index] ?? null))

  const saveTasks = async (indexes: number[]): Promise<void> => {
    if (!job || indexes.length === 0) return
    if (output.mode === 'folder' && !output.folder) return chooseFolder()
    const items: SaveItem[] = indexes.map((i) => ({
      key: String(i),
      outputs: job.tasks[i].result!.outputs.map((o) => o.path),
      name: job.tasks[i].name,
      dest: output.mode === 'folder' ? { kind: 'folder', folder: output.folder! } : { kind: 'beside', original: job.inputs[tool.combine ? 0 : i] }
    }))
    setSaving(true)
    const outcomes = await window.api.saveResults(items)
    setSaving(false)
    for (const o of outcomes) updateTask(Number(o.key), o.error ? { saveError: o.error } : { saved: o.saved, saveError: undefined, selected: false })
    const ok = outcomes.filter((o) => !o.error)
    const failed = outcomes.length - ok.length
    if (ok.length) setToast({ text: `Saved ${ok.length} result${ok.length === 1 ? '' : 's'}${failed ? ` · ${failed} failed` : ''}`, reveal: ok[0].saved[0] })
    else if (failed) setToast({ text: 'Couldn’t save — see the list for details' })
  }

  const chooseFolder = async (): Promise<void> => {
    const folder = await window.api.pickFolder()
    if (folder) setOutput({ mode: 'folder', folder })
  }

  const reason = blocker(tool, files, options)
  const selected = job ? job.tasks.map((t, i) => (t.selected && !t.saved && t.name.trim() ? i : -1)).filter((i) => i >= 0) : []
  const reviewable = job ? job.tasks.map((t, i) => (t.result && !t.result.error ? i : -1)).filter((i) => i >= 0) : []

  return (
    <div
      className="relative flex h-full min-h-0 flex-col px-8 pb-6"
      onDragEnter={(e) => {
        e.preventDefault()
        if (job) return
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
        if (job) return
        void addPaths(Array.from(e.dataTransfer.files).map((f) => window.api.pathForFile(f)).filter(Boolean))
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3.5 pb-5">
        <span className="grid h-10 w-10 place-items-center rounded-lg" style={{ background: `${tool.colors[0]}1f` }}>
          <Icon className="h-5 w-5" style={{ color: tool.colors[0] }} />
        </span>
        <div>
          <h1 className="text-[20px] font-semibold leading-tight tracking-tight">{tool.name}</h1>
          <p className="text-[13px] text-white/50">{tool.tagline}</p>
        </div>
        <div className="flex-1" />
        <Steps step={reviewing ? 3 : running ? 2 : 1} />
      </div>

      <div className="flex min-h-0 flex-1 gap-5">
        {/* Left: files, then results */}
        <div className="relative min-h-0 min-w-0 flex-1">
          {job ? (
            <Results
              tool={tool}
              job={job}
              onToggle={(i) => updateTask(i, { selected: !job.tasks[i].selected })}
              onToggleAll={(sel) => setJob((j) => (j ? { ...j, tasks: j.tasks.map((t) => (t.result && !t.result.error && !t.saved ? { ...t, selected: sel } : t)) } : j))}
              onRename={(i, name) => updateTask(i, { name })}
              onPreview={setPreviewing}
            />
          ) : files.length === 0 ? (
            <DropZone tool={tool} dragging={dragging} onBrowse={browse} />
          ) : (
            <FileList
              tool={tool}
              files={files}
              onReorder={setFiles}
              onRemove={(p) => setFiles((fs) => fs.filter((f) => f.path !== p))}
              onAdd={browse}
              onClear={() => setFiles([])}
            />
          )}

          {dragging && files.length > 0 && !job && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-[14px] border-2 border-dashed border-accent bg-ink-900/85 animate-fade-in">
              <div className="text-[16px] font-medium">Drop to add files</div>
            </div>
          )}
        </div>

        {/* Right: settings before processing, saving afterwards */}
        <aside className="panel flex w-[320px] shrink-0 flex-col">
          {reviewing ? (
            <SavePanel
              output={output}
              setOutput={setOutput}
              chooseFolder={chooseFolder}
              selectedCount={selected.length}
              saving={saving}
              onSave={() => void saveTasks(selected)}
              onAdjust={() => closeJob(false)}
              onReset={() => closeJob(true)}
              allSaved={reviewable.length > 0 && unsavedCount === 0}
            />
          ) : (
            <>
              <div className={`min-h-0 flex-1 space-y-5 overflow-y-auto p-5 ${running ? 'pointer-events-none opacity-50' : ''}`}>
                <div className="text-[13px] font-semibold">Settings</div>
                {tool.category === 'office' && <OfficeNotice toolId={tool.id} />}
                {tool.fields.length > 0 ? (
                  <Fields fields={tool.fields} values={options} onChange={setOption} />
                ) : (
                  <div className="flex gap-2.5 rounded-lg bg-white/[0.03] p-3 text-[12.5px] leading-snug text-white/55">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent-hover" />
                    Files are combined top to bottom. Drag them in the list to change the order.
                  </div>
                )}
              </div>
              <div className="border-t border-line p-5">
                <button
                  disabled={Boolean(reason) || running}
                  onClick={run}
                  className="w-full rounded-lg bg-accent py-2.5 text-[14px] font-semibold text-white transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40"
                >
                  {running ? 'Processing…' : `${tool.action}${files.length > 1 && !tool.combine ? ` ${files.length} files` : ''}`}
                </button>
                <p className="mt-2 text-center text-[12px] text-white/40">
                  {reason && files.length > 0 ? reason : 'You’ll preview the results before saving.'}
                </p>
              </div>
            </>
          )}
        </aside>
      </div>

      {previewing !== null && job?.tasks[previewing]?.result && (
        <PreviewModal
          tool={tool}
          task={job.tasks[previewing]}
          original={originalFor(previewing)}
          position={{ index: reviewable.indexOf(previewing), total: reviewable.length }}
          onNavigate={(d) => {
            const at = reviewable.indexOf(previewing)
            setPreviewing(reviewable[(at + d + reviewable.length) % reviewable.length])
          }}
          onRename={(name) => updateTask(previewing, { name })}
          onSave={() => void saveTasks([previewing])}
          saving={saving}
          onClose={() => setPreviewing(null)}
        />
      )}

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="panel fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 bg-surface-3 px-4 py-2.5 text-[13px] shadow-xl"
          >
            {toast.text}
            {toast.reveal && (
              <button onClick={() => window.api.reveal(toast.reveal!)} className="font-medium text-accent-hover hover:underline">
                Show in folder
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Steps({ step }: { step: 1 | 2 | 3 }): React.JSX.Element {
  const labels = ['Choose files', 'Process', 'Review & save']
  return (
    <div className="flex items-center gap-2 text-[12px]">
      {labels.map((l, i) => {
        const n = i + 1
        const state = n < step ? 'done' : n === step ? 'current' : 'todo'
        return (
          <div key={l} className="flex items-center gap-2">
            {i > 0 && <span className={`h-px w-5 ${n <= step ? 'bg-accent/60' : 'bg-white/15'}`} />}
            <span
              className={`grid h-5 w-5 place-items-center rounded-full text-[11px] font-semibold ${
                state === 'todo' ? 'bg-white/10 text-white/45' : 'bg-accent text-white'
              }`}
            >
              {n}
            </span>
            <span className={state === 'current' ? 'font-medium text-white' : 'text-white/45'}>{l}</span>
          </div>
        )
      })}
    </div>
  )
}

function SavePanel(props: {
  output: OutputSetting
  setOutput: (o: OutputSetting) => void
  chooseFolder: () => Promise<void>
  selectedCount: number
  saving: boolean
  onSave: () => void
  onAdjust: () => void
  onReset: () => void
  allSaved: boolean
}): React.JSX.Element {
  const { output, setOutput, chooseFolder, selectedCount, saving, onSave, onAdjust, onReset, allSaved } = props
  const option = (active: boolean): string =>
    `flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-[13px] transition-colors duration-150 ${
      active ? 'border-accent bg-accent-soft text-white' : 'border-line text-white/65 hover:border-line-strong'
    }`

  return (
    <>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        <div>
          <div className="text-[13px] font-semibold">Review &amp; save</div>
          <p className="mt-1 text-[12.5px] leading-snug text-white/50">
            Preview each result, rename it if you like, then save the ones you want. Nothing is saved until you do.
          </p>
        </div>

        <div>
          <div className="mb-2 text-[12px] font-medium text-white/60">Save to</div>
          <div className="space-y-2">
            <button onClick={() => setOutput({ ...output, mode: 'beside' })} className={option(output.mode === 'beside')}>
              <Folder className="h-4 w-4 shrink-0" /> Same folder as the original
            </button>
            <button onClick={() => (output.folder ? setOutput({ ...output, mode: 'folder' }) : void chooseFolder())} className={option(output.mode === 'folder')}>
              <FolderInput className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">
                Another folder
                {output.folder && <span className="block truncate text-[11.5px] text-white/45">{output.folder}</span>}
              </span>
            </button>
            {output.mode === 'folder' && (
              <button onClick={() => void chooseFolder()} className="text-[12px] font-medium text-accent-hover hover:underline">
                Change folder…
              </button>
            )}
          </div>
          <p className="mt-2 text-[11.5px] text-white/35">Existing files are never overwritten — a number is added instead.</p>
        </div>
      </div>

      <div className="space-y-2 border-t border-line p-5">
        <button
          onClick={onSave}
          disabled={selectedCount === 0 || saving}
          className="w-full rounded-lg bg-accent py-2.5 text-[14px] font-semibold text-white transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40"
        >
          {saving ? 'Saving…' : allSaved ? 'All saved' : selectedCount === 0 ? 'Select results to save' : `Save ${selectedCount} selected`}
        </button>
        <div className="flex gap-2">
          <button onClick={onAdjust} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line py-2 text-[12.5px] text-white/70 transition-colors hover:bg-white/5 hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" /> Change settings
          </button>
          <button onClick={onReset} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line py-2 text-[12.5px] text-white/70 transition-colors hover:bg-white/5 hover:text-white">
            <RotateCcw className="h-3.5 w-3.5" /> New files
          </button>
        </div>
      </div>
    </>
  )
}
