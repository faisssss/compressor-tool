import { Upload } from 'lucide-react'
import type { ToolDef } from '../tools/registry'

export default function DropZone({ tool, dragging, onBrowse }: { tool: ToolDef; dragging: boolean; onBrowse: () => void }): React.JSX.Element {
  const shown = tool.accept.filter((e) => !['jfif', 'tif', 'heif'].includes(e))
  return (
    <button
      onClick={onBrowse}
      className={`flex h-full min-h-[320px] w-full flex-col items-center justify-center rounded-[14px] border-2 border-dashed text-center transition-colors duration-150 ${
        dragging ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface/60 hover:border-accent/60 hover:bg-surface'
      }`}
    >
      <span className={`grid h-14 w-14 place-items-center rounded-xl transition-colors duration-150 ${dragging ? 'bg-accent' : 'bg-surface-3'}`}>
        <Upload className="h-6 w-6 text-white" />
      </span>
      <div className="mt-5 text-[17px] font-medium">{dragging ? 'Drop to add files' : 'Drop files here'}</div>
      <div className="mt-1 text-[13.5px] text-white/50">
        or <span className="font-medium text-accent-hover">choose files</span> from your computer
      </div>
      <div className="mt-5 flex max-w-md flex-wrap justify-center gap-1 px-8">
        {shown.map((e) => (
          <span key={e} className="rounded border border-line px-1.5 py-px text-[10.5px] font-medium uppercase text-white/40">
            {e}
          </span>
        ))}
      </div>
    </button>
  )
}
