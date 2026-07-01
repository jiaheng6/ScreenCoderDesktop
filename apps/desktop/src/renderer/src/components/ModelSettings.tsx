import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import type {
  ScreencoderModelConfigInput,
  ScreencoderModelConfigRecord,
  ScreencoderModelProviderInput,
  ScreencoderModelProviderRecord
} from '../global'

interface ModelSettingsProps {
  selectedModel: ScreencoderModelConfigRecord | null
  onModelChange: (model: ScreencoderModelConfigRecord | null) => void
}

const emptyProviderDraft: ScreencoderModelProviderInput = {
  name: 'OpenCode Go',
  provider: 'opencode-go',
  baseUrl: 'https://opencode.ai/zen/go/v1',
  apiKey: ''
}

const emptyModelDraft: ScreencoderModelConfigInput = {
  name: 'Minimax M3',
  providerId: '',
  model: 'minimax-m3'
}

export function ModelSettings({ selectedModel, onModelChange }: ModelSettingsProps): JSX.Element {
  const [providers, setProviders] = useState<ScreencoderModelProviderRecord[]>([])
  const [models, setModels] = useState<ScreencoderModelConfigRecord[]>([])
  const [providerDraft, setProviderDraft] =
    useState<ScreencoderModelProviderInput>(emptyProviderDraft)
  const [modelDraft, setModelDraft] = useState<ScreencoderModelConfigInput>(emptyModelDraft)
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingProvider, setIsSavingProvider] = useState(false)
  const [isSavingModel, setIsSavingModel] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void loadSettings()
  }, [])

  async function loadSettings(nextSelectedModelId = selectedModel?.id): Promise<void> {
    setIsLoading(true)

    try {
      const [nextProviders, nextModels] = await Promise.all([
        window.screencoder.listProviders(),
        window.screencoder.listModels()
      ])
      const nextSelectedModel =
        (nextSelectedModelId
          ? nextModels.find((model) => model.id === nextSelectedModelId)
          : undefined) ??
        nextModels[0] ??
        null
      const nextSelectedProvider =
        nextProviders.find((provider) => provider.id === nextSelectedModel?.providerId) ??
        nextProviders[0] ??
        null

      setProviders(nextProviders)
      setModels(nextModels)
      onModelChange(nextSelectedModel)
      setProviderDraft(nextSelectedProvider ? providerToDraft(nextSelectedProvider) : emptyProviderDraft)
      setModelDraft(
        nextSelectedModel
          ? modelToDraft(nextSelectedModel)
          : {
              ...emptyModelDraft,
              providerId: nextSelectedProvider?.id ?? ''
            }
      )
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  function handleProviderFieldChange(field: keyof ScreencoderModelProviderInput) {
    return (event: ChangeEvent<HTMLInputElement>): void => {
      setProviderDraft((currentDraft) => ({
        ...currentDraft,
        [field]: event.target.value
      }))
    }
  }

  function handleModelFieldChange(field: keyof ScreencoderModelConfigInput) {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>): void => {
      setModelDraft((currentDraft) => ({
        ...currentDraft,
        [field]: event.target.value
      }))
    }
  }

  function handleProviderSelect(event: ChangeEvent<HTMLSelectElement>): void {
    const providerId = event.target.value
    const provider = providers.find((currentProvider) => currentProvider.id === providerId)

    setProviderDraft(provider ? providerToDraft(provider) : emptyProviderDraft)
    setModelDraft((currentDraft) => ({
      ...currentDraft,
      providerId: provider?.id ?? ''
    }))
  }

  function handleModelSelect(event: ChangeEvent<HTMLSelectElement>): void {
    const modelId = event.target.value
    const model = models.find((currentModel) => currentModel.id === modelId)

    if (!model) {
      setModelDraft({
        ...emptyModelDraft,
        providerId: providerDraft.id ?? ''
      })
      onModelChange(null)
      return
    }

    const provider = providers.find((currentProvider) => currentProvider.id === model.providerId)
    setModelDraft(modelToDraft(model))
    setProviderDraft(provider ? providerToDraft(provider) : providerDraft)
    onModelChange(model)
  }

  async function handleSaveProvider(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setIsSavingProvider(true)
    setMessage(null)

    try {
      const savedProvider = await window.screencoder.saveProvider(providerDraft)
      setMessage(`已保存提供商：${savedProvider.name}`)
      setProviderDraft(providerToDraft(savedProvider))
      setModelDraft((currentDraft) => ({
        ...currentDraft,
        providerId: savedProvider.id
      }))
      await loadSettings(selectedModel?.id)
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setIsSavingProvider(false)
    }
  }

  async function handleSaveModel(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setIsSavingModel(true)
    setMessage(null)

    try {
      const savedModel = await window.screencoder.saveModel(modelDraft)
      setMessage(`已保存模型：${savedModel.name}`)
      onModelChange(savedModel)
      setModelDraft(modelToDraft(savedModel))
      await loadSettings(savedModel.id)
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setIsSavingModel(false)
    }
  }

  async function handleTestConnection(): Promise<void> {
    if (!modelDraft.id) {
      setMessage('请先保存模型后再测试连接。')
      return
    }

    setIsTesting(true)
    setMessage(null)

    try {
      const result = await window.screencoder.testModelConnection(modelDraft.id)
      setMessage(`${result.message}，耗时 ${result.latencyMs}ms`)
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <section className="panel model-panel" aria-labelledby="model-panel-title">
      <div className="panel-header">
        <div>
          <h2 id="model-panel-title">模型配置</h2>
          <p>{isLoading ? '正在读取配置' : '管理提供商、模型和连接测试'}</p>
        </div>
      </div>

      <form className="settings-form stacked-settings-form" onSubmit={handleSaveProvider}>
        <label className="form-field">
          <span>已保存提供商</span>
          <select value={providerDraft.id ?? ''} onChange={handleProviderSelect}>
            <option value="">新建提供商</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
                {provider.hasApiKey ? '（已保存密钥）' : '（未保存密钥）'}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>提供商名称</span>
          <input value={providerDraft.name} onChange={handleProviderFieldChange('name')} />
        </label>
        <label className="form-field">
          <span>Provider</span>
          <input value={providerDraft.provider} onChange={handleProviderFieldChange('provider')} />
        </label>
        <label className="form-field">
          <span>Base URL</span>
          <input value={providerDraft.baseUrl} onChange={handleProviderFieldChange('baseUrl')} />
        </label>
        <label className="form-field">
          <span>API Key</span>
          <input
            autoComplete="off"
            placeholder={providerDraft.id ? '留空则保留已保存密钥' : '输入后加密保存到本机'}
            type="password"
            value={providerDraft.apiKey ?? ''}
            onChange={handleProviderFieldChange('apiKey')}
          />
        </label>

        <div className="form-actions">
          <button className="secondary-button" type="submit" disabled={isSavingProvider}>
            {isSavingProvider ? '保存中' : '保存提供商'}
          </button>
        </div>
      </form>

      <form className="settings-form stacked-settings-form" onSubmit={handleSaveModel}>
        <label className="form-field">
          <span>已保存模型</span>
          <select value={modelDraft.id ?? ''} onChange={handleModelSelect}>
            <option value="">新建模型</option>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name} / {model.model}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>模型名称</span>
          <input value={modelDraft.name} onChange={handleModelFieldChange('name')} />
        </label>
        <label className="form-field">
          <span>所属提供商</span>
          <select value={modelDraft.providerId} onChange={handleModelFieldChange('providerId')}>
            <option value="">请选择提供商</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Model</span>
          <input value={modelDraft.model} onChange={handleModelFieldChange('model')} />
        </label>

        <div className="form-actions split-actions">
          <button className="secondary-button" type="submit" disabled={isSavingModel}>
            {isSavingModel ? '保存中' : '保存模型'}
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={isTesting || !modelDraft.id}
            onClick={handleTestConnection}
          >
            {isTesting ? '测试中' : '测试连接'}
          </button>
        </div>
      </form>

      {message ? <p className="inline-message">{message}</p> : null}
    </section>
  )
}

function providerToDraft(
  provider: ScreencoderModelProviderRecord
): ScreencoderModelProviderInput {
  return {
    id: provider.id,
    name: provider.name,
    provider: provider.provider,
    baseUrl: provider.baseUrl,
    apiKey: ''
  }
}

function modelToDraft(model: ScreencoderModelConfigRecord): ScreencoderModelConfigInput {
  return {
    id: model.id,
    name: model.name,
    providerId: model.providerId,
    model: model.model
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '保存模型配置失败'
}
