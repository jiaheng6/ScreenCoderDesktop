import { useState } from 'react'
import type {
  ScreencoderJobRecord,
  ScreencoderModelProfileInput,
  ScreencoderPageKind,
  ScreencoderTargetFramework
} from '../global'

interface RunPanelProps {
  selectedPath: string | null
  modelProfile: ScreencoderModelProfileInput
  targetFramework: ScreencoderTargetFramework
  pageKind: ScreencoderPageKind
  onTargetFrameworkChange: (targetFramework: ScreencoderTargetFramework) => void
  onPageKindChange: (pageKind: ScreencoderPageKind) => void
  onJobCreated: (job: ScreencoderJobRecord) => Promise<void> | void
}

const targetFrameworkOptions: Array<{ value: ScreencoderTargetFramework; label: string }> = [
  { value: 'html', label: 'HTML' },
  { value: 'vue2', label: 'Vue 2' },
  { value: 'vue3', label: 'Vue 3' },
  { value: 'react', label: 'React' }
]

const pageKindOptions: Array<{ value: ScreencoderPageKind; label: string }> = [
  { value: 'web', label: 'Web' },
  { value: 'mobile', label: '移动端' },
  { value: 'custom', label: '自定义' }
]

export function RunPanel({
  selectedPath,
  modelProfile,
  targetFramework,
  pageKind,
  onTargetFrameworkChange,
  onPageKindChange,
  onJobCreated
}: RunPanelProps): JSX.Element {
  const [isCreating, setIsCreating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleCreateJob(): Promise<void> {
    if (!selectedPath) {
      setMessage('请先选择截图文件。')
      return
    }

    setIsCreating(true)
    setMessage(null)

    try {
      const job = await window.screencoder.createJobFromFile({
        inputPath: selectedPath,
        provider: modelProfile.provider,
        model: modelProfile.model,
        targetFramework,
        pageKind
      })
      await onJobCreated(job)
      setMessage(`已创建任务：${job.id.slice(0, 8)}`)
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <section className="panel run-panel" aria-labelledby="run-panel-title">
      <div className="panel-header">
        <div>
          <h2 id="run-panel-title">创建任务</h2>
          <p>设置目标输出</p>
        </div>
      </div>

      <div className="control-group">
        <span className="field-label">目标框架</span>
        <div className="segmented-control" role="group" aria-label="目标框架">
          {targetFrameworkOptions.map((option) => (
            <button
              key={option.value}
              className={targetFramework === option.value ? 'segment is-active' : 'segment'}
              type="button"
              onClick={() => onTargetFrameworkChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="control-group">
        <span className="field-label">页面类型</span>
        <div className="segmented-control" role="group" aria-label="页面类型">
          {pageKindOptions.map((option) => (
            <button
              key={option.value}
              className={pageKind === option.value ? 'segment is-active' : 'segment'}
              type="button"
              onClick={() => onPageKindChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <button
        className="create-job-button"
        type="button"
        onClick={handleCreateJob}
        disabled={isCreating || !selectedPath}
      >
        {isCreating ? '创建中' : '创建任务'}
      </button>

      {message ? <p className="inline-message">{message}</p> : null}
    </section>
  )
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '创建任务失败'
}
