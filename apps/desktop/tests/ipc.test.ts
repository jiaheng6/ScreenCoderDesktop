import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createIpcHandlers,
  IPC_CHANNELS,
  registerIpcHandlers,
  type IpcMainLike,
  type JobPreview,
  type ShowOpenDialog
} from '../src/main/ipc'
import type { CreateJobInput, JobRecord } from '../src/main/jobs/job-store'
import type { RunWorkerInput } from '../src/main/jobs/job-runner'
import type {
  ModelProfileInput,
  ModelProfileRecord
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

function getRunJobHandler(handlers: ReturnType<typeof createIpcHandlers>): RunJobHandler {
  return handlers['jobs:run' as keyof typeof handlers] as unknown as RunJobHandler
}

function getReadJobPreviewHandler(
  handlers: ReturnType<typeof createIpcHandlers>
): ReadJobPreviewHandler {
  return handlers['jobs:read-preview' as keyof typeof handlers] as unknown as ReadJobPreviewHandler
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

function createQueuedJob(jobStore: ReturnType<typeof createFakeJobStore>): JobRecord {
  return jobStore.createJob({
    inputPath: 'C:\\workspace\\jobs\\job-1\\screen.png',
    outputDir: 'C:\\workspace\\jobs\\job-1',
    provider: 'mock-provider',
    model: 'mock-model',
    targetFramework: 'react',
    pageKind: 'mobile'
  })
}

function createFakeModelProfileStore(): {
  listProfiles: () => ModelProfileRecord[]
  saveProfile: (input: ModelProfileInput) => ModelProfileRecord
} {
  const records: ModelProfileRecord[] = []

  return {
    listProfiles: () => records,
    saveProfile: (input) => {
      const now = '2026-07-01T00:00:00.000Z'
      const record: ModelProfileRecord = {
        ...input,
        id: `profile-${records.length + 1}`,
        createdAt: now,
        updatedAt: now
      }
      records.unshift(record)
      return record
    }
  }
}

describe('desktop IPC 白名单 API', () => {
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
        provider: 'opencode-go',
        model: 'minimax-m3',
        targetFramework: 'react',
        pageKind: 'mobile'
      })
      const outputDir = join(workspaceDir, 'jobs', 'job-directory-1')
      const copiedInputPath = join(outputDir, basename(inputPath))

      expect(jobStore.createdInputs).toEqual([
        {
          inputPath: copiedInputPath,
          outputDir,
          provider: 'opencode-go',
          model: 'minimax-m3',
          targetFramework: 'react',
          pageKind: 'mobile'
        }
      ])
      expect(created).toMatchObject({
        inputPath: copiedInputPath,
        outputDir,
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
          provider: 'mock',
          model: 'mock-model',
          targetFramework: 'html',
          pageKind: 'web'
        })
      const createDirectoryJob = (): JobRecord =>
        handlers[IPC_CHANNELS.createJobFromFile]({
          inputPath: imageDirectory,
          provider: 'mock',
          model: 'mock-model',
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

  it('可以保存模型配置并读取配置列表', () => {
    const profileStore = createFakeModelProfileStore()
    const handlers = createIpcHandlers({
      jobStore: createFakeJobStore(),
      modelProfileStore: profileStore,
      workspaceDir: 'C:\\workspace',
      showOpenDialog: async () => ({ canceled: true, filePaths: [] })
    })

    const saved = handlers[IPC_CHANNELS.saveProfile]({
      name: '本地 Mock',
      provider: 'mock',
      baseUrl: 'http://127.0.0.1:3000/v1',
      model: 'mock-model',
      apiKeyRef: 'secure-store:mock'
    })

    expect(saved).toMatchObject({
      id: 'profile-1',
      name: '本地 Mock',
      provider: 'mock',
      baseUrl: 'http://127.0.0.1:3000/v1',
      model: 'mock-model',
      apiKeyRef: 'secure-store:mock'
    })
    expect(handlers[IPC_CHANNELS.listProfiles]()).toEqual([saved])
  })

  it('保存模型配置时会拒绝无效 payload', () => {
    const handlers = createIpcHandlers({
      jobStore: createFakeJobStore(),
      modelProfileStore: createFakeModelProfileStore(),
      workspaceDir: 'C:\\workspace',
      showOpenDialog: async () => ({ canceled: true, filePaths: [] })
    })

    expect(() => handlers[IPC_CHANNELS.saveProfile](null as unknown as ModelProfileInput)).toThrow(
      '模型配置必须是对象'
    )
    expect(() =>
      handlers[IPC_CHANNELS.saveProfile]({
        name: '',
        provider: 'mock',
        baseUrl: 'http://127.0.0.1:3000/v1',
        model: 'mock-model',
        apiKeyRef: 'secure-store:mock'
      })
    ).toThrow('名称不能为空')
    expect(() =>
      handlers[IPC_CHANNELS.saveProfile]({
        name: '本地 Mock',
        provider: 'mock',
        baseUrl: 'file:///tmp/model',
        model: 'mock-model',
        apiKeyRef: 'secure-store:mock'
      })
    ).toThrow('基础地址必须是 HTTP 或 HTTPS URL')
    expect(() =>
      handlers[IPC_CHANNELS.saveProfile]({
        name: '本地 Mock',
        provider: 'mock',
        baseUrl: 'http://127.0.0.1:3000/v1',
        model: 'mock-model',
        apiKeyRef: 'sk-should-not-store'
      })
    ).toThrow('密钥引用必须使用 secure-store:<id> 格式')
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
      provider: job.provider,
      model: job.model,
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
