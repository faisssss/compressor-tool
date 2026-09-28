import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowUpRight, Search, Sparkles } from 'lucide-react'
import type { ToolId } from '@shared/types'
import { CATEGORIES, TOOLS, type ToolDef } from '../tools/registry'

export default function Home({ onOpen }: { onOpen: (id: ToolId) => void }): React.JSX.Element {
  const [query, setQuery] = useState('')
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return TOOLS
    return TOOLS.filter((t) => `${t.name} ${t.tagline} ${t.accept.join(' ')}`.toLowerCase().includes(q))
  }, [query])

  let order = 0
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3 }}
      className="h-full overflow-y-auto px-10 pb-16"
    >
      <div className="mx-auto max-w-6xl">
        <section className="pb-10 pt-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.05 }}
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/70"
          >
            <Sparkles className="h-3.5 w-3.5 text-fuchsia-300" />
            {TOOLS.length} tools · works offline · no uploads
          </motion.div>
          <h1 className="font-display text-[56px] font-bold leading-[1.02] tracking-tight">
            Make every file
            <br />
            <span className="text-gradient">lighter &amp; better.</span>
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/55">
            Compress photos to an exact size, convert between formats, build and edit PDFs, and turn Office documents into PDFs — all right here on your computer.
          </p>

          <div className="glass mt-8 flex max-w-md items-center gap-3 rounded-2xl px-4 py-3">
            <Search className="h-4 w-4 text-white/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a tool… try “heic”, “merge” or “word”"
              className="w-full bg-transparent text-sm outline-none placeholder:text-white/35"
            />
          </div>
        </section>

        {CATEGORIES.map((cat) => {
          const tools = matches.filter((t) => t.category === cat.id)
          if (tools.length === 0) return null
          return (
            <section key={cat.id} className="mb-10">
              <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-[0.16em] text-white/40">{cat.name}</h2>
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-4">
                {tools.map((t) => (
                  <ToolCard key={t.id} tool={t} index={order++} onOpen={() => onOpen(t.id)} />
                ))}
              </div>
            </section>
          )
        })}
        {matches.length === 0 && <p className="text-white/50">No tool matches “{query}”.</p>}
      </div>
    </motion.div>
  )
}

function ToolCard({ tool, index, onOpen }: { tool: ToolDef; index: number; onOpen: () => void }): React.JSX.Element {
  const [c1, c2] = tool.colors
  const Icon = tool.icon
  return (
    <motion.button
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 * index, type: 'spring', stiffness: 260, damping: 24 }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onOpen}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        e.currentTarget.style.setProperty('--x', `${e.clientX - r.left}px`)
        e.currentTarget.style.setProperty('--y', `${e.clientY - r.top}px`)
      }}
      className="glass group relative overflow-hidden rounded-2xl p-5 text-left"
    >
      {/* Spotlight that follows the cursor */}
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `radial-gradient(360px circle at var(--x) var(--y), ${c1}2e, transparent 60%)` }}
      />
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-25 blur-2xl transition-opacity group-hover:opacity-50"
        style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
      />
      <div className="relative flex items-start justify-between">
        <div
          className="grid h-12 w-12 place-items-center rounded-2xl transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110"
          style={{ background: `linear-gradient(135deg, ${c1}, ${c2})`, boxShadow: `0 10px 30px -8px ${c1}aa` }}
        >
          <Icon className="h-6 w-6 text-white" />
        </div>
        <ArrowUpRight className="h-5 w-5 text-white/20 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white/80" />
      </div>
      <div className="relative mt-5 font-display text-[17px] font-semibold">{tool.name}</div>
      <div className="relative mt-1 text-[13px] leading-snug text-white/50">{tool.tagline}</div>
    </motion.button>
  )
}
