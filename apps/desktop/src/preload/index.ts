import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

contextBridge.exposeInMainWorld('screencoder', {
  appVersion: '0.1.0',
  selectImage: () => ipcRenderer.invoke('dialog:select-image'),
  readImagePreview: (inputPath: string) => ipcRenderer.invoke('images:read-preview', inputPath),
  listJobs: () => ipcRenderer.invoke('jobs:list'),
  createJobFromFile: (input: Record<string, unknown>) => ipcRenderer.invoke('jobs:create-from-file', input),
  runJob: (jobId: string) => ipcRenderer.invoke('jobs:run', jobId),
  readJobPreview: (jobId: string) => ipcRenderer.invoke('jobs:read-preview', jobId),
  deleteJobs: (jobIds: string[]) => ipcRenderer.invoke('jobs:delete', jobIds),
  onJobEvent: (callback: (payload: unknown) => void) => {
    const listener = (_event: IpcRendererEvent, payload: unknown): void => {
      callback(payload)
    }

    ipcRenderer.on('jobs:event', listener)

    return (): void => {
      ipcRenderer.removeListener('jobs:event', listener)
    }
  },
  listProviders: () => ipcRenderer.invoke('providers:list'),
  saveProvider: (input: Record<string, unknown>) => ipcRenderer.invoke('providers:save', input),
  listModels: () => ipcRenderer.invoke('models:list'),
  saveModel: (input: Record<string, unknown>) => ipcRenderer.invoke('models:save', input),
  testModelConnection: (modelId: string) => ipcRenderer.invoke('models:test-connection', modelId)
})
