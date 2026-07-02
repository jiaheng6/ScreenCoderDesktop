import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultModelConnectionTester } from '../src/main/models/model-connection'
import type { RunnableModel } from '../src/main/models/model-profile-store'

const runnableModel: RunnableModel = {
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
}

describe('defaultModelConnectionTester', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('测试 OpenCode Go 时使用与真实 ScreenCoder 一致的 messages 接口和 x-api-key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
        const url = String(_url)
        const init = _init ?? {}

        expect(url).toBe('https://opencode.ai/zen/go/v1/messages')
        expect(init.method).toBe('POST')
        expect(init.headers).toMatchObject({
          'x-api-key': 'sk-test',
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        })
        expect(JSON.parse(String(init.body))).toMatchObject({
          model: 'minimax-m3',
          stream: false
        })

        return new Response(JSON.stringify({ content: [{ type: 'text', text: 'OK' }] }), {
          status: 200
        })
      })
    )

    await expect(defaultModelConnectionTester(runnableModel)).resolves.toMatchObject({
      ok: true,
      status: 200,
      message: '连接成功'
    })
  })
})
