import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, realpathSync, statSync } from 'node:fs'
import { basename, extname, isAbsolute, join, resolve } from 'node:path'
import { runWorker as defaultRunWorker, type RunWorkerInput, type WorkerEvent } from './jobs/job-runner'
import type { CreateJobInput, JobRecord, JobStatus, JobStore } from './jobs/job-store'
import type {
  ModelProfileInput,
  ModelProfileRecord,
  ModelProfileStore
} from './models/model-profile-store'

export const IPC_CHANNELS = {
  selectImage: 'dialog:select-image',
  listJobs: 'jobs:list',
  createJobFromFile: 'jobs:create-from-file',
  runJob: 'jobs:run',
  listProfiles: 'profiles:list',
  saveProfile: 'profiles:save'
} as const

export const JOB_EVENT_CHANNEL = 'jobs:event'

export interface IpcMainLike {
  handle: (channel: string, listener: (_event: unknown, ...args: unknown[]) => unknown) => void
}

export interface IpcInvokeEventLike {
  sender: {
    send: (channel: string, payload: unknown) => void
  }
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
  jobStore: Pick<JobStore, 'createJob' | 'listJobs' | 'getJob' | 'updateStatus'>
  modelProfileStore: Pick<ModelProfileStore, 'listProfiles' | 'saveProfile'>
  workspaceDir: string
  showOpenDialog: ShowOpenDialog
  createJobDirectoryId?: () => string
  runWorker?: (input: RunWorkerInput) => Promise<number>
  pythonExecutable?: string
  workerCwd?: string
  appPath?: string
}

type IpcHandlers = {
  [IPC_CHANNELS.selectImage]: () => Promise<string | null>
  [IPC_CHANNELS.listJobs]: () => JobRecord[]
  [IPC_CHANNELS.createJobFromFile]: (input: CreateJobRequest) => JobRecord
  [IPC_CHANNELS.runJob]: (event: IpcInvokeEventLike, jobId: string) => Promise<JobRecord>
  [IPC_CHANNELS.listProfiles]: () => ModelProfileRecord[]
  [IPC_CHANNELS.saveProfile]: (input: ModelProfileInput) => ModelProfileRecord
}

const allowedImageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const allowedTargetFrameworks = new Set(['html', 'vue2', 'vue3', 'react'])
const allowedPageKinds = new Set(['web', 'mobile', 'custom'])
const maxInputFileBytes = 20 * 1024 * 1024

export interface CreateJobRequest {
  inputPath: string
  provider: string
  model: string
  targetFramework: CreateJobInput['targetFramework']
  pageKind: CreateJobInput['pageKind']
}

export function createIpcHandlers(input: CreateIpcHandlersInput): IpcHandlers {
  const createJobDirectoryId = input.createJobDirectoryId ?? randomUUID
  const runWorker = input.runWorker ?? defaultRunWorker
  const pythonExecutable = input.pythonExecutable ?? resolvePythonExecutable()
  const workerCwd = input.workerCwd ?? resolveWorkerCwd(input.appPath)

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
    [IPC_CHANNELS.createJobFromFile](jobInput: CreateJobRequest) {
      const request = validateCreateJobRequest(jobInput)
      const safeInputPath = validateInputImagePath(request.inputPath)
      const outputDir = join(input.workspaceDir, 'jobs', createJobDirectoryId())
      mkdirSync(outputDir, { recursive: true })
      const copiedInputPath = join(outputDir, basename(safeInputPath))
      copyFileSync(safeInputPath, copiedInputPath)

      const createInput: CreateJobInput = {
        inputPath: copiedInputPath,
        outputDir,
        provider: request.provider,
        model: request.model,
        targetFramework: request.targetFramework,
        pageKind: request.pageKind
      }

      return input.jobStore.createJob(createInput)
    },
    async [IPC_CHANNELS.runJob](event: IpcInvokeEventLike, jobId: string) {
      const normalizedJobId = validateJobId(jobId)
      const job = input.jobStore.getJob(normalizedJobId)

      if (!job) {
        throw new Error('任务不存在')
      }

      input.jobStore.updateStatus(job.id, 'running')

      try {
        const exitCode = await runWorker({
          pythonExecutable,
          workerCwd,
          inputPath: job.inputPath,
          outputDir: job.outputDir,
          provider: job.provider,
          model: job.model,
          target: job.targetFramework,
          pageKind: job.pageKind,
          onEvent: (workerEvent) => sendJobEvent(event, job.id, workerEvent)
        })

        return updateJobStatus(input.jobStore, job.id, exitCode === 0 ? 'succeeded' : 'failed')
      } catch (error) {
        const failedJob = updateJobStatus(input.jobStore, job.id, 'failed')
        sendJobEvent(event, job.id, {
          type: 'error',
          message: getErrorMessage(error)
        })
        return failedJob
      }
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
  input.ipcMain.handle(IPC_CHANNELS.createJobFromFile, (_event, createJobInput) =>
    handlers[IPC_CHANNELS.createJobFromFile](validateCreateJobRequest(createJobInput))
  )
  input.ipcMain.handle(IPC_CHANNELS.runJob, (event, jobId) =>
    handlers[IPC_CHANNELS.runJob](event as IpcInvokeEventLike, validateJobId(jobId))
  )
  input.ipcMain.handle(IPC_CHANNELS.listProfiles, () => handlers[IPC_CHANNELS.listProfiles]())
  input.ipcMain.handle(IPC_CHANNELS.saveProfile, (_event, profileInput) =>
    handlers[IPC_CHANNELS.saveProfile](validateModelProfileInput(profileInput))
  )
}

export function resolveWorkerCwd(appPath = process.cwd()): string {
  const candidateRoots = [
    appPath,
    join(appPath, '..', '..'),
    process.cwd(),
    join(process.cwd(), '..', '..')
  ]

  for (const root of Array.from(new Set(candidateRoots.map((candidate) => resolve(candidate))))) {
    const pythonDirectory = join(root, 'python')
    if (existsSync(pythonDirectory)) {
      return pythonDirectory
    }
  }

  return join(resolve(appPath), 'python')
}

function validateCreateJobRequest(input: unknown): CreateJobRequest {
  if (!isPlainObject(input)) {
    throw new Error('任务配置必须是对象')
  }

  const targetFramework = validateEnumValue(
    input.targetFramework,
    allowedTargetFrameworks,
    '目标框架'
  ) as CreateJobRequest['targetFramework']
  const pageKind = validateEnumValue(input.pageKind, allowedPageKinds, '页面类型') as CreateJobRequest['pageKind']

  return {
    inputPath: assertString(input.inputPath, 'inputPath'),
    provider: validateNonEmptyString(input.provider, '服务提供商'),
    model: validateNonEmptyString(input.model, '模型'),
    targetFramework,
    pageKind
  }
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
    apiKeyRef: validateApiKeyRef(input.apiKeyRef)
  }
}

function validateJobId(value: unknown): string {
  return validateNonEmptyString(value, '任务 ID')
}

function updateJobStatus(
  jobStore: Pick<JobStore, 'getJob' | 'updateStatus'>,
  jobId: string,
  status: JobStatus
): JobRecord {
  jobStore.updateStatus(jobId, status)

  const updatedJob = jobStore.getJob(jobId)
  if (!updatedJob) {
    throw new Error('任务不存在')
  }

  return updatedJob
}

function sendJobEvent(event: IpcInvokeEventLike, jobId: string, workerEvent: WorkerEvent): void {
  event.sender.send(JOB_EVENT_CHANNEL, {
    jobId,
    event: workerEvent
  })
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Worker 运行失败'
}

function resolvePythonExecutable(): string {
  const configuredPython = process.env.SCREENCODER_PYTHON?.trim()
  if (configuredPython) {
    return configuredPython
  }

  if (process.platform === 'win32') {
    const launcherResult = spawnSync('py', ['-3', '-c', 'import sys; print(sys.executable)'], {
      encoding: 'utf8'
    })

    if (launcherResult.status === 0 && launcherResult.stdout.trim()) {
      return launcherResult.stdout.trim()
    }
  }

  const candidates = process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python']

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['-c', 'import sys; print(sys.executable)'], {
      encoding: 'utf8'
    })

    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim()
    }
  }

  return process.platform === 'win32' ? 'python' : 'python3'
}

function validateApiKeyRef(value: unknown): string {
  const apiKeyRef = validateNonEmptyString(value, '密钥引用')
  if (!/^secure-store:[a-zA-Z0-9._:-]+$/.test(apiKeyRef)) {
    throw new Error('密钥引用必须使用 secure-store:<id> 格式')
  }

  return apiKeyRef
}

function validateEnumValue(value: unknown, allowedValues: Set<string>, label: string): string {
  const text = assertString(value, label)
  if (!allowedValues.has(text)) {
    throw new Error(`${label}不受支持`)
  }

  return text
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
