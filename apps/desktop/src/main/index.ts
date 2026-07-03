import { app, BrowserWindow, dialog, ipcMain, safeStorage } from 'electron'
import { join } from 'node:path'
import { registerIpcHandlers } from './ipc'
import { JobStore } from './jobs/job-store'
import { ModelProfileStore } from './models/model-profile-store'
import { getDatabasePath, getManagedPythonDir, getWorkspaceDir } from './paths'

let jobStore: JobStore | null = null
let modelProfileStore: ModelProfileStore | null = null

function getDevRendererUrl(): string | null {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL

  if (!rendererUrl || app.isPackaged) {
    return null
  }

  try {
    const url = new URL(rendererUrl)
    const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

    if ((url.protocol === 'http:' || url.protocol === 'https:') && localHosts.has(url.hostname)) {
      return rendererUrl
    }
  } catch {
    return null
  }

  return null
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1180,
    minHeight: 720,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  const rendererUrl = getDevRendererUrl()

  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl)
    return
  }

  mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

function registerDesktopServices(): void {
  if (jobStore || modelProfileStore) {
    return
  }

  const databasePath = getDatabasePath()
  jobStore = new JobStore(databasePath)
  modelProfileStore = new ModelProfileStore(databasePath, {
    encrypt: (value) => safeStorage.encryptString(value).toString('base64'),
    decrypt: (value) => safeStorage.decryptString(Buffer.from(value, 'base64'))
  })

  registerIpcHandlers({
    ipcMain,
    jobStore,
    modelProfileStore,
    workspaceDir: getWorkspaceDir(),
    managedPythonDir: getManagedPythonDir(),
    showOpenDialog: (options) => dialog.showOpenDialog(options)
  })
}

function closeDesktopServices(): void {
  modelProfileStore?.close()
  modelProfileStore = null
  jobStore?.close()
  jobStore = null
}

app.whenReady().then(() => {
  registerDesktopServices()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  closeDesktopServices()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
