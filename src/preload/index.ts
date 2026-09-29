import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { InputFile, JobEvent, JobRequest, OfficeStatus, SaveItem, SaveOutcome } from '@shared/types'

const api = {
  platform: process.platform,
  pickFiles: (extensions: string[]): Promise<string[]> => ipcRenderer.invoke('files:pick', extensions),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('folder:pick'),
  describeFiles: (paths: string[]): Promise<InputFile[]> => ipcRenderer.invoke('files:describe', paths),
  /** Real disk path of a file dropped onto the window. */
  pathForFile: (file: File): string => webUtils.getPathForFile(file),
  runJob: (req: JobRequest): void => ipcRenderer.send('job:run', req),
  onJobEvent: (cb: (e: JobEvent) => void): (() => void) => {
    const listener = (_: unknown, e: JobEvent): void => cb(e)
    ipcRenderer.on('job:event', listener)
    return () => ipcRenderer.removeListener('job:event', listener)
  },
  /** Deletes a job's results from the review area (after saving, or when they're no longer wanted). */
  discardJob: (jobId: string): void => ipcRenderer.send('job:discard', jobId),
  saveResults: (items: SaveItem[]): Promise<SaveOutcome[]> => ipcRenderer.invoke('results:save', items),
  reveal: (path: string): void => ipcRenderer.send('shell:reveal', path),
  open: (path: string): void => ipcRenderer.send('shell:open', path),
  openExternal: (url: string): void => ipcRenderer.send('shell:external', url),
  officeStatus: (): Promise<OfficeStatus> => ipcRenderer.invoke('office:status')
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
