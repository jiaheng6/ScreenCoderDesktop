import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createIpcHandlers,
  IPC_CHANNELS,
  registerIpcHandlers,
  type IpcMainLike,
  type ShowOpenDialog
} from '../src/main/ipc'
import type { CreateJobInput, JobRecord } from '../src/main/jobs/job-store'
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
  listJobs: () => JobRecord[]
  createJob: (input: CreateJobInput) => JobRecord
} {
  const records: JobRecord[] = []
  const createdInputs: CreateJobInput[] = []

  return {
    createdInputs,
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
    }
  }
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
})
