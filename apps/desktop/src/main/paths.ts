import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export function getAppDataDir(): string {
  const appDataDir = join(app.getPath('userData'), 'ScreenCoderDesktop')
  mkdirSync(appDataDir, { recursive: true })
  return appDataDir
}

export function getDatabasePath(): string {
  return join(getAppDataDir(), 'app.db')
}

export function getWorkspaceDir(): string {
  const workspaceDir = join(getAppDataDir(), 'workspace')
  mkdirSync(workspaceDir, { recursive: true })
  return workspaceDir
}
