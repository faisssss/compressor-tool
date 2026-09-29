import { ChevronDown, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import type { OptionValue, ToolOptions } from '@shared/types'
import type { Field } from '../tools/registry'

interface Props {
  fields: Field[]
  values: ToolOptions
  onChange: (key: string, value: OptionValue) => void
}

export default function Fields({ fields, values, onChange }: Props): React.JSX.Element {
  const visible = fields.filter((f) => !f.show || f.show(values))
  return (
    <div className="space-y-5">
      {visible.map((f) => (
        <div key={f.key} className="animate-fade-in">
          {f.type !== 'toggle' && <div className="mb-2 text-[12px] font-medium text-white/60">{f.label}</div>}
          <FieldControl field={f} value={values[f.key]} onChange={(v) => onChange(f.key, v)} />
          {f.hint && <p className="mt-1.5 text-[12px] leading-snug text-white/40">{f.hint}</p>}
        </div>
      ))}
    </div>
  )
}

const inputBox = 'rounded-lg border border-line bg-ink-950/60 transition-colors duration-150 focus-within:border-accent'

function FieldControl({ field: f, value, onChange }: { field: Field; value: OptionValue; onChange: (v: OptionValue) => void }): React.JSX.Element {
  const [reveal, setReveal] = useState(false)

  switch (f.type) {
    case 'segmented':
      return (
        <div className="flex rounded-lg border border-line bg-ink-950/60 p-0.5">
          {f.choices!.map((c) => {
            const active = String(value) === c.value
            return (
              <button
                key={c.value}
                onClick={() => onChange(c.value)}
                className={`flex-1 rounded-md px-2 py-1.5 text-[12.5px] font-medium transition-colors duration-150 ${
                  active ? 'bg-accent text-white' : 'text-white/55 hover:text-white/85'
                }`}
              >
                {c.label}
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
              <button
                key={c.value}
                onClick={() => onChange(c.value)}
                title={c.hint}
                className={`rounded-lg border px-2.5 py-2 text-left transition-colors duration-150 ${
                  active ? 'border-accent bg-accent-soft' : 'border-line bg-white/[0.02] hover:border-line-strong'
                }`}
              >
                <div className={`text-[13px] font-medium ${active ? 'text-white' : 'text-white/75'}`}>{c.label}</div>
                {c.hint && f.choices!.length <= 4 && <div className="mt-0.5 text-[11px] leading-tight text-white/45">{c.hint}</div>}
              </button>
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
              className={`${inputBox} w-full appearance-none px-3 py-2 pr-9 text-[13px] focus:border-accent`}
            >
              {f.choices!.map((c) => (
                <option key={c.value} value={c.value} className="bg-surface-2">
                  {c.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          </div>
          {current?.hint && <p className="mt-1.5 text-[12px] text-white/40">{current.hint}</p>}
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
            style={{ ['--fill' as string]: `${fill}%` }}
          />
          <div className="w-14 rounded-md border border-line py-1 text-center text-[13px] font-medium tabular-nums">
            {n}
            {f.unit}
          </div>
        </div>
      )
    }

    case 'number':
      return (
        <div>
          <div className={`${inputBox} flex items-center`}>
            <input
              type="number"
              min={f.min}
              max={f.max}
              value={Number(value) || ''}
              placeholder={f.placeholder}
              onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
              className="w-full bg-transparent px-3 py-2 text-[14px] font-medium tabular-nums outline-none placeholder:font-normal placeholder:text-white/30"
            />
            {f.unit && <span className="pr-3 text-[12px] text-white/40">{f.unit}</span>}
          </div>
          {f.presets && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {f.presets.map((p) => (
                <button
                  key={p}
                  onClick={() => onChange(p)}
                  className={`rounded-md border px-2 py-0.5 text-[11.5px] font-medium transition-colors duration-150 ${
                    Number(value) === p ? 'border-accent bg-accent-soft text-white' : 'border-line text-white/55 hover:text-white'
                  }`}
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
        <div className={`${inputBox} flex items-center`}>
          <input
            type={f.type === 'password' && !reveal ? 'password' : 'text'}
            value={String(value ?? '')}
            placeholder={f.placeholder}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-transparent px-3 py-2 text-[13px] outline-none placeholder:text-white/30"
          />
          {f.type === 'password' && (
            <button onClick={() => setReveal((r) => !r)} className="px-3 text-white/40 hover:text-white/80" title={reveal ? 'Hide' : 'Show'}>
              {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
      )

    case 'toggle':
      return <Toggle label={f.label} value={Boolean(value)} onChange={onChange} />
  }
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }): React.JSX.Element {
  return (
    <button onClick={() => onChange(!value)} className="flex w-full items-center justify-between gap-4 text-left">
      <span className="text-[13px] text-white/80">{label}</span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ${value ? 'bg-accent' : 'bg-white/15'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] duration-150 ${value ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  )
}
