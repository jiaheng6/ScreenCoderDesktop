import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

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
    minWidth: 1024,
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

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
