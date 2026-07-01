import { randomUUID } from 'node:crypto'
import { copyFileSync, mkdirSync, realpathSync, statSync } from 'node:fs'
import { basename, extname, isAbsolute, join } from 'node:path'
import type { CreateJobInput, JobRecord, JobStore } from './jobs/job-store'
import type {
  ModelProfileInput,
  ModelProfileRecord,
  ModelProfileStore
} from './models/model-profile-store'

export const IPC_CHANNELS = {
  selectImage: 'dialog:select-image',
  listJobs: 'jobs:list',
  createJobFromFile: 'jobs:create-from-file',
  listProfiles: 'profiles:list',
  saveProfile: 'profiles:save'
} as const

export interface IpcMainLike {
  handle: (channel: string, listener: (_event: unknown, ...args: unknown[]) => unknown) => void
}

export interface ShowOpenDialogOptions {
  properties: Array<'openFile'>
  filters: Array<{
    name: string
    extensions: string[]
  }>
}

export interface ShowOpenDialogResult {
  canceled: boolean
  filePaths: string[]
}

export type ShowOpenDialog = (options: ShowOpenDialogOptions) => Promise<ShowOpenDialogResult>

interface CreateIpcHandlersInput {
  jobStore: Pick<JobStore, 'createJob' | 'listJobs'>
  modelProfileStore: Pick<ModelProfileStore, 'listProfiles' | 'saveProfile'>
  workspaceDir: string
  showOpenDialog: ShowOpenDialog
  createJobDirectoryId?: () => string
}

type IpcHandlers = {
  [IPC_CHANNELS.selectImage]: () => Promise<string | null>
  [IPC_CHANNELS.listJobs]: () => JobRecord[]
  [IPC_CHANNELS.createJobFromFile]: (inputPath: string) => JobRecord
  [IPC_CHANNELS.listProfiles]: () => ModelProfileRecord[]
  [IPC_CHANNELS.saveProfile]: (input: ModelProfileInput) => ModelProfileRecord
}

const allowedImageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const maxInputFileBytes = 20 * 1024 * 1024

export function createIpcHandlers(input: CreateIpcHandlersInput): IpcHandlers {
  const createJobDirectoryId = input.createJobDirectoryId ?? randomUUID

  return {
    async [IPC_CHANNELS.selectImage]() {
      const result = await input.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
      })

      return result.canceled ? null : (result.filePaths[0] ?? null)
    },
    [IPC_CHANNELS.listJobs]() {
      return input.jobStore.listJobs()
    },
    [IPC_CHANNELS.createJobFromFile](inputPath: string) {
      const safeInputPath = validateInputImagePath(inputPath)
      const outputDir = join(input.workspaceDir, 'jobs', createJobDirectoryId())
      mkdirSync(outputDir, { recursive: true })
      const copiedInputPath = join(outputDir, basename(safeInputPath))
      copyFileSync(safeInputPath, copiedInputPath)

      const createInput: CreateJobInput = {
        inputPath: copiedInputPath,
        outputDir,
        provider: 'mock',
        model: 'mock-model',
        targetFramework: 'html',
        pageKind: 'web'
      }

      return input.jobStore.createJob(createInput)
    },
    [IPC_CHANNELS.listProfiles]() {
      return input.modelProfileStore.listProfiles()
    },
    [IPC_CHANNELS.saveProfile](profileInput: ModelProfileInput) {
      return input.modelProfileStore.saveProfile(validateModelProfileInput(profileInput))
    }
  }
}

export function registerIpcHandlers(input: CreateIpcHandlersInput & { ipcMain: IpcMainLike }): void {
  const handlers = createIpcHandlers(input)

  input.ipcMain.handle(IPC_CHANNELS.selectImage, () => handlers[IPC_CHANNELS.selectImage]())
  input.ipcMain.handle(IPC_CHANNELS.listJobs, () => handlers[IPC_CHANNELS.listJobs]())
  input.ipcMain.handle(IPC_CHANNELS.createJobFromFile, (_event, inputPath) =>
    handlers[IPC_CHANNELS.createJobFromFile](assertString(inputPath, 'inputPath'))
  )
  input.ipcMain.handle(IPC_CHANNELS.listProfiles, () => handlers[IPC_CHANNELS.listProfiles]())
  input.ipcMain.handle(IPC_CHANNELS.saveProfile, (_event, profileInput) =>
    handlers[IPC_CHANNELS.saveProfile](validateModelProfileInput(profileInput))
  )
}

function validateInputImagePath(inputPath: string): string {
  const normalizedInputPath = assertString(inputPath, 'inputPath')

  if (!isAbsolute(normalizedInputPath)) {
    throw new Error('截图路径必须是绝对路径')
  }

  const extension = extname(normalizedInputPath).toLowerCase()
  if (!allowedImageExtensions.has(extension)) {
    throw new Error('只支持 png、jpg、jpeg、webp 图片')
  }

  const realInputPath = realpathSync(normalizedInputPath)
  const inputStat = statSync(realInputPath)
  if (!inputStat.isFile()) {
    throw new Error('截图路径必须指向文件')
  }

  if (inputStat.size > maxInputFileBytes) {
    throw new Error('截图文件不能超过 20MB')
  }

  return realInputPath
}

function validateModelProfileInput(input: unknown): ModelProfileInput {
  if (!isPlainObject(input)) {
    throw new Error('模型配置必须是对象')
  }

  return {
    name: validateNonEmptyString(input.name, '名称'),
    provider: validateNonEmptyString(input.provider, '服务提供商'),
    baseUrl: validateHttpUrl(input.baseUrl),
    model: validateNonEmptyString(input.model, '模型'),
    apiKeyRef: validateNonEmptyString(input.apiKeyRef, '密钥引用')
  }
}

function validateNonEmptyString(value: unknown, label: string): string {
  const text = assertString(value, label).trim()
  if (!text) {
    throw new Error(`${label}不能为空`)
  }

  if (text.length > 500) {
    throw new Error(`${label}过长`)
  }

  return text
}

function validateHttpUrl(value: unknown): string {
  const urlText = validateNonEmptyString(value, '基础地址')
  const url = new URL(urlText)

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('基础地址必须是 HTTP 或 HTTPS URL')
  }

  return urlText
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label}必须是字符串`)
  }

  return value
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
