import { motion } from 'framer-motion'
import { LayoutGrid, ShieldCheck } from 'lucide-react'
import type { ToolId } from '@shared/types'
import { CATEGORIES, TOOLS } from '../tools/registry'
import logo from '../assets/aerowis-logo.png'

interface Props {
  current: ToolId | 'home'
  onNavigate: (route: ToolId | 'home') => void
}

export default function Sidebar({ current, onNavigate }: Props): React.JSX.Element {
  const isMac = window.api.platform === 'darwin'
  return (
    <aside className="flex w-[240px] shrink-0 flex-col border-r border-line bg-ink-950/70">
      <div className={`drag px-5 ${isMac ? 'pt-10' : 'pt-5'} pb-4`}>
        <img src={logo} alt="Aerowis Aviation" className="w-[124px]" draggable={false} />
        <div className="mt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.28em] text-white/45">Compressor</div>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-3">
        <NavItem active={current === 'home'} onClick={() => onNavigate('home')} label="All tools" icon={LayoutGrid} />
        {CATEGORIES.map((cat) => (
          <div key={cat.id}>
            <div className="mb-1 px-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/30">{cat.name}</div>
            <div className="space-y-px">
              {TOOLS.filter((t) => t.category === cat.id).map((t) => (
                <NavItem key={t.id} active={current === t.id} onClick={() => onNavigate(t.id)} label={t.name} icon={t.icon} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-2 border-t border-line px-5 py-3 text-[11.5px] text-white/45">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400/80" />
        Works offline — files stay on this computer
      </div>
    </aside>
  )
}

function NavItem({
  active,
  onClick,
  label,
  icon: Icon
}: {
  active: boolean
  onClick: () => void
  label: string
  icon: React.ComponentType<{ className?: string }>
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`relative flex w-full items-center gap-2.5 rounded-lg px-3 py-[7px] text-left text-[13px] transition-colors duration-150 ${
        active ? 'font-medium text-white' : 'text-white/60 hover:bg-white/[0.04] hover:text-white/90'
      }`}
    >
      {active && (
        <motion.span
          layoutId="nav-active"
          className="absolute inset-0 rounded-lg bg-accent-soft ring-1 ring-inset ring-accent/40"
          transition={{ type: 'spring', stiffness: 600, damping: 45 }}
        />
      )}
      <Icon className={`relative h-4 w-4 shrink-0 ${active ? 'text-sky-brand' : 'text-white/45'}`} />
      <span className="relative truncate">{label}</span>
    </button>
  )
}
