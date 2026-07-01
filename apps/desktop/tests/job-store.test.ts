import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { JobStore, type CreateJobInput } from '../src/main/jobs/job-store'

function createTempDatabasePath(): { databasePath: string; cleanup: () => void } {
  const directory = mkdtempSync(join(tmpdir(), 'screencoder-job-store-'))

  return {
    databasePath: join(directory, 'nested', 'app.db'),
    cleanup: () => rmSync(directory, { recursive: true, force: true })
  }
}

function createJobInput(overrides: Partial<CreateJobInput> = {}): CreateJobInput {
  return {
    inputPath: 'C:\\input\\screen.png',
    outputDir: 'C:\\output',
    provider: 'opencode-go',
    model: 'minimax-m3',
    targetFramework: 'react',
    pageKind: 'web',
    ...overrides
  }
}

describe('JobStore', () => {
  it('可以创建任务、更新状态，并读取任务列表', () => {
    const { databasePath, cleanup } = createTempDatabasePath()
    const store = new JobStore(databasePath)

    try {
      const created = store.createJob(createJobInput())

      expect(created.status).toBe('queued')
      expect(created.id).toHaveLength(36)
      expect(created.createdAt).toEqual(created.updatedAt)

      store.updateStatus(created.id, 'running')

      const updated = store.getJob(created.id)
      expect(updated).toMatchObject({
        id: created.id,
        inputPath: 'C:\\input\\screen.png',
        outputDir: 'C:\\output',
        provider: 'opencode-go',
        model: 'minimax-m3',
        targetFramework: 'react',
        pageKind: 'web',
        status: 'running',
        createdAt: created.createdAt
      })
      expect(updated?.updatedAt).not.toEqual('')

      expect(store.listJobs()).toEqual([updated])
    } finally {
      store.close()
      cleanup()
    }
  })

  it('会拒绝不符合 Worker 契约的页面类型', () => {
    const { databasePath, cleanup } = createTempDatabasePath()
    const store = new JobStore(databasePath)

    try {
      expect(() =>
        store.createJob({
          ...createJobInput(),
          pageKind: 'dashboard'
        } as unknown as CreateJobInput)
      ).toThrow()
    } finally {
      store.close()
      cleanup()
    }
  })
})
