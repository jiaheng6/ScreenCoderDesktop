import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { HistoryPanel } from './components/HistoryPanel'
import { ModelSettings } from './components/ModelSettings'
import { PreviewPanel } from './components/PreviewPanel'
import { RunPanel } from './components/RunPanel'
import { UploadPanel } from './components/UploadPanel'
import './styles.css'
import type {
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

  const handleJobCreated = useCallback(
    async (job: ScreencoderJobRecord): Promise<void> => {
      setJobs((currentJobs) => [job, ...currentJobs.filter((currentJob) => currentJob.id !== job.id)])
      await loadJobs()
    },
    [loadJobs]
  )

  return (
    <main className="workspace-shell">
      <HistoryPanel
        jobs={jobs}
        isLoading={isHistoryLoading}
        errorMessage={historyError}
        onRefresh={loadJobs}
      />

      <section className="control-column" aria-label="任务控制">
        <UploadPanel selectedPath={selectedPath} onSelectPath={setSelectedPath} />
        <ModelSettings profile={modelProfile} onProfileChange={setModelProfile} />
        <RunPanel
          selectedPath={selectedPath}
          modelProfile={modelProfile}
          targetFramework={targetFramework}
          pageKind={pageKind}
          onTargetFrameworkChange={setTargetFramework}
          onPageKindChange={setPageKind}
          onJobCreated={handleJobCreated}
        />
      </section>

      <PreviewPanel selectedPath={selectedPath} />
    </main>
  )
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '加载历史任务失败'
}

const rootElement = document.getElementById('root')

if (rootElement) {
  createRoot(rootElement).render(<App />)
}
