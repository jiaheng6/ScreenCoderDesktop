import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync
} from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runWorker as defaultRunWorker, type RunWorkerInput, type WorkerEvent } from './jobs/job-runner'
import type { CreateJobInput, JobRecord, JobStatus, JobStore } from './jobs/job-store'
import {
  defaultModelConnectionTester,
  type ModelConnectionTester,
  type ModelConnectionTestResult
} from './models/model-connection'
import type {
  ModelConfigInput,
  ModelConfigRecord,
  ModelProviderInput,
  ModelProviderRecord,
  ModelProfileStore
} from './models/model-profile-store'

export const IPC_CHANNELS = {
  selectImage: 'dialog:select-image',
  readImagePreview: 'images:read-preview',
  listJobs: 'jobs:list',
  createJobFromFile: 'jobs:create-from-file',
  runJob: 'jobs:run',
  readJobPreview: 'jobs:read-preview',
  deleteJobs: 'jobs:delete',
  listProviders: 'providers:list',
  saveProvider: 'providers:save',
  listModels: 'models:list',
  saveModel: 'models:save',
  testModelConnection: 'models:test-connection'
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

export interface JobPreview {
  jobId: string
  htmlPath: string
  htmlUrl: string
  previewHtml: string
  imageWidth: number | null
  imageHeight: number | null
  inputPreview: ImagePreview | null
  annotationPreview: ImagePreview | null
  html: string
  sourcePath: string | null
  source: string | null
}

export interface ImagePreview {
  path: string
  dataUrl: string
  imageWidth: number | null
  imageHeight: number | null
}

interface ImageDimensions {
  width: number
  height: number
}

interface CreateIpcHandlersInput {
  jobStore: Pick<JobStore, 'createJob' | 'listJobs' | 'getJob' | 'updateStatus' | 'deleteJobs'>
  modelProfileStore: Pick<
    ModelProfileStore,
    'listProviders' | 'saveProvider' | 'listModels' | 'saveModel' | 'getRunnableModel'
  >
  workspaceDir: string
  showOpenDialog: ShowOpenDialog
  createJobDirectoryId?: () => string
  runWorker?: (input: RunWorkerInput) => Promise<number>
  modelConnectionTester?: ModelConnectionTester
  pythonExecutable?: string
  workerCwd?: string
  appPath?: string
}

type IpcHandlers = {
  [IPC_CHANNELS.selectImage]: () => Promise<string | null>
  [IPC_CHANNELS.readImagePreview]: (inputPath: string) => ImagePreview
  [IPC_CHANNELS.listJobs]: () => JobRecord[]
  [IPC_CHANNELS.createJobFromFile]: (input: CreateJobRequest) => JobRecord
  [IPC_CHANNELS.runJob]: (event: IpcInvokeEventLike, jobId: string) => Promise<JobRecord>
  [IPC_CHANNELS.readJobPreview]: (jobId: string) => JobPreview
  [IPC_CHANNELS.deleteJobs]: (jobIds: string[]) => { deletedCount: number }
  [IPC_CHANNELS.listProviders]: () => ModelProviderRecord[]
  [IPC_CHANNELS.saveProvider]: (input: ModelProviderInput) => ModelProviderRecord
  [IPC_CHANNELS.listModels]: () => ModelConfigRecord[]
  [IPC_CHANNELS.saveModel]: (input: ModelConfigInput) => ModelConfigRecord
  [IPC_CHANNELS.testModelConnection]: (modelId: string) => Promise<ModelConnectionTestResult>
}

const allowedImageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const allowedTargetFrameworks = new Set(['html', 'vue2', 'vue3', 'react'])
const allowedPageKinds = new Set(['web', 'mobile', 'custom'])
const maxInputFileBytes = 20 * 1024 * 1024

export interface CreateJobRequest {
  inputPath: string
  modelConfigId: string
  targetFramework: CreateJobInput['targetFramework']
  pageKind: CreateJobInput['pageKind']
}

export function createIpcHandlers(input: CreateIpcHandlersInput): IpcHandlers {
  const createJobDirectoryId = input.createJobDirectoryId ?? randomUUID
  const runWorker = input.runWorker ?? defaultRunWorker
  const modelConnectionTester = input.modelConnectionTester ?? defaultModelConnectionTester
  const pythonExecutable = input.pythonExecutable ?? resolvePythonExecutable(input.appPath)
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
    [IPC_CHANNELS.readImagePreview](inputPath: string) {
      return readImagePreview(inputPath)
    },
    [IPC_CHANNELS.createJobFromFile](jobInput: CreateJobRequest) {
      const request = validateCreateJobRequest(jobInput)
      const safeInputPath = validateInputImagePath(request.inputPath)
      const runnableModel = input.modelProfileStore.getRunnableModel(request.modelConfigId)
      const outputDir = join(input.workspaceDir, 'jobs', createJobDirectoryId())
      mkdirSync(outputDir, { recursive: true })
      const copiedInputPath = join(outputDir, basename(safeInputPath))
      copyFileSync(safeInputPath, copiedInputPath)

      const createInput: CreateJobInput = {
        inputPath: copiedInputPath,
        outputDir,
        modelConfigId: runnableModel.model.id,
        provider: runnableModel.provider.provider,
        model: runnableModel.model.model,
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
        const runnableModel = input.modelProfileStore.getRunnableModel(job.modelConfigId)
        const exitCode = await runWorker({
          pythonExecutable,
          workerCwd,
          inputPath: job.inputPath,
          outputDir: job.outputDir,
          provider: runnableModel.provider.provider,
          model: runnableModel.model.model,
          baseUrl: runnableModel.provider.baseUrl,
          apiKey: runnableModel.provider.apiKey,
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
    [IPC_CHANNELS.readJobPreview](jobId: string) {
      const normalizedJobId = validateJobId(jobId)
      const job = input.jobStore.getJob(normalizedJobId)

      if (!job) {
        throw new Error('任务不存在')
      }

      return readJobPreview(job)
    },
    [IPC_CHANNELS.deleteJobs](jobIds: string[]) {
      const normalizedJobIds = validateJobIds(jobIds)
      const jobsToDelete = normalizedJobIds
        .map((jobId) => input.jobStore.getJob(jobId))
        .filter((job): job is JobRecord => Boolean(job))
      const outputDirectories = collectSafeJobOutputDirectories(input.workspaceDir, jobsToDelete)
      const deletedCount = input.jobStore.deleteJobs(normalizedJobIds)

      for (const outputDirectory of outputDirectories) {
        rmSync(outputDirectory, { recursive: true, force: true })
      }

      return { deletedCount }
    },
    [IPC_CHANNELS.listProviders]() {
      return input.modelProfileStore.listProviders()
    },
    [IPC_CHANNELS.saveProvider](providerInput: ModelProviderInput) {
      return input.modelProfileStore.saveProvider(validateModelProviderInput(providerInput))
    },
    [IPC_CHANNELS.listModels]() {
      return input.modelProfileStore.listModels()
    },
    [IPC_CHANNELS.saveModel](modelInput: ModelConfigInput) {
      return input.modelProfileStore.saveModel(validateModelConfigInput(modelInput))
    },
    [IPC_CHANNELS.testModelConnection](modelId: string) {
      const runnableModel = input.modelProfileStore.getRunnableModel(validateModelConfigId(modelId))

      return modelConnectionTester(runnableModel)
    }
  }
}

export function registerIpcHandlers(input: CreateIpcHandlersInput & { ipcMain: IpcMainLike }): void {
  const handlers = createIpcHandlers(input)

  input.ipcMain.handle(IPC_CHANNELS.selectImage, () => handlers[IPC_CHANNELS.selectImage]())
  input.ipcMain.handle(IPC_CHANNELS.readImagePreview, (_event, inputPath) =>
    handlers[IPC_CHANNELS.readImagePreview](assertString(inputPath, 'inputPath'))
  )
  input.ipcMain.handle(IPC_CHANNELS.listJobs, () => handlers[IPC_CHANNELS.listJobs]())
  input.ipcMain.handle(IPC_CHANNELS.createJobFromFile, (_event, createJobInput) =>
    handlers[IPC_CHANNELS.createJobFromFile](validateCreateJobRequest(createJobInput))
  )
  input.ipcMain.handle(IPC_CHANNELS.runJob, (event, jobId) =>
    handlers[IPC_CHANNELS.runJob](event as IpcInvokeEventLike, validateJobId(jobId))
  )
  input.ipcMain.handle(IPC_CHANNELS.readJobPreview, (_event, jobId) =>
    handlers[IPC_CHANNELS.readJobPreview](validateJobId(jobId))
  )
  input.ipcMain.handle(IPC_CHANNELS.deleteJobs, (_event, jobIds) =>
    handlers[IPC_CHANNELS.deleteJobs](validateJobIds(jobIds))
  )
  input.ipcMain.handle(IPC_CHANNELS.listProviders, () => handlers[IPC_CHANNELS.listProviders]())
  input.ipcMain.handle(IPC_CHANNELS.saveProvider, (_event, providerInput) =>
    handlers[IPC_CHANNELS.saveProvider](validateModelProviderInput(providerInput))
  )
  input.ipcMain.handle(IPC_CHANNELS.listModels, () => handlers[IPC_CHANNELS.listModels]())
  input.ipcMain.handle(IPC_CHANNELS.saveModel, (_event, modelInput) =>
    handlers[IPC_CHANNELS.saveModel](validateModelConfigInput(modelInput))
  )
  input.ipcMain.handle(IPC_CHANNELS.testModelConnection, (_event, modelId) =>
    handlers[IPC_CHANNELS.testModelConnection](validateModelConfigId(modelId))
  )
}

export function resolveWorkerCwd(appPath = process.cwd()): string {
  const packagedResourcesPath = getPackagedResourcesPath()
  const candidateRoots = [
    process.env.SCREENCODER_RUNTIME_DIR,
    packagedResourcesPath,
    appPath,
    join(appPath, '..', '..'),
    process.cwd(),
    join(process.cwd(), '..', '..')
  ].filter((candidate): candidate is string => Boolean(candidate))

  for (const root of Array.from(new Set(candidateRoots.map((candidate) => resolve(candidate))))) {
    const pythonDirectories = [join(root, 'python'), join(root, 'runtime', 'python')]
    for (const pythonDirectory of pythonDirectories) {
      if (existsSync(pythonDirectory)) {
        return pythonDirectory
      }
    }
  }

  return join(resolve(appPath), 'python')
}

function getPackagedResourcesPath(): string | undefined {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath

  return resourcesPath && resourcesPath.trim() ? resourcesPath : undefined
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
    modelConfigId: validateModelConfigId(input.modelConfigId),
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

function readImagePreview(inputPath: string): ImagePreview {
  const safeInputPath = validateInputImagePath(inputPath)

  return readImageFilePreview(safeInputPath)
}

function readImageFilePreview(safeInputPath: string): ImagePreview {
  const extension = extname(safeInputPath).toLowerCase()
  const mediaType =
    extension === '.jpg' || extension === '.jpeg'
      ? 'image/jpeg'
      : extension === '.webp'
        ? 'image/webp'
        : 'image/png'

  return {
    path: safeInputPath,
    dataUrl: `data:${mediaType};base64,${readFileSync(safeInputPath).toString('base64')}`,
    ...readOptionalImageDimensions(safeInputPath)
  }
}

function validateModelProviderInput(input: unknown): ModelProviderInput {
  if (!isPlainObject(input)) {
    throw new Error('提供商配置必须是对象')
  }

  return {
    id: validateOptionalId(input.id, '提供商 ID'),
    name: validateNonEmptyString(input.name, '名称'),
    provider: validateNonEmptyString(input.provider, '服务提供商'),
    baseUrl: validateHttpUrl(input.baseUrl),
    apiKey: validateOptionalSecret(input.apiKey, 'API Key')
  }
}

function validateModelConfigInput(input: unknown): ModelConfigInput {
  if (!isPlainObject(input)) {
    throw new Error('模型配置必须是对象')
  }

  return {
    id: validateOptionalId(input.id, '模型 ID'),
    name: validateNonEmptyString(input.name, '名称'),
    providerId: validateModelProviderId(input.providerId),
    model: validateNonEmptyString(input.model, '模型')
  }
}

function validateJobId(value: unknown): string {
  return validateNonEmptyString(value, '任务 ID')
}

function validateJobIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error('任务 ID 列表必须是数组')
  }

  if (value.length > 500) {
    throw new Error('一次最多删除 500 个任务')
  }

  return Array.from(new Set(value.map((item) => validateJobId(item))))
}

function validateModelProviderId(value: unknown): string {
  return validateNonEmptyString(value, '提供商 ID')
}

function validateModelConfigId(value: unknown): string {
  return validateNonEmptyString(value, '模型 ID')
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

function readJobPreview(job: JobRecord): JobPreview {
  const finalHtml = readRequiredOutputFile(job.outputDir, 'final.html', '最终预览文件')
  const sourceFileName = getSourceFileName(job.targetFramework)
  const sourceFile = sourceFileName
    ? readOptionalOutputFile(job.outputDir, sourceFileName)
    : null
  const imageDimensions = readOptionalImageDimensions(job.inputPath)
  const inputPreview = readOptionalExistingImagePreview(job.inputPath)
  const annotationPreview = readOptionalAnnotationPreview(job.outputDir)

  return {
    jobId: job.id,
    htmlPath: finalHtml.path,
    htmlUrl: pathToFileURL(finalHtml.path).href,
    previewHtml: buildPreviewHtml(finalHtml.content, finalHtml.path),
    imageWidth: imageDimensions.imageWidth,
    imageHeight: imageDimensions.imageHeight,
    inputPreview,
    annotationPreview,
    html: finalHtml.content,
    sourcePath: sourceFile?.path ?? null,
    source: sourceFile?.content ?? null
  }
}

function readOptionalExistingImagePreview(path: string): ImagePreview | null {
  if (!existsSync(path)) {
    return null
  }

  const realPath = realpathSync(path)
  if (!statSync(realPath).isFile()) {
    return null
  }

  return readImageFilePreview(realPath)
}

function readOptionalAnnotationPreview(outputDir: string): ImagePreview | null {
  if (!existsSync(outputDir)) {
    return null
  }

  const outputRoot = realpathSync(outputDir)
  const candidatePaths = [
    join(outputRoot, 'screencoder-work', 'data', 'tmp', 'debug_gray_bboxes_test1.png'),
    join(outputRoot, 'screencoder-work', 'data', 'tmp', 'test1_with_bboxes.png'),
    join(outputRoot, 'screencoder-work', 'data', 'tmp', 'overlay_test_test1.png')
  ]

  for (const candidatePath of candidatePaths) {
    if (!existsSync(candidatePath)) {
      continue
    }

    const realCandidatePath = realpathSync(candidatePath)
    if (!isPathInsideDirectory(realCandidatePath, outputRoot)) {
      continue
    }

    if (!statSync(realCandidatePath).isFile()) {
      continue
    }

    return readImageFilePreview(realCandidatePath)
  }

  return null
}

function collectSafeJobOutputDirectories(workspaceDir: string, jobs: JobRecord[]): string[] {
  if (jobs.length === 0) {
    return []
  }

  mkdirSync(workspaceDir, { recursive: true })
  const workspaceRoot = realpathSync(workspaceDir)
  const jobsRoot = resolve(workspaceRoot, 'jobs')
  const directories = new Set<string>()

  for (const job of jobs) {
    const outputDirectory = resolveSafeJobOutputDirectory(jobsRoot, job.outputDir)
    if (outputDirectory) {
      directories.add(outputDirectory)
    }
  }

  return Array.from(directories)
}

function resolveSafeJobOutputDirectory(jobsRoot: string, outputDir: string): string | null {
  if (!existsSync(outputDir)) {
    return null
  }

  const realOutputDir = realpathSync(outputDir)
  if (!isPathInsideDirectory(realOutputDir, jobsRoot)) {
    return null
  }

  if (!statSync(realOutputDir).isDirectory()) {
    return null
  }

  return realOutputDir
}

function getSourceFileName(targetFramework: JobRecord['targetFramework']): string | null {
  if (targetFramework === 'vue2' || targetFramework === 'vue3') {
    return 'ScreenCoderPage.vue'
  }

  if (targetFramework === 'react') {
    return 'ScreenCoderPage.tsx'
  }

  return null
}

function readRequiredOutputFile(
  outputDir: string,
  fileName: string,
  label: string
): { path: string; content: string } {
  if (!existsSync(outputDir)) {
    throw new Error('任务输出目录不存在')
  }

  const outputRoot = realpathSync(outputDir)
  const targetPath = join(outputRoot, fileName)

  if (!existsSync(targetPath)) {
    throw new Error(`${label}不存在`)
  }

  return readSafeOutputFile(outputRoot, targetPath, label)
}

function readOptionalOutputFile(
  outputDir: string,
  fileName: string
): { path: string; content: string } | null {
  if (!existsSync(outputDir)) {
    return null
  }

  const outputRoot = realpathSync(outputDir)
  const targetPath = join(outputRoot, fileName)

  if (!existsSync(targetPath)) {
    return null
  }

  return readSafeOutputFile(outputRoot, targetPath, '源码文件')
}

function readSafeOutputFile(
  outputRoot: string,
  targetPath: string,
  label: string
): { path: string; content: string } {
  const realTargetPath = realpathSync(targetPath)

  if (!isPathInsideDirectory(realTargetPath, outputRoot)) {
    throw new Error(`${label}不在任务输出目录内`)
  }

  if (!statSync(realTargetPath).isFile()) {
    throw new Error(`${label}必须是文件`)
  }

  return {
    path: realTargetPath,
    content: readFileSync(realTargetPath, 'utf8')
  }
}

function buildPreviewHtml(html: string, htmlPath: string): string {
  const outputRoot = realpathSync(dirname(htmlPath))

  return html.replace(/\b(src|href)=(["'])([^"']+)\2/gi, (match, attribute, quote, value) => {
    const dataUrl = resolvePreviewAssetDataUrl(value, outputRoot)

    return dataUrl ? `${attribute}=${quote}${dataUrl}${quote}` : match
  })
}

function resolvePreviewAssetDataUrl(reference: string, outputRoot: string): string | null {
  const trimmedReference = reference.trim()
  if (
    !trimmedReference ||
    trimmedReference.startsWith('#') ||
    trimmedReference.startsWith('//') ||
    /^[a-z][a-z\d+.-]*:/i.test(trimmedReference)
  ) {
    return null
  }

  const assetReferencePath = trimmedReference.split(/[?#]/, 1)[0]
  if (!assetReferencePath) {
    return null
  }

  const candidatePath = resolve(outputRoot, assetReferencePath)
  if (!existsSync(candidatePath)) {
    return null
  }

  const realCandidatePath = realpathSync(candidatePath)
  if (!isPathInsideDirectory(realCandidatePath, outputRoot)) {
    return null
  }

  const candidateStat = statSync(realCandidatePath)
  if (!candidateStat.isFile()) {
    return null
  }

  const mediaType = getPreviewAssetMediaType(realCandidatePath)
  if (!mediaType) {
    return null
  }

  return `data:${mediaType};base64,${readFileSync(realCandidatePath).toString('base64')}`
}

function getPreviewAssetMediaType(path: string): string | null {
  switch (extname(path).toLowerCase()) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.svg':
      return 'image/svg+xml'
    case '.css':
      return 'text/css'
    case '.js':
    case '.mjs':
      return 'text/javascript'
    default:
      return null
  }
}

function readOptionalImageDimensions(path: string): {
  imageWidth: number | null
  imageHeight: number | null
} {
  if (!existsSync(path)) {
    return { imageWidth: null, imageHeight: null }
  }

  const dimensions = readImageDimensions(readFileSync(path))

  return {
    imageWidth: dimensions?.width ?? null,
    imageHeight: dimensions?.height ?? null
  }
}

function readImageDimensions(buffer: Buffer): ImageDimensions | null {
  return readPngDimensions(buffer) ?? readJpegDimensions(buffer) ?? readWebpDimensions(buffer)
}

function readPngDimensions(buffer: Buffer): ImageDimensions | null {
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(pngSignature)) {
    return null
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  }
}

function readJpegDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null
  }

  let offset = 2
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1
      continue
    }

    const marker = buffer[offset + 1]
    const length = buffer.readUInt16BE(offset + 2)
    if (length < 2 || offset + 2 + length > buffer.length) {
      return null
    }

    if (isJpegStartOfFrameMarker(marker)) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7)
      }
    }

    offset += 2 + length
  }

  return null
}

function isJpegStartOfFrameMarker(marker: number): boolean {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    ![0xc4, 0xc8, 0xcc].includes(marker)
  )
}

function readWebpDimensions(buffer: Buffer): ImageDimensions | null {
  if (
    buffer.length < 30 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return null
  }

  const format = buffer.toString('ascii', 12, 16)
  if (format === 'VP8X' && buffer.length >= 30) {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3)
    }
  }

  if (format === 'VP8 ' && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff
    }
  }

  if (format === 'VP8L' && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21)

    return {
      width: 1 + (bits & 0x3fff),
      height: 1 + ((bits >> 14) & 0x3fff)
    }
  }

  return null
}

function isPathInsideDirectory(targetPath: string, directoryPath: string): boolean {
  const relativePath = relative(directoryPath, targetPath)
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

export function resolvePythonExecutable(appPath = process.cwd()): string {
  const configuredPython = process.env.SCREENCODER_PYTHON?.trim()
  if (configuredPython) {
    return configuredPython
  }

  const virtualEnvPython = resolveVirtualEnvPythonExecutable(appPath)
  if (virtualEnvPython) {
    return virtualEnvPython
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

function resolveVirtualEnvPythonExecutable(appPath: string): string | null {
  const candidateCoreDirs = resolveCandidateCoreDirs(appPath)
  const executableRelativePath =
    process.platform === 'win32'
      ? join('.venv', 'Scripts', 'python.exe')
      : join('.venv', 'bin', 'python')

  for (const coreDir of candidateCoreDirs) {
    const candidate = join(coreDir, executableRelativePath)
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

function resolveCandidateCoreDirs(appPath: string): string[] {
  const packagedResourcesPath = getPackagedResourcesPath()
  const roots = [
    process.env.SCREENCODER_CORE_DIR,
    packagedResourcesPath ? join(packagedResourcesPath, 'screencoder-core') : undefined,
    appPath,
    process.cwd(),
    join(process.cwd(), '..'),
    join(process.cwd(), '..', '..'),
    join(process.cwd(), '..', '..', '..')
  ].filter((candidate): candidate is string => Boolean(candidate))
  const candidates: string[] = []

  for (const root of roots) {
    candidates.push(root)
    candidates.push(join(root, 'screencoder-core'))
    candidates.push(join(root, 'ScreenCoder'))
    candidates.push(join(root, '..', 'ScreenCoder'))
  }

  return Array.from(new Set(candidates.map((candidate) => resolve(candidate))))
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

function validateOptionalId(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  return validateNonEmptyString(value, label)
}

function validateOptionalSecret(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  const secret = assertString(value, label)
  if (secret.length > 10_000) {
    throw new Error(`${label}过长`)
  }

  return secret
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
