import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ModelProfileStore, type SecretCodec } from '../src/main/models/model-profile-store'

const testSecretCodec: SecretCodec = {
  encrypt: (value) => `encrypted:${value}`,
  decrypt: (value) => value.replace(/^encrypted:/, '')
}

function createTempDatabasePath(): { databasePath: string; cleanup: () => void } {
  const directory = mkdtempSync(join(tmpdir(), 'screencoder-model-profile-store-'))

  return {
    databasePath: join(directory, 'app.db'),
    cleanup: () => rmSync(directory, { recursive: true, force: true })
  }
}

describe('ModelProfileStore', () => {
  it('可以分别保存提供商和模型，并且列表不会暴露 API Key', () => {
    const { databasePath, cleanup } = createTempDatabasePath()
    const store = new ModelProfileStore(databasePath, testSecretCodec)

    try {
      const provider = store.saveProvider({
        name: 'OpenCode Go',
        provider: 'opencode-go',
        baseUrl: 'https://opencode.ai/zen/go/v1',
        apiKey: 'sk-test'
      })
      const model = store.saveModel({
        name: 'Minimax M3',
        providerId: provider.id,
        model: 'minimax-m3'
      })

      expect(provider).toMatchObject({
        name: 'OpenCode Go',
        provider: 'opencode-go',
        baseUrl: 'https://opencode.ai/zen/go/v1',
        hasApiKey: true
      })
      expect(provider).not.toHaveProperty('apiKey')
      expect(model).toMatchObject({
        name: 'Minimax M3',
        providerId: provider.id,
        model: 'minimax-m3'
      })
      expect(store.listProviders()).toEqual([provider])
      expect(store.listModels()).toEqual([model])
    } finally {
      store.close()
      cleanup()
    }
  })

  it('解析可运行模型时会解密提供商密钥，并保留更新时未重新填写的密钥', () => {
    const { databasePath, cleanup } = createTempDatabasePath()
    const store = new ModelProfileStore(databasePath, testSecretCodec)

    try {
      const provider = store.saveProvider({
        name: 'OpenCode Go',
        provider: 'opencode-go',
        baseUrl: 'https://opencode.ai/zen/go/v1',
        apiKey: 'sk-test'
      })
      const updatedProvider = store.saveProvider({
        id: provider.id,
        name: 'OpenCode Go 生产',
        provider: 'opencode-go',
        baseUrl: 'https://opencode.ai/zen/go/v1'
      })
      const model = store.saveModel({
        name: 'Minimax M3',
        providerId: provider.id,
        model: 'minimax-m3'
      })

      expect(updatedProvider).toMatchObject({
        id: provider.id,
        name: 'OpenCode Go 生产',
        hasApiKey: true
      })
      expect(store.getRunnableModel(model.id)).toEqual({
        model: {
          id: model.id,
          name: 'Minimax M3',
          providerId: provider.id,
          model: 'minimax-m3',
          createdAt: model.createdAt,
          updatedAt: model.updatedAt
        },
        provider: {
          id: provider.id,
          name: 'OpenCode Go 生产',
          provider: 'opencode-go',
          baseUrl: 'https://opencode.ai/zen/go/v1',
          apiKey: 'sk-test'
        }
      })
    } finally {
      store.close()
      cleanup()
    }
  })
})
