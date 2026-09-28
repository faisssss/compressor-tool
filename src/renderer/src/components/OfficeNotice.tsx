import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, RefreshCw } from 'lucide-react'
import type { OfficeStatus, ToolId } from '@shared/types'

const DOWNLOAD_URL = 'https://www.libreoffice.org/download/download-libreoffice/'

/** Tells the user which Office engine will be used, or how to get one. */
export default function OfficeNotice({ toolId }: { toolId: ToolId }): React.JSX.Element | null {
  const [status, setStatus] = useState<OfficeStatus | null>(null)
  const refresh = (): void => {
    setStatus(null)
    void window.api.officeStatus().then(setStatus)
  }
  useEffect(refresh, [])

  if (!status) return null
  const ready = status.libreOffice || status.msOffice

  if (!ready) {
    return (
      <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] p-4">
        <div className="flex items-center gap-2 text-[13.5px] font-semibold text-amber-200">
          <AlertTriangle className="h-4 w-4" /> One-time setup needed
        </div>
        <p className="mt-1.5 text-[12.5px] leading-snug text-amber-100/70">
          Office conversions use <b>LibreOffice</b> — free, and installed separately because it’s large (~350 MB).
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => window.api.openExternal(DOWNLOAD_URL)}
            className="flex items-center gap-1.5 rounded-lg bg-amber-300 px-3 py-1.5 text-[12.5px] font-semibold text-black hover:bg-amber-200"
          >
            <Download className="h-3.5 w-3.5" /> Get LibreOffice
          </button>
          <button onClick={refresh} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[12.5px] font-medium hover:bg-white/15">
            <RefreshCw className="h-3.5 w-3.5" /> Check again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2 text-[12.5px] text-emerald-100/80">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
        <span>
          Ready — using {[status.msOffice && 'Microsoft Office', status.libreOffice && 'LibreOffice'].filter(Boolean).join(' / ')}
        </span>
      </div>
      {toolId === 'pdf-to-word' && (
        <p className="px-1 text-[12px] leading-snug text-white/40">
          Simple documents convert well; complex layouts (columns, forms, scans) may need touching up. Microsoft Word gives the best results when installed.
        </p>
      )}
    </div>
  )
}
