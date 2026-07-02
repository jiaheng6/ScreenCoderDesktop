import type { RunnableModel } from './model-profile-store'

export interface ModelConnectionTestResult {
  ok: boolean
  status: number | null
  message: string
  latencyMs: number
}

export type ModelConnectionTester = (
  input: RunnableModel
) => Promise<ModelConnectionTestResult>

export const defaultModelConnectionTester: ModelConnectionTester = async (input) => {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  const isOpenCodeProvider = isOpenCode(input.provider.provider)

  try {
    const response = await fetch(resolveConnectionTestUrl(input.provider.baseUrl, input.provider.provider), {
      method: 'POST',
      headers: createConnectionTestHeaders(input.provider.apiKey, isOpenCodeProvider),
      body: JSON.stringify(createConnectionTestBody(input)),
      signal: controller.signal
    })
    const responseText = await response.text()
    const latencyMs = Date.now() - startedAt

    return {
      ok: response.ok,
      status: response.status,
      message: response.ok
        ? '连接成功'
        : `连接失败：HTTP ${response.status}${responseText ? `，${responseText.slice(0, 200)}` : ''}`,
      latencyMs
    }
  } catch (error) {
    const latencyMs = Date.now() - startedAt

    return {
      ok: false,
      status: null,
      message: getConnectionErrorMessage(error),
      latencyMs
    }
  } finally {
    clearTimeout(timeout)
  }
}

function resolveConnectionTestUrl(baseUrl: string, provider: string): string {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`

  if (isOpenCode(provider)) {
    return new URL('messages', normalizedBaseUrl).toString()
  }

  return new URL('chat/completions', normalizedBaseUrl).toString()
}

function createConnectionTestBody(input: RunnableModel): Record<string, unknown> {
  const messages = [
    {
      role: 'user',
      content: '请只回复 OK'
    }
  ]

  if (isOpenCode(input.provider.provider)) {
    return {
      model: input.model.model,
      max_tokens: 8,
      temperature: 0,
      messages,
      stream: false
    }
  }

  return {
    model: input.model.model,
    messages,
    max_tokens: 8,
    stream: false
  }
}

function createConnectionTestHeaders(
  apiKey: string,
  isOpenCodeProvider: boolean
): Record<string, string> {
  if (isOpenCodeProvider) {
    return {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    }
  }

  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  }
}

function isOpenCode(provider: string): boolean {
  return provider.toLowerCase().includes('opencode')
}

function getConnectionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') {
    return '连接超时'
  }

  return error instanceof Error ? `连接失败：${error.message}` : '连接失败'
}
