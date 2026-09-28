import { motion } from 'framer-motion'
import { ChevronDown, Eye, EyeOff } from 'lucide-react'
import { useId, useState } from 'react'
import type { OptionValue, ToolOptions } from '@shared/types'
import type { Field } from '../tools/registry'

interface Props {
  fields: Field[]
  values: ToolOptions
  colors: [string, string]
  onChange: (key: string, value: OptionValue) => void
}

export default function Fields({ fields, values, colors, onChange }: Props): React.JSX.Element {
  const visible = fields.filter((f) => !f.show || f.show(values))
  return (
    <div className="space-y-5">
      {visible.map((f) => (
        <motion.div key={f.key} layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          {f.type !== 'toggle' && <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/45">{f.label}</div>}
          <FieldControl field={f} value={values[f.key]} colors={colors} onChange={(v) => onChange(f.key, v)} />
          {f.hint && <p className="mt-2 text-[12px] leading-snug text-white/40">{f.hint}</p>}
        </motion.div>
      ))}
    </div>
  )
}

function FieldControl({ field: f, value, colors, onChange }: { field: Field; value: OptionValue; colors: [string, string]; onChange: (v: OptionValue) => void }): React.JSX.Element {
  const id = useId()
  const [c1, c2] = colors
  const [reveal, setReveal] = useState(false)

  switch (f.type) {
    case 'segmented':
      return (
        <div className="flex rounded-xl border border-white/[0.07] bg-black/25 p-1">
          {f.choices!.map((c) => {
            const active = String(value) === c.value
            return (
              <button key={c.value} onClick={() => onChange(c.value)} className="relative flex-1 rounded-lg px-2 py-1.5 text-[12.5px] font-medium">
                {active && (
                  <motion.span
                    layoutId={`seg-${id}`}
                    className="absolute inset-0 rounded-lg"
                    style={{ background: `linear-gradient(135deg, ${c1}, ${c2})`, boxShadow: `0 6px 18px -6px ${c1}` }}
                    transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                  />
                )}
                <span className={`relative ${active ? 'text-white' : 'text-white/55 hover:text-white/85'}`}>{c.label}</span>
              </button>
            )
          })}
        </div>
      )

    case 'chips':
      return (
        <div className={`grid gap-2 ${f.choices!.length > 4 ? 'grid-cols-4' : f.choices!.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {f.choices!.map((c) => {
            const active = String(value) === c.value
            return (
              <motion.button
                key={c.value}
                whileTap={{ scale: 0.96 }}
                onClick={() => onChange(c.value)}
                title={c.hint}
                className={`relative rounded-xl border px-2.5 py-2 text-left transition-colors ${
                  active ? 'border-transparent' : 'border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.07]'
                }`}
                style={active ? { background: `linear-gradient(135deg, ${c1}40, ${c2}26)`, boxShadow: `inset 0 0 0 1.5px ${c1}` } : undefined}
              >
                <div className={`text-[13px] font-semibold ${active ? 'text-white' : 'text-white/75'}`}>{c.label}</div>
                {c.hint && f.choices!.length <= 4 && <div className="mt-0.5 text-[11px] leading-tight text-white/45">{c.hint}</div>}
              </motion.button>
            )
          })}
        </div>
      )

    case 'select': {
      const current = f.choices!.find((c) => c.value === String(value))
      return (
        <div>
          <div className="relative">
            <select
              value={String(value)}
              onChange={(e) => onChange(e.target.value)}
              className="w-full appearance-none rounded-xl border border-white/[0.08] bg-black/30 px-3.5 py-2.5 pr-9 text-[13.5px] outline-none transition focus:border-white/25"
            >
              {f.choices!.map((c) => (
                <option key={c.value} value={c.value} className="bg-ink-800">
                  {c.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          </div>
          {current?.hint && <p className="mt-2 text-[12px] text-white/40">{current.hint}</p>}
        </div>
      )
    }

    case 'slider': {
      const n = Number(value)
      const fill = ((n - (f.min ?? 0)) / ((f.max ?? 100) - (f.min ?? 0))) * 100
      return (
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={f.min}
            max={f.max}
            step={f.step}
            value={n}
            onChange={(e) => onChange(Number(e.target.value))}
            className="flex-1"
            style={{ ['--c1' as string]: c1, ['--c2' as string]: c2, ['--fill' as string]: `${fill}%` }}
          />
          <div className="w-14 rounded-lg bg-white/[0.06] py-1 text-center font-display text-sm font-semibold tabular-nums">
            {n}
            {f.unit}
          </div>
        </div>
      )
    }

    case 'number':
      return (
        <div>
          <div className="flex items-center rounded-xl border border-white/[0.08] bg-black/30 focus-within:border-white/25">
            <input
              type="number"
              min={f.min}
              max={f.max}
              value={Number(value) || ''}
              placeholder={f.placeholder}
              onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
              className="w-full bg-transparent px-3.5 py-2.5 font-display text-[15px] font-semibold tabular-nums outline-none placeholder:font-sans placeholder:font-normal placeholder:text-white/30"
            />
            {f.unit && <span className="pr-3.5 text-[12px] font-semibold text-white/40">{f.unit}</span>}
          </div>
          {f.presets && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {f.presets.map((p) => (
                <button
                  key={p}
                  onClick={() => onChange(p)}
                  className={`rounded-lg px-2 py-1 text-[11.5px] font-semibold transition ${
                    Number(value) === p ? 'text-white' : 'bg-white/[0.05] text-white/55 hover:bg-white/10 hover:text-white'
                  }`}
                  style={Number(value) === p ? { background: `linear-gradient(135deg, ${c1}, ${c2})` } : undefined}
                >
                  {p >= 1000 ? `${p / 1000} MB` : `${p} KB`}
                </button>
              ))}
            </div>
          )}
        </div>
      )

    case 'text':
    case 'password':
      return (
        <div className="flex items-center rounded-xl border border-white/[0.08] bg-black/30 focus-within:border-white/25">
          <input
            type={f.type === 'password' && !reveal ? 'password' : 'text'}
            value={String(value ?? '')}
            placeholder={f.placeholder}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-transparent px-3.5 py-2.5 text-[13.5px] outline-none placeholder:text-white/30"
          />
          {f.type === 'password' && (
            <button onClick={() => setReveal((r) => !r)} className="px-3 text-white/40 hover:text-white/80" title={reveal ? 'Hide' : 'Show'}>
              {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
      )

    case 'toggle':
      return (
        <button onClick={() => onChange(!value)} className="flex w-full items-center justify-between gap-4 text-left">
          <span className="text-[13.5px] text-white/80">{f.label}</span>
          <span
            className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
            style={{ background: value ? `linear-gradient(135deg, ${c1}, ${c2})` : 'rgb(255 255 255 / 0.12)' }}
          >
            <motion.span
              className="absolute top-1 h-4 w-4 rounded-full bg-white shadow"
              animate={{ left: value ? 24 : 4 }}
              transition={{ type: 'spring', stiffness: 600, damping: 32 }}
            />
          </span>
        </button>
      )
  }
}
