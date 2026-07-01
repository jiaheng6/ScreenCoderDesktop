import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

contextBridge.exposeInMainWorld('screencoder', {
  appVersion: '0.1.0',
  selectImage: () => ipcRenderer.invoke('dialog:select-image'),
  listJobs: () => ipcRenderer.invoke('jobs:list'),
  createJobFromFile: (input: Record<string, unknown>) => ipcRenderer.invoke('jobs:create-from-file', input),
  runJob: (jobId: string) => ipcRenderer.invoke('jobs:run', jobId),
  onJobEvent: (callback: (payload: unknown) => void) => {
    const listener = (_event: IpcRendererEvent, payload: unknown): void => {
      callback(payload)
    }

    ipcRenderer.on('jobs:event', listener)

    return (): void => {
      ipcRenderer.removeListener('jobs:event', listener)
    }
  },
  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  saveProfile: (input: Record<string, unknown>) => ipcRenderer.invoke('profiles:save', input)
})
