import { useState, type ChangeEvent, type FormEvent } from 'react'
import type { ScreencoderModelProfileInput } from '../global'

interface ModelSettingsProps {
  profile: ScreencoderModelProfileInput
  onProfileChange: (profile: ScreencoderModelProfileInput) => void
}

export function ModelSettings({ profile, onProfileChange }: ModelSettingsProps): JSX.Element {
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  function handleFieldChange(field: keyof ScreencoderModelProfileInput) {
    return (event: ChangeEvent<HTMLInputElement>): void => {
      onProfileChange({
        ...profile,
        [field]: event.target.value
      })
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setIsSaving(true)
    setMessage(null)

    try {
      const savedProfile = await window.screencoder.saveProfile(profile)
      setMessage(`已保存配置：${savedProfile.name}`)
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="panel model-panel" aria-labelledby="model-panel-title">
      <div className="panel-header">
        <div>
          <h2 id="model-panel-title">模型配置</h2>
          <p>保存调用参数</p>
        </div>
      </div>

      <form className="settings-form" onSubmit={handleSubmit}>
        <label className="form-field">
          <span>名称</span>
          <input value={profile.name} onChange={handleFieldChange('name')} />
        </label>
        <label className="form-field">
          <span>Provider</span>
          <input value={profile.provider} onChange={handleFieldChange('provider')} />
        </label>
        <label className="form-field">
          <span>Base URL</span>
          <input value={profile.baseUrl} onChange={handleFieldChange('baseUrl')} />
        </label>
        <label className="form-field">
          <span>Model</span>
          <input value={profile.model} onChange={handleFieldChange('model')} />
        </label>
        <label className="form-field">
          <span>密钥引用（secure-store:&lt;id&gt;）</span>
          <input
            autoComplete="off"
            placeholder="secure-store:default"
            value={profile.apiKeyRef}
            onChange={handleFieldChange('apiKeyRef')}
          />
        </label>

        <div className="form-actions">
          <button className="secondary-button" type="submit" disabled={isSaving}>
            {isSaving ? '保存中' : '保存配置'}
          </button>
        </div>
      </form>

      {message ? <p className="inline-message">{message}</p> : null}
    </section>
  )
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '保存模型配置失败'
}
