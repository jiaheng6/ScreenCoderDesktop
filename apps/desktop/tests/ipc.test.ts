import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  createIpcHandlers,
  IPC_CHANNELS,
  registerIpcHandlers,
  resolvePythonExecutable,
  type IpcMainLike,
  type JobPreview,
  type ShowOpenDialog
} from '../src/main/ipc'
import type { CreateJobInput, JobRecord } from '../src/main/jobs/job-store'
import type { RunWorkerInput } from '../src/main/jobs/job-runner'
import type {
  ModelConfigInput,
  ModelConfigRecord,
  ModelProviderInput,
  ModelProviderRecord,
  RunnableModel
} from '../src/main/models/model-profile-store'

function createTempWorkspace(prefix: string): { directory: string; cleanup: () => void } {
  const directory = mkdtempSync(join(tmpdir(), prefix))

  return {
    directory,
    cleanup: () => rmSync(directory, { recursive: true, force: true })
  }
}

function createFakeJobStore(): {
  createdInputs: CreateJobInput[]
  statusUpdates: Array<{ id: string; status: JobRecord['status'] }>
  listJobs: () => JobRecord[]
  createJob: (input: CreateJobInput) => JobRecord
  getJob: (id: string) => JobRecord | undefined
  updateStatus: (id: string, status: JobRecord['status']) => void
} {
  const records: JobRecord[] = []
  const createdInputs: CreateJobInput[] = []
  const statusUpdates: Array<{ id: string; status: JobRecord['status'] }> = []

  return {
    createdInputs,
    statusUpdates,
    listJobs: () => records,
    createJob: (input) => {
      createdInputs.push(input)
      const now = '2026-07-01T00:00:00.000Z'
      const record: JobRecord = {
        ...input,
        id: `job-record-${records.length + 1}`,
        status: 'queued',
        createdAt: now,
        updatedAt: now
      }
      records.unshift(record)
      return record
    },
    getJob: (id) => records.find((record) => record.id === id),
    updateStatus: (id, status) => {
      statusUpdates.push({ id, status })
      const record = records.find((currentRecord) => currentRecord.id === id)
      if (record) {
        record.status = status
        record.updatedAt = '2026-07-01T00:00:01.000Z'
      }
    }
  }
}

type FakeIpcEvent = {
  sender: {
    send: (channel: string, payload: unknown) => void
  }
}

type RunJobHandler = (event: FakeIpcEvent, jobId: string) => Promise<JobRecord>
type ReadJobPreviewHandler = (jobId: string) => JobPreview
type ReadImagePreviewHandler = (inputPath: string) => { path: string; dataUrl: string }
type TestModelConnectionHandler = (modelId: string) => Promise<{
  ok: boolean
  status: number | null
  message: string
  latencyMs: number
}>

function getRunJobHandler(handlers: ReturnType<typeof createIpcHandlers>): RunJobHandler {
  return handlers['jobs:run' as keyof typeof handlers] as unknown as RunJobHandler
}

function getReadJobPreviewHandler(
  handlers: ReturnType<typeof createIpcHandlers>
): ReadJobPreviewHandler {
  return handlers['jobs:read-preview' as keyof typeof handlers] as unknown as ReadJobPreviewHandler
}

function getReadImagePreviewHandler(
  handlers: ReturnType<typeof createIpcHandlers>
): ReadImagePreviewHandler {
  return handlers['images:read-preview' as keyof typeof handlers] as unknown as ReadImagePreviewHandler
}

function getTestModelConnectionHandler(
  handlers: ReturnType<typeof createIpcHandlers>
): TestModelConnectionHandler {
  return handlers['models:test-connection' as keyof typeof handlers] as unknown as TestModelConnectionHandler
}

function createFakeIpcEvent(sentMessages: Array<{ channel: string; payload: unknown }>): FakeIpcEvent {
  return {
    sender: {
      send: (channel, payload) => {
        sentMessages.push({ channel, payload })
      }
    }
  }
}

function restoreEnvValue(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = value
}

function createQueuedJob(jobStore: ReturnType<typeof createFakeJobStore>): JobRecord {
  return jobStore.createJob({
    inputPath: 'C:\\workspace\\jobs\\job-1\\screen.png',
    outputDir: 'C:\\workspace\\jobs\\job-1',
    modelConfigId: 'model-1',
    provider: 'mock-provider',
    model: 'mock-model',
    targetFramework: 'react',
    pageKind: 'mobile'
  })
}

function createFakeModelProfileStore(): {
  listProviders: () => ModelProviderRecord[]
  saveProvider: (input: ModelProviderInput) => ModelProviderRecord
  listModels: () => ModelConfigRecord[]
  saveModel: (input: ModelConfigInput) => ModelConfigRecord
  getRunnableModel: (modelId: string) => RunnableModel
} {
  const providers: ModelProviderRecord[] = [
    {
      id: 'provider-1',
      name: 'OpenCode Go',
      provider: 'opencode-go',
      baseUrl: 'https://opencode.ai/zen/go/v1',
      hasApiKey: true,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z'
    }
  ]
  const models: ModelConfigRecord[] = [
    {
      id: 'model-1',
      name: 'Minimax M3',
      providerId: 'provider-1',
      model: 'minimax-m3',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z'
    }
  ]

  return {
    listProviders: () => providers,
    saveProvider: (input) => {
      const now = '2026-07-01T00:00:00.000Z'
      const record: ModelProviderRecord = {
        id: input.id ?? `provider-${providers.length + 1}`,
        name: input.name,
        provider: input.provider,
        baseUrl: input.baseUrl,
        hasApiKey: Boolean(input.apiKey),
        createdAt: now,
        updatedAt: now
      }
      providers.unshift(record)
      return record
    },
    listModels: () => models,
    saveModel: (input) => {
      const now = '2026-07-01T00:00:00.000Z'
      const record: ModelConfigRecord = {
        id: input.id ?? `model-${models.length + 1}`,
        name: input.name,
        providerId: input.providerId,
        model: input.model,
        createdAt: now,
        updatedAt: now
      }
      models.unshift(record)
      return record
    },
    getRunnableModel: (modelId) => {
      const model = models.find((currentModel) => currentModel.id === modelId)
      if (!model) {
        throw new Error('模型配置不存在')
      }

      const provider = providers.find((currentProvider) => currentProvider.id === model.providerId)
      if (!provider) {
        throw new Error('模型绑定的提供商不存在')
      }

      return {
        model,
        provider: {
          id: provider.id,
          name: provider.name,
          provider: provider.provider,
          baseUrl: provider.baseUrl,
          apiKey: 'sk-test'
        }
      }
    }
  }
}

describe('desktop IPC 白名单 API', () => {
  it('解析 Python 解释器时会优先使用 ScreenCoder core 旁边的虚拟环境', () => {
    const { directory, cleanup } = createTempWorkspace('screencoder-python-resolution-')
    const previousCoreDir = process.env.SCREENCODER_CORE_DIR
    const previousPython = process.env.SCREENCODER_PYTHON
    const coreDir = join(directory, 'ScreenCoder')
    const pythonPath =
      process.platform === 'win32'
        ? join(coreDir, '.venv', 'Scripts', 'python.exe')
        : join(coreDir, '.venv', 'bin', 'python')

    mkdirSync(dirname(pythonPath), { recursive: true })
    writeFileSync(pythonPath, '')
    process.env.SCREENCODER_CORE_DIR = coreDir
    delete process.env.SCREENCODER_PYTHON

    try {
      expect(resolvePythonExecutable()).toBe(pythonPath)
    } finally {
      restoreEnvValue('SCREENCODER_CORE_DIR', previousCoreDir)
      restoreEnvValue('SCREENCODER_PYTHON', previousPython)
      cleanup()
    }
  })

  it('只注册允许的 IPC channel', () => {
    const registeredChannels: string[] = []
    const ipcMain: IpcMainLike = {
      handle: (channel) => {
        registeredChannels.push(channel)
      }
    }

    registerIpcHandlers({
      ipcMain,
      jobStore: createFakeJobStore(),
      modelProfileStore: createFakeModelProfileStore(),
      workspaceDir: 'C:\\workspace',
      showOpenDialog: async () => ({ canceled: true, filePaths: [] })
    })

    expect(registeredChannels.sort()).toEqual(Object.values(IPC_CHANNELS).sort())
  })

  it('取消选择图片时返回 null，并只允许图片扩展名', async () => {
    let dialogOptions: unknown
    const showOpenDialog: ShowOpenDialog = async (options) => {
      dialogOptions = options
      return { canceled: true, filePaths: [] }
    }

    const handlers = createIpcHandlers({
      jobStore: createFakeJobStore(),
      modelProfileStore: createFakeModelProfileStore(),
      workspaceDir: 'C:\\workspace',
      showOpenDialog
    })

    await expect(handlers[IPC_CHANNELS.selectImage]()).resolves.toBeNull()
    expect(dialogOptions).toEqual({
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    })
  })

  it('选择图片时返回首个文件路径', async () => {
    const selectedPath = 'C:\\images\\screen.webp'
    const handlers = createIpcHandlers({
      jobStore: createFakeJobStore(),
      modelProfileStore: createFakeModelProfileStore(),
      workspaceDir: 'C:\\workspace',
      showOpenDialog: async () => ({
        canceled: false,
        filePaths: [selectedPath, 'C:\\images\\second.png']
      })
    })

    await expect(handlers[IPC_CHANNELS.selectImage]()).resolves.toBe(selectedPath)
  })

  it('从文件创建任务时会复制输入文件，并把输出目录放在 workspace/jobs/{目录ID}', () => {
    const { directory, cleanup } = createTempWorkspace('screencoder-ipc-')
    const inputPath = join(directory, 'screen.png')
    const workspaceDir = join(directory, 'workspace')
    const jobStore = createFakeJobStore()

    writeFileSync(inputPath, Buffer.from('mock image bytes'))

    try {
      const handlers = createIpcHandlers({
        jobStore,
        modelProfileStore: createFakeModelProfileStore(),
        workspaceDir,
        showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
        createJobDirectoryId: () => 'job-directory-1'
      })

      const created = handlers[IPC_CHANNELS.createJobFromFile]({
        inputPath,
        modelConfigId: 'model-1',
        targetFramework: 'react',
        pageKind: 'mobile'
      })
      const outputDir = join(workspaceDir, 'jobs', 'job-directory-1')
      const copiedInputPath = join(outputDir, basename(inputPath))

      expect(jobStore.createdInputs).toEqual([
        {
          inputPath: copiedInputPath,
          outputDir,
          modelConfigId: 'model-1',
          provider: 'opencode-go',
          model: 'minimax-m3',
          targetFramework: 'react',
          pageKind: 'mobile'
        }
      ])
      expect(created).toMatchObject({
        inputPath: copiedInputPath,
        outputDir,
        modelConfigId: 'model-1',
        provider: 'opencode-go',
        model: 'minimax-m3',
        targetFramework: 'react',
        pageKind: 'mobile',
        status: 'queued'
      })
      expect(existsSync(copiedInputPath)).toBe(true)
      expect(readFileSync(copiedInputPath)).toEqual(Buffer.from('mock image bytes'))
    } finally {
      cleanup()
    }
  })

  it('从文件创建任务时会拒绝非图片扩展名和目录路径', () => {
    const { directory, cleanup } = createTempWorkspace('screencoder-ipc-invalid-file-')
    const textPath = join(directory, 'secret.txt')
    const imageDirectory = join(directory, 'folder.png')
    const handlers = createIpcHandlers({
      jobStore: createFakeJobStore(),
      modelProfileStore: createFakeModelProfileStore(),
      workspaceDir: join(directory, 'workspace'),
      showOpenDialog: async () => ({ canceled: true, filePaths: [] })
    })

    writeFileSync(textPath, 'not image', 'utf8')
    mkdirSync(imageDirectory)

    try {
      const createTextJob = (): JobRecord =>
        handlers[IPC_CHANNELS.createJobFromFile]({
          inputPath: textPath,
          modelConfigId: 'model-1',
          targetFramework: 'html',
          pageKind: 'web'
        })
      const createDirectoryJob = (): JobRecord =>
        handlers[IPC_CHANNELS.createJobFromFile]({
          inputPath: imageDirectory,
          modelConfigId: 'model-1',
          targetFramework: 'html',
          pageKind: 'web'
        })

      expect(createTextJob).toThrow(
        '只支持 png、jpg、jpeg、webp 图片'
      )
      expect(createDirectoryJob).toThrow(
        '截图路径必须指向文件'
      )
    } finally {
      cleanup()
    }
  })

  it('读取图片预览时会返回 data URL，避免 renderer 直接访问本地文件', () => {
    const { directory, cleanup } = createTempWorkspace('screencoder-image-preview-')
    const inputPath = join(directory, 'screen.png')
    writeFileSync(inputPath, Buffer.from('mock image bytes'))

    try {
      const handlers = createIpcHandlers({
        jobStore: createFakeJobStore(),
        modelProfileStore: createFakeModelProfileStore(),
        workspaceDir: join(directory, 'workspace'),
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      })

      expect(getReadImagePreviewHandler(handlers)(inputPath)).toEqual({
        path: inputPath,
        dataUrl: `data:image/png;base64,${Buffer.from('mock image bytes').toString('base64')}`
      })
    } finally {
      cleanup()
    }
  })

  it('读取图片预览时会拒绝非图片文件', () => {
    const { directory, cleanup } = createTempWorkspace('screencoder-invalid-image-preview-')
    const inputPath = join(directory, 'screen.txt')
    writeFileSync(inputPath, 'not image', 'utf8')

    try {
      const handlers = createIpcHandlers({
        jobStore: createFakeJobStore(),
        modelProfileStore: createFakeModelProfileStore(),
        workspaceDir: join(directory, 'workspace'),
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      })

      expect(() => getReadImagePreviewHandler(handlers)(inputPath)).toThrow(
        '只支持 png、jpg、jpeg、webp 图片'
      )
    } finally {
      cleanup()
    }
  })

  it('可以分别保存提供商和模型，并读取配置列表', () => {
    const profileStore = createFakeModelProfileStore()
    const handlers = createIpcHandlers({
      jobStore: createFakeJobStore(),
      modelProfileStore: profileStore,
      workspaceDir: 'C:\\workspace',
      showOpenDialog: async () => ({ canceled: true, filePaths: [] })
    })

    const savedProvider = handlers[IPC_CHANNELS.saveProvider]({
      name: '本地 Mock',
      provider: 'mock',
      baseUrl: 'http://127.0.0.1:3000/v1',
      apiKey: 'sk-test'
    })
    const savedModel = handlers[IPC_CHANNELS.saveModel]({
      name: 'Mock 模型',
      providerId: savedProvider.id,
      model: 'mock-model'
    })

    expect(savedProvider).toMatchObject({
      id: 'provider-2',
      name: '本地 Mock',
      provider: 'mock',
      baseUrl: 'http://127.0.0.1:3000/v1',
      hasApiKey: true
    })
    expect(savedModel).toMatchObject({
      id: 'model-2',
      name: 'Mock 模型',
      providerId: savedProvider.id,
      model: 'mock-model'
    })
    expect(handlers[IPC_CHANNELS.listProviders]()[0]).toEqual(savedProvider)
    expect(handlers[IPC_CHANNELS.listModels]()[0]).toEqual(savedModel)
  })

  it('保存提供商和模型时会拒绝无效 payload', () => {
    const handlers = createIpcHandlers({
      jobStore: createFakeJobStore(),
      modelProfileStore: createFakeModelProfileStore(),
      workspaceDir: 'C:\\workspace',
      showOpenDialog: async () => ({ canceled: true, filePaths: [] })
    })

    expect(() => handlers[IPC_CHANNELS.saveProvider](null as unknown as ModelProviderInput)).toThrow(
      '提供商配置必须是对象'
    )
    expect(() =>
      handlers[IPC_CHANNELS.saveProvider]({
        name: '',
        provider: 'mock',
        baseUrl: 'http://127.0.0.1:3000/v1'
      })
    ).toThrow('名称不能为空')
    expect(() =>
      handlers[IPC_CHANNELS.saveProvider]({
        name: '本地 Mock',
        provider: 'mock',
        baseUrl: 'file:///tmp/model'
      })
    ).toThrow('基础地址必须是 HTTP 或 HTTPS URL')
    expect(() =>
      handlers[IPC_CHANNELS.saveModel]({
        name: 'Mock 模型',
        providerId: '',
        model: 'mock-model'
      })
    ).toThrow('提供商 ID不能为空')
  })

  it('测试模型连接时会使用已保存提供商的基础地址和密钥', async () => {
    let testerInput: RunnableModel | undefined
    const handlers = createIpcHandlers({
      jobStore: createFakeJobStore(),
      modelProfileStore: createFakeModelProfileStore(),
      workspaceDir: 'C:\\workspace',
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      modelConnectionTester: async (input) => {
        testerInput = input
        return {
          ok: true,
          status: 200,
          message: '连接成功',
          latencyMs: 12
        }
      }
    })

    await expect(getTestModelConnectionHandler(handlers)('model-1')).resolves.toEqual({
      ok: true,
      status: 200,
      message: '连接成功',
      latencyMs: 12
    })
    expect(testerInput).toEqual({
      model: {
        id: 'model-1',
        name: 'Minimax M3',
        providerId: 'provider-1',
        model: 'minimax-m3',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z'
      },
      provider: {
        id: 'provider-1',
        name: 'OpenCode Go',
        provider: 'opencode-go',
        baseUrl: 'https://opencode.ai/zen/go/v1',
        apiKey: 'sk-test'
      }
    })
  })

  it('运行任务时会更新状态、调用 Worker 并转发实时事件', async () => {
    const jobStore = createFakeJobStore()
    const job = createQueuedJob(jobStore)
    const sentMessages: Array<{ channel: string; payload: unknown }> = []
    let workerInput: RunWorkerInput | undefined
    const handlers = createIpcHandlers({
      jobStore,
      modelProfileStore: createFakeModelProfileStore(),
      workspaceDir: 'C:\\workspace',
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      pythonExecutable: 'C:\\Python\\python.exe',
      workerCwd: 'C:\\repo\\python',
      runWorker: async (input) => {
        workerInput = input
        input.onEvent({ type: 'stage', stage: 'start', status: 'running' })
        return 0
      }
    })

    const result = await getRunJobHandler(handlers)(createFakeIpcEvent(sentMessages), job.id)

    expect(workerInput).toMatchObject({
      pythonExecutable: 'C:\\Python\\python.exe',
      workerCwd: 'C:\\repo\\python',
      inputPath: job.inputPath,
      outputDir: job.outputDir,
      provider: 'opencode-go',
      model: 'minimax-m3',
      baseUrl: 'https://opencode.ai/zen/go/v1',
      apiKey: 'sk-test',
      target: job.targetFramework,
      pageKind: job.pageKind
    })
    expect(sentMessages).toEqual([
      {
        channel: 'jobs:event',
        payload: {
          jobId: job.id,
          event: { type: 'stage', stage: 'start', status: 'running' }
        }
      }
    ])
    expect(jobStore.statusUpdates).toEqual([
      { id: job.id, status: 'running' },
      { id: job.id, status: 'succeeded' }
    ])
    expect(result).toMatchObject({ id: job.id, status: 'succeeded' })
  })

  it('Worker 返回非零退出码时会把任务标记为失败并返回失败记录', async () => {
    const jobStore = createFakeJobStore()
    const job = createQueuedJob(jobStore)
    const handlers = createIpcHandlers({
      jobStore,
      modelProfileStore: createFakeModelProfileStore(),
      workspaceDir: 'C:\\workspace',
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      pythonExecutable: 'C:\\Python\\python.exe',
      workerCwd: 'C:\\repo\\python',
      runWorker: async (input) => {
        input.onEvent({ type: 'stage', stage: 'final', status: 'failed' })
        return 2
      }
    })

    const result = await getRunJobHandler(handlers)(createFakeIpcEvent([]), job.id)

    expect(jobStore.statusUpdates).toEqual([
      { id: job.id, status: 'running' },
      { id: job.id, status: 'failed' }
    ])
    expect(result).toMatchObject({ id: job.id, status: 'failed' })
  })

  it('Worker 抛出异常时会发送错误事件并把任务标记为失败', async () => {
    const jobStore = createFakeJobStore()
    const job = createQueuedJob(jobStore)
    const sentMessages: Array<{ channel: string; payload: unknown }> = []
    const handlers = createIpcHandlers({
      jobStore,
      modelProfileStore: createFakeModelProfileStore(),
      workspaceDir: 'C:\\workspace',
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      pythonExecutable: 'C:\\Python\\python.exe',
      workerCwd: 'C:\\repo\\python',
      runWorker: async () => {
        throw new Error('Worker 启动失败')
      }
    })

    const result = await getRunJobHandler(handlers)(createFakeIpcEvent(sentMessages), job.id)

    expect(sentMessages).toEqual([
      {
        channel: 'jobs:event',
        payload: {
          jobId: job.id,
          event: { type: 'error', message: 'Worker 启动失败' }
        }
      }
    ])
    expect(jobStore.statusUpdates).toEqual([
      { id: job.id, status: 'running' },
      { id: job.id, status: 'failed' }
    ])
    expect(result).toMatchObject({ id: job.id, status: 'failed' })
  })

  it('运行不存在的任务时会抛出中文错误', async () => {
    const handlers = createIpcHandlers({
      jobStore: createFakeJobStore(),
      modelProfileStore: createFakeModelProfileStore(),
      workspaceDir: 'C:\\workspace',
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      runWorker: async () => 0
    })

    await expect(getRunJobHandler(handlers)(createFakeIpcEvent([]), 'missing-job')).rejects.toThrow(
      '任务不存在'
    )
  })

  it('读取任务预览时会返回 final.html 和目标框架源码产物', () => {
    const { directory, cleanup } = createTempWorkspace('screencoder-preview-')
    const outputDir = join(directory, 'job-output')
    const finalHtmlPath = join(outputDir, 'final.html')
    const sourcePath = join(outputDir, 'ScreenCoderPage.tsx')
    const jobStore = createFakeJobStore()

    mkdirSync(outputDir)
    writeFileSync(finalHtmlPath, '<main>最终页面</main>', 'utf8')
    writeFileSync(sourcePath, 'export function ScreenCoderPage() {}', 'utf8')
    const job = jobStore.createJob({
      inputPath: join(outputDir, 'input.png'),
      outputDir,
      modelConfigId: 'model-1',
      provider: 'mock-provider',
      model: 'mock-model',
      targetFramework: 'react',
      pageKind: 'web'
    })

    try {
      const handlers = createIpcHandlers({
        jobStore,
        modelProfileStore: createFakeModelProfileStore(),
        workspaceDir: 'C:\\workspace',
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      })

      expect(getReadJobPreviewHandler(handlers)(job.id)).toEqual({
        jobId: job.id,
        htmlPath: finalHtmlPath,
        htmlUrl: pathToFileURL(finalHtmlPath).href,
        html: '<main>最终页面</main>',
        sourcePath,
        source: 'export function ScreenCoderPage() {}'
      })
    } finally {
      cleanup()
    }
  })

  it('读取任务预览时缺少 final.html 会抛出中文错误', () => {
    const { directory, cleanup } = createTempWorkspace('screencoder-missing-preview-')
    const outputDir = join(directory, 'job-output')
    const jobStore = createFakeJobStore()

    mkdirSync(outputDir)
    const job = jobStore.createJob({
      inputPath: join(outputDir, 'input.png'),
      outputDir,
      modelConfigId: 'model-1',
      provider: 'mock-provider',
      model: 'mock-model',
      targetFramework: 'html',
      pageKind: 'web'
    })

    try {
      const handlers = createIpcHandlers({
        jobStore,
        modelProfileStore: createFakeModelProfileStore(),
        workspaceDir: 'C:\\workspace',
        showOpenDialog: async () => ({ canceled: true, filePaths: [] })
      })

      expect(() => getReadJobPreviewHandler(handlers)(job.id)).toThrow('最终预览文件不存在')
    } finally {
      cleanup()
    }
  })
})
