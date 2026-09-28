import { motion } from 'framer-motion'
import { UploadCloud } from 'lucide-react'
import type { ToolDef } from '../tools/registry'

export default function DropZone({ tool, dragging, onBrowse }: { tool: ToolDef; dragging: boolean; onBrowse: () => void }): React.JSX.Element {
  const [c1, c2] = tool.colors
  const shown = tool.accept.filter((e) => !['jfif', 'tif', 'heif'].includes(e))
  return (
    <motion.button
      onClick={onBrowse}
      animate={{ scale: dragging ? 1.015 : 1 }}
      whileHover={{ scale: 1.005 }}
      className="spin-border group relative flex h-full min-h-[340px] w-full flex-col items-center justify-center overflow-hidden rounded-[28px] bg-ink-900/50 text-center backdrop-blur-xl"
      style={{ ['--c1' as string]: c1, ['--c2' as string]: c2 }}
    >
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{ background: `radial-gradient(600px circle at 50% 45%, ${c1}${dragging ? '40' : '1c'}, transparent 65%)` }}
      />
      <div className="relative">
        <motion.div
          animate={{ y: dragging ? -10 : [0, -8, 0] }}
          transition={dragging ? { type: 'spring' } : { duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          className="relative mx-auto grid h-24 w-24 place-items-center rounded-[28px]"
          style={{ background: `linear-gradient(135deg, ${c1}, ${c2})`, boxShadow: `0 24px 60px -12px ${c1}` }}
        >
          <UploadCloud className="h-11 w-11 text-white" strokeWidth={1.8} />
          <span className="absolute inset-0 animate-ping rounded-[28px] opacity-20" style={{ background: c1, animationDuration: '2.4s' }} />
        </motion.div>
        <div className="mt-8 font-display text-2xl font-semibold">{dragging ? 'Drop to add' : 'Drop files here'}</div>
        <div className="mt-2 text-[14px] text-white/50">
          or{' '}
          <span className="font-semibold underline decoration-2 underline-offset-4" style={{ textDecorationColor: c1, color: 'white' }}>
            browse your computer
          </span>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-1.5 px-10">
          {shown.map((e) => (
            <span key={e} className="rounded-md border border-white/[0.07] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10.5px] uppercase text-white/45">
              {e}
            </span>
          ))}
        </div>
      </div>
    </motion.button>
  )
}
