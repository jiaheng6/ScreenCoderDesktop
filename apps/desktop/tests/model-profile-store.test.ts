import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ModelProfileStore } from '../src/main/models/model-profile-store'

function createTempDatabasePath(): { databasePath: string; cleanup: () => void } {
  const directory = mkdtempSync(join(tmpdir(), 'screencoder-model-profile-store-'))

  return {
    databasePath: join(directory, 'app.db'),
    cleanup: () => rmSync(directory, { recursive: true, force: true })
  }
}

describe('ModelProfileStore', () => {
  it('可以保存模型配置并读取配置列表', () => {
    const { databasePath, cleanup } = createTempDatabasePath()
    const store = new ModelProfileStore(databasePath)

    try {
      const saved = store.saveProfile({
        name: 'OpenCode Go',
        provider: 'opencode-go',
        baseUrl: 'https://opencode.ai/zen/go/v1',
        model: 'minimax-m3',
        apiKeyRef: 'secure-store:test'
      })

      expect(saved.id).toHaveLength(36)
      expect(saved.createdAt).toEqual(saved.updatedAt)
      expect(store.listProfiles()).toEqual([
        {
          id: saved.id,
          name: 'OpenCode Go',
          provider: 'opencode-go',
          baseUrl: 'https://opencode.ai/zen/go/v1',
          model: 'minimax-m3',
          apiKeyRef: 'secure-store:test',
          createdAt: saved.createdAt,
          updatedAt: saved.updatedAt
        }
      ])
    } finally {
      store.close()
      cleanup()
    }
  })
})
