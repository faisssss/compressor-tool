import { useMemo, useState } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import type { ToolId } from '@shared/types'
import { CATEGORIES, TOOLS, type ToolDef } from '../tools/registry'

export default function Home({ onOpen }: { onOpen: (id: ToolId) => void }): React.JSX.Element {
  const [query, setQuery] = useState('')
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return TOOLS
    return TOOLS.filter((t) => `${t.name} ${t.tagline} ${t.accept.join(' ')}`.toLowerCase().includes(q))
  }, [query])

  return (
    <div className="h-full overflow-y-auto px-10 pb-12">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-end justify-between gap-6 pb-8 pt-4">
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight">What would you like to do?</h1>
            <p className="mt-1.5 text-[14px] text-white/55">Compress, convert and edit images, PDFs and Office documents — privately, on this computer.</p>
          </div>
          <label className="flex w-72 shrink-0 items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 focus-within:border-accent">
            <Search className="h-4 w-4 text-white/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tools"
              className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-white/35"
            />
          </label>
        </header>

        {CATEGORIES.map((cat) => {
          const tools = matches.filter((t) => t.category === cat.id)
          if (tools.length === 0) return null
          return (
            <section key={cat.id} className="mb-8">
              <h2 className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-white/40">{cat.name}</h2>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                {tools.map((t) => (
                  <ToolCard key={t.id} tool={t} onOpen={() => onOpen(t.id)} />
                ))}
              </div>
            </section>
          )
        })}
        {matches.length === 0 && <p className="text-white/50">No tool matches “{query}”.</p>}
      </div>
    </div>
  )
}

function ToolCard({ tool, onOpen }: { tool: ToolDef; onOpen: () => void }): React.JSX.Element {
  const Icon = tool.icon
  return (
    <button
      onClick={onOpen}
      className="panel group flex items-center gap-4 p-4 text-left transition-colors duration-150 hover:border-line-strong hover:bg-surface-2"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg" style={{ background: `${tool.colors[0]}1f` }}>
        <Icon className="h-5 w-5" style={{ color: tool.colors[0] }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium">{tool.name}</span>
        <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-snug text-white/50">{tool.tagline}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-white/25 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-white/60" />
    </button>
  )
}
