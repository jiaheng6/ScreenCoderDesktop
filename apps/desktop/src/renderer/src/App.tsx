import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { HistoryPanel } from './components/HistoryPanel'
import { LogPanel } from './components/LogPanel'
import { ModelSettings } from './components/ModelSettings'
import { PreviewPanel } from './components/PreviewPanel'
import { RunPanel } from './components/RunPanel'
import { UploadPanel } from './components/UploadPanel'
import './styles.css'
import type { PreviewContent } from './components/PreviewPanel'
import type {
  ScreencoderJobEventPayload,
  ScreencoderJobRecord,
  ScreencoderModelConfigRecord,
  ScreencoderPageKind,
  ScreencoderTargetFramework
} from './global'

type WorkflowTab = 'upload' | 'model' | 'run' | 'log'

const workflowTabs: Array<{ id: WorkflowTab; label: string }> = [
  { id: 'upload', label: '截图' },
  { id: 'model', label: '模型' },
  { id: 'run', label: '运行' },
  { id: 'log', label: '日志' }
]

function App(): JSX.Element {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [jobs, setJobs] = useState<ScreencoderJobRecord[]>([])
  const [isHistoryLoading, setIsHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [targetFramework, setTargetFramework] = useState<ScreencoderTargetFramework>('html')
  const [pageKind, setPageKind] = useState<ScreencoderPageKind>('web')
  const [selectedModel, setSelectedModel] = useState<ScreencoderModelConfigRecord | null>(null)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [previewContent, setPreviewContent] = useState<PreviewContent>({ type: 'empty' })
  const [activeWorkflowTab, setActiveWorkflowTab] = useState<WorkflowTab>('upload')

  const appendLog = useCallback((message: string): void => {
    setLogs((currentLogs) => [...currentLogs, message].slice(-200))
  }, [])

  const loadJobs = useCallback(async (): Promise<void> => {
    setIsHistoryLoading(true)
    setHistoryError(null)

    try {
      const nextJobs = await window.screencoder.listJobs()
      setJobs(nextJobs)
    } catch (error) {
      setHistoryError(getErrorMessage(error))
    } finally {
      setIsHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadJobs()
  }, [loadJobs])

  useEffect(() => {
    return window.screencoder.onJobEvent((payload) => {
      setActiveJobId(payload.jobId)
      appendLog(formatJobEventPayload(payload))
    })
  }, [appendLog])

  const showImagePreview = useCallback(
    async (path: string): Promise<void> => {
      try {
        const imagePreview = await window.screencoder.readImagePreview(path)
        setPreviewContent({
          type: 'image',
          path: imagePreview.path,
          dataUrl: imagePreview.dataUrl
        })
      } catch (error) {
        setPreviewContent({ type: 'empty' })
        appendLog(`截图预览加载失败：${getErrorMessage(error)}`)
      }
    },
    [appendLog]
  )

  const handleSelectPath = useCallback((path: string): void => {
    setSelectedPath(path)
    void showImagePreview(path)
    setActiveWorkflowTab('run')
  }, [showImagePreview])

  const openJobPreview = useCallback(
    async (job: ScreencoderJobRecord): Promise<void> => {
      setActiveJobId(job.id)

      if (job.status !== 'succeeded') {
        await showImagePreview(job.inputPath)
        appendLog(`任务尚未成功，显示输入截图：${job.id}`)
        return
      }

      try {
        const preview = await window.screencoder.readJobPreview(job.id)
        setPreviewContent({
          type: 'html',
          jobId: preview.jobId,
          htmlPath: preview.htmlPath,
          htmlUrl: preview.htmlUrl,
          html: preview.html,
          sourcePath: preview.sourcePath,
          source: preview.source
        })
        appendLog(`已加载最终预览：${preview.htmlPath}`)
      } catch (error) {
        await showImagePreview(job.inputPath)
        appendLog(`最终预览加载失败，显示输入截图：${getErrorMessage(error)}`)
      }
    },
    [appendLog, showImagePreview]
  )

  const handleJobUpdated = useCallback(
    async (job: ScreencoderJobRecord): Promise<void> => {
      setActiveJobId(job.id)
      setJobs((currentJobs) => [job, ...currentJobs.filter((currentJob) => currentJob.id !== job.id)])
      await loadJobs()

      if (job.status === 'succeeded') {
        await openJobPreview(job)
      }
    },
    [loadJobs, openJobPreview]
  )

  const handleRunStarted = useCallback((job: ScreencoderJobRecord): void => {
    setActiveJobId(job.id)
    setLogs([])
    void showImagePreview(job.inputPath)
    setActiveWorkflowTab('log')
    setJobs((currentJobs) => [
      { ...job, status: 'running' },
      ...currentJobs.filter((currentJob) => currentJob.id !== job.id)
    ])
  }, [showImagePreview])

  const selectedFileName = selectedPath ? selectedPath.split(/[\\/]/).pop() : null

  return (
    <main className="workspace-shell">
      <HistoryPanel
        jobs={jobs}
        isLoading={isHistoryLoading}
        errorMessage={historyError}
        onRefresh={loadJobs}
        onOpenJob={(job) => void openJobPreview(job)}
      />

      <section className="control-column" aria-label="任务控制">
        <section className="panel workflow-panel" aria-label="任务工作区">
          <div className="workflow-tabs" role="tablist" aria-label="任务步骤">
            {workflowTabs.map((tab) => (
              <button
                key={tab.id}
                className={activeWorkflowTab === tab.id ? 'workflow-tab is-active' : 'workflow-tab'}
                type="button"
                role="tab"
                aria-selected={activeWorkflowTab === tab.id}
                onClick={() => setActiveWorkflowTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="workflow-summary">
            <span title={selectedPath ?? undefined}>
              {selectedFileName ? `截图：${selectedFileName}` : '未选择截图'}
            </span>
            <span>
              {targetFramework.toUpperCase()} /{' '}
              {pageKind === 'web' ? '网页' : pageKind === 'mobile' ? '移动端' : '自定义'}
            </span>
            <span title={selectedModel?.model}>
              {selectedModel ? `模型：${selectedModel.name}` : '未选择模型'}
            </span>
          </div>

          <div className="workflow-tab-panel" role="tabpanel">
            {activeWorkflowTab === 'upload' ? (
              <UploadPanel selectedPath={selectedPath} onSelectPath={handleSelectPath} />
            ) : null}
            {activeWorkflowTab === 'model' ? (
              <ModelSettings selectedModel={selectedModel} onModelChange={setSelectedModel} />
            ) : null}
            {activeWorkflowTab === 'run' ? (
              <RunPanel
                selectedPath={selectedPath}
                selectedModel={selectedModel}
                targetFramework={targetFramework}
                pageKind={pageKind}
                onTargetFrameworkChange={setTargetFramework}
                onPageKindChange={setPageKind}
                onRunStarted={handleRunStarted}
                onJobUpdated={handleJobUpdated}
                onRunLog={appendLog}
              />
            ) : null}
            {activeWorkflowTab === 'log' ? <LogPanel activeJobId={activeJobId} logs={logs} /> : null}
          </div>
        </section>
      </section>

      <PreviewPanel preview={previewContent} />
    </main>
  )
}

function formatJobEventPayload(payload: ScreencoderJobEventPayload): string {
  try {
    return JSON.stringify(payload)
  } catch {
    return '无法序列化运行事件'
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '加载历史任务失败'
}

const rootElement = document.getElementById('root')

if (rootElement) {
  createRoot(rootElement).render(<App />)
}
