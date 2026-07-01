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
  ScreencoderModelProfileInput,
  ScreencoderPageKind,
  ScreencoderTargetFramework
} from './global'

const defaultProfile: ScreencoderModelProfileInput = {
  name: 'OpenCode Go',
  provider: 'opencode-go',
  baseUrl: 'https://opencode.ai/zen/go/v1',
  model: 'minimax-m3',
  apiKeyRef: 'secure-store:default'
}

function App(): JSX.Element {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [jobs, setJobs] = useState<ScreencoderJobRecord[]>([])
  const [isHistoryLoading, setIsHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [targetFramework, setTargetFramework] = useState<ScreencoderTargetFramework>('html')
  const [pageKind, setPageKind] = useState<ScreencoderPageKind>('web')
  const [modelProfile, setModelProfile] = useState<ScreencoderModelProfileInput>(defaultProfile)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [previewContent, setPreviewContent] = useState<PreviewContent>({ type: 'empty' })

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

  const handleSelectPath = useCallback((path: string): void => {
    setSelectedPath(path)
    setPreviewContent({ type: 'image', path })
  }, [])

  const openJobPreview = useCallback(
    async (job: ScreencoderJobRecord): Promise<void> => {
      setActiveJobId(job.id)

      if (job.status !== 'succeeded') {
        setPreviewContent({ type: 'image', path: job.inputPath })
        appendLog(`任务尚未成功，显示输入截图：${job.id}`)
        return
      }

      try {
        const preview = await window.screencoder.readJobPreview(job.id)
        setPreviewContent({
          type: 'html',
          jobId: preview.jobId,
          htmlPath: preview.htmlPath,
          html: preview.html,
          sourcePath: preview.sourcePath,
          source: preview.source
        })
        appendLog(`已加载最终预览：${preview.htmlPath}`)
      } catch (error) {
        setPreviewContent({ type: 'image', path: job.inputPath })
        appendLog(`最终预览加载失败，显示输入截图：${getErrorMessage(error)}`)
      }
    },
    [appendLog]
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
    setPreviewContent({ type: 'image', path: job.inputPath })
    setJobs((currentJobs) => [
      { ...job, status: 'running' },
      ...currentJobs.filter((currentJob) => currentJob.id !== job.id)
    ])
  }, [])

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
        <UploadPanel selectedPath={selectedPath} onSelectPath={handleSelectPath} />
        <ModelSettings profile={modelProfile} onProfileChange={setModelProfile} />
        <RunPanel
          selectedPath={selectedPath}
          modelProfile={modelProfile}
          targetFramework={targetFramework}
          pageKind={pageKind}
          onTargetFrameworkChange={setTargetFramework}
          onPageKindChange={setPageKind}
          onRunStarted={handleRunStarted}
          onJobUpdated={handleJobUpdated}
          onRunLog={appendLog}
        />
        <LogPanel activeJobId={activeJobId} logs={logs} />
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
