import { useEffect, useState } from 'react'
import type {
  ScreencoderJobRecord,
  ScreencoderModelConfigRecord,
  ScreencoderPageKind,
  ScreencoderRuntimeEnvironmentStatus,
  ScreencoderTargetFramework
} from '../global'

interface RunPanelProps {
  selectedPath: string | null
  selectedModel: ScreencoderModelConfigRecord | null
  targetFramework: ScreencoderTargetFramework
  pageKind: ScreencoderPageKind
  onTargetFrameworkChange: (targetFramework: ScreencoderTargetFramework) => void
  onPageKindChange: (pageKind: ScreencoderPageKind) => void
  onRunStarted: (job: ScreencoderJobRecord) => void
  onJobUpdated: (job: ScreencoderJobRecord) => Promise<void> | void
  onRunLog: (message: string) => void
}

const targetFrameworkOptions: Array<{ value: ScreencoderTargetFramework; label: string }> = [
  { value: 'html', label: 'HTML' },
  { value: 'vue2', label: 'Vue 2' },
  { value: 'vue3', label: 'Vue 3' },
  { value: 'react', label: 'React' }
]

const pageKindOptions: Array<{ value: ScreencoderPageKind; label: string }> = [
  { value: 'web', label: '网页' },
  { value: 'mobile', label: '移动端' },
  { value: 'custom', label: '自定义' }
]

export function RunPanel({
  selectedPath,
  selectedModel,
  targetFramework,
  pageKind,
  onTargetFrameworkChange,
  onPageKindChange,
  onRunStarted,
  onJobUpdated,
  onRunLog
}: RunPanelProps): JSX.Element {
  const [isRunning, setIsRunning] = useState(false)
  const [isCheckingEnvironment, setIsCheckingEnvironment] = useState(false)
  const [isInstallingEnvironment, setIsInstallingEnvironment] = useState(false)
  const [runtimeStatus, setRuntimeStatus] = useState<ScreencoderRuntimeEnvironmentStatus | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void handleCheckEnvironment(false)
  }, [])

  async function handleCheckEnvironment(shouldLog = true): Promise<ScreencoderRuntimeEnvironmentStatus | null> {
    setIsCheckingEnvironment(true)

    try {
      const status = await window.screencoder.checkRuntimeEnvironment()
      setRuntimeStatus(status)
      if (shouldLog) {
        onRunLog(`运行环境检测：${status.message}`)
      }
      return status
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      setMessage(errorMessage)
      onRunLog(`运行环境检测失败：${errorMessage}`)
      return null
    } finally {
      setIsCheckingEnvironment(false)
    }
  }

  async function handleInstallEnvironment(): Promise<void> {
    setIsInstallingEnvironment(true)
    setMessage(null)
    onRunLog('开始安装运行环境')

    try {
      const result = await window.screencoder.installRuntimeEnvironment()
      onRunLog(result.log)

      if (!result.ok) {
        const errorMessage = result.error ?? '运行环境安装失败'
        setMessage(errorMessage)
        onRunLog(`运行环境安装失败：${errorMessage}`)
        return
      }

      setMessage('运行环境安装完成')
      await handleCheckEnvironment(true)
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      setMessage(errorMessage)
      onRunLog(`运行环境安装失败：${errorMessage}`)
    } finally {
      setIsInstallingEnvironment(false)
    }
  }

  async function handleRunPipeline(): Promise<void> {
    if (!selectedPath) {
      setMessage('请先选择截图文件。')
      return
    }

    if (!selectedModel) {
      setMessage('请先在模型页保存并选择模型。')
      return
    }

    setIsRunning(true)
    setMessage(null)

    try {
      const status = await handleCheckEnvironment(false)
      if (!status?.ok) {
        const errorMessage = status?.message ?? '运行环境不可用，请先检测或安装运行环境。'
        setMessage(errorMessage)
        onRunLog(`运行环境不可用：${errorMessage}`)
        return
      }

      const job = await window.screencoder.createJobFromFile({
        inputPath: selectedPath,
        modelConfigId: selectedModel.id,
        targetFramework,
        pageKind
      })

      await onJobUpdated(job)
      onRunStarted(job)
      onRunLog(`开始运行流水线：${job.id}`)

      const completedJob = await window.screencoder.runJob(job.id)
      await onJobUpdated(completedJob)

      const resultMessage =
        completedJob.status === 'succeeded'
          ? `流水线运行完成：${completedJob.id}`
          : `流水线运行失败：${completedJob.id}`
      onRunLog(resultMessage)
      setMessage(resultMessage)
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      onRunLog(`运行失败：${errorMessage}`)
      setMessage(errorMessage)
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <section className="panel run-panel" aria-labelledby="run-panel-title">
      <div className="panel-header">
        <div>
          <h2 id="run-panel-title">运行流水线</h2>
          <p>{selectedModel ? `当前模型：${selectedModel.name}` : '请选择已保存模型'}</p>
        </div>
      </div>

      <section className="runtime-environment-card" aria-label="运行环境">
        <div>
          <span className={runtimeStatus?.ok ? 'runtime-status is-ok' : 'runtime-status'}>
            {runtimeStatus?.ok ? '运行环境可用' : '运行环境需要检测'}
          </span>
          <p>{runtimeStatus ? runtimeStatus.message : '首次运行前建议检测 ScreenCoder Python 运行环境。'}</p>
          {runtimeStatus && !runtimeStatus.ok && runtimeStatus.missingDependencies.length > 0 ? (
            <p className="runtime-missing-list">
              缺失：{runtimeStatus.missingDependencies.map((item) => item.moduleName).join('、')}
            </p>
          ) : null}
        </div>
        <div className="runtime-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => void handleCheckEnvironment(true)}
            disabled={isCheckingEnvironment || isInstallingEnvironment || isRunning}
          >
            {isCheckingEnvironment ? '检测中' : '检测环境'}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void handleInstallEnvironment()}
            disabled={isInstallingEnvironment || isRunning || runtimeStatus?.canInstall === false}
          >
            {isInstallingEnvironment ? '安装中' : '一键安装运行环境'}
          </button>
        </div>
      </section>

      <div className="control-group target-framework-control">
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

      <div className="control-group page-kind-control">
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
        onClick={handleRunPipeline}
        disabled={isRunning || isInstallingEnvironment || !selectedPath || !selectedModel}
      >
        {isRunning ? '运行中' : '运行流水线'}
      </button>

      {message ? <p className="inline-message">{message}</p> : null}
    </section>
  )
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '运行流水线失败'
}
