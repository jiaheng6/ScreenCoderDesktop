import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('screencoder', {
  appVersion: '0.1.0',
  selectImage: () => ipcRenderer.invoke('dialog:select-image'),
  listJobs: () => ipcRenderer.invoke('jobs:list'),
  createJobFromFile: (inputPath: string) => ipcRenderer.invoke('jobs:create-from-file', inputPath),
  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  saveProfile: (input: Record<string, unknown>) => ipcRenderer.invoke('profiles:save', input)
})
