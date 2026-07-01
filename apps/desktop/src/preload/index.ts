import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('screencoder', {
  appVersion: '0.1.0'
})
