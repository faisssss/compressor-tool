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
    <aside className="relative z-10 flex w-[252px] shrink-0 flex-col border-r border-white/[0.06] bg-ink-950/40 backdrop-blur-2xl">
      <div className={`drag px-6 ${isMac ? 'pt-10' : 'pt-4'} pb-3`}>
        <img src={logo} alt="Aerowis Aviation" className="w-[132px] select-none" draggable={false} />
        <div className="mt-1.5 flex items-center gap-2">
          <span className="h-px flex-1 bg-gradient-to-r from-sky-400/60 to-transparent" />
          <span className="font-display text-[11px] font-semibold uppercase tracking-[0.32em] text-sky-200/80">Compressor</span>
        </div>
      </div>

      <nav className="flex-1 space-y-3 overflow-y-auto px-3 pb-3">
        <NavItem active={current === 'home'} onClick={() => onNavigate('home')} colors={['#29b6f6', '#1d4ed8']} label="All tools" icon={LayoutGrid} />
        {CATEGORIES.map((cat) => (
          <div key={cat.id}>
            <div className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/30">{cat.name}</div>
            <div className="space-y-0.5">
              {TOOLS.filter((t) => t.category === cat.id).map((t) => (
                <NavItem key={t.id} active={current === t.id} onClick={() => onNavigate(t.id)} colors={t.colors} label={t.name} icon={t.icon} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="m-3 flex items-center gap-2.5 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.06] px-3 py-2.5">
        <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-300" />
        <div className="text-[11px] leading-tight text-emerald-100/70">
          <span className="font-semibold text-emerald-200">100% offline.</span> Your files never leave this computer.
        </div>
      </div>
    </aside>
  )
}

function NavItem({
  active,
  onClick,
  colors,
  label,
  icon: Icon
}: {
  active: boolean
  onClick: () => void
  colors: [string, string]
  label: string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-[5px] text-left text-[13px] font-medium transition-colors ${
        active ? 'text-white' : 'text-white/55 hover:text-white/90'
      }`}
    >
      {active && (
        <motion.span
          layoutId="nav-active"
          className="absolute inset-0 rounded-xl border border-white/10"
          style={{ background: `linear-gradient(100deg, ${colors[0]}33, ${colors[1]}14)` }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        >
          <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full" style={{ background: `linear-gradient(${colors[0]}, ${colors[1]})` }} />
        </motion.span>
      )}
      <span
        className="relative grid h-[26px] w-[26px] place-items-center rounded-lg transition-transform group-hover:scale-110"
        style={{ background: active ? `linear-gradient(135deg, ${colors[0]}, ${colors[1]})` : 'rgb(255 255 255 / 0.06)' }}
      >
        <Icon className="h-[15px] w-[15px]" style={{ color: active ? '#fff' : colors[0] }} />
      </span>
      <span className="relative truncate">{label}</span>
    </button>
  )
}
