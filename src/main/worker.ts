/**
 * Runs in an Electron utility process. All file processing happens here so the window
 * stays smooth even while Ghostscript is chewing through a 200-page PDF.
 */
import type { JobRequest } from '@shared/types'
import { runJob } from './engines/runner'
import { renderImagePreview, thumbnail } from './engines/image'
import { pdfPageCount, renderPdfPage } from './engines/pdf'
import { errorMessage } from './engines/util'

export type WorkerRequest =
  | { kind: 'job'; req: JobRequest }
  | { kind: 'inspect'; reqId: string; path: string; thumb: boolean; pdf: boolean }
  | { kind: 'render'; reqId: string; path: string; what: 'image' | 'pdf-page'; page: number; dpi: number }

export type InspectResult = { kind: 'inspect'; reqId: string; thumb?: string; pages?: number }
export type RenderResult = { kind: 'render'; reqId: string; data?: Uint8Array; mime?: string; error?: string }

const port = process.parentPort

port.on('message', async (e: { data: WorkerRequest }) => {
  const msg = e.data
  if (msg.kind === 'job') {
    await runJob(msg.req, (event) => port.postMessage({ kind: 'job-event', event }))
  } else if (msg.kind === 'inspect') {
    const [thumb, pages] = await Promise.all([
      msg.thumb ? thumbnail(msg.path) : undefined,
      msg.pdf ? pdfPageCount(msg.path) : undefined
    ])
    const reply: InspectResult = { kind: 'inspect', reqId: msg.reqId, thumb, pages }
    port.postMessage(reply)
  } else if (msg.kind === 'render') {
    let reply: RenderResult
    try {
      reply =
        msg.what === 'image'
          ? { kind: 'render', reqId: msg.reqId, data: await renderImagePreview(msg.path), mime: 'image/jpeg' }
          : { kind: 'render', reqId: msg.reqId, data: await renderPdfPage(msg.path, msg.page, msg.dpi), mime: 'image/png' }
    } catch (err) {
      reply = { kind: 'render', reqId: msg.reqId, error: errorMessage(err) }
    }
    port.postMessage(reply)
  }
})
