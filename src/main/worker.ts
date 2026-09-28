/**
 * Runs in an Electron utility process. All file processing happens here so the window
 * stays smooth even while Ghostscript is chewing through a 200-page PDF.
 */
import type { JobRequest } from '@shared/types'
import { runJob } from './engines/runner'
import { thumbnail } from './engines/image'
import { pdfPageCount } from './engines/pdf'

export type WorkerRequest =
  | { kind: 'job'; req: JobRequest }
  | { kind: 'inspect'; reqId: string; path: string; thumb: boolean; pdf: boolean }

export type InspectResult = { kind: 'inspect'; reqId: string; thumb?: string; pages?: number }

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
  }
})
