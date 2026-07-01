import type { ScreencoderJobRecord, ScreencoderJobStatus } from '../global'

interface HistoryPanelProps {
  jobs: ScreencoderJobRecord[]
  isLoading: boolean
  errorMessage: string | null
  onRefresh: () => Promise<void> | void
  onOpenJob: (job: ScreencoderJobRecord) => Promise<void> | void
}

const statusLabels: Record<ScreencoderJobStatus, string> = {
  queued: '排队中',
  running: '运行中',
  succeeded: '已完成',
  failed: '失败'
}

const frameworkLabels: Record<ScreencoderJobRecord['targetFramework'], string> = {
  html: 'HTML',
  vue2: 'Vue 2',
  vue3: 'Vue 3',
  react: 'React'
}

const pageKindLabels: Record<ScreencoderJobRecord['pageKind'], string> = {
  web: 'Web',
  mobile: '移动端',
  custom: '自定义'
}

export function HistoryPanel({
  jobs,
  isLoading,
  errorMessage,
  onRefresh,
  onOpenJob
}: HistoryPanelProps): JSX.Element {
  return (
    <aside className="panel history-panel" aria-labelledby="history-panel-title">
      <div className="panel-header">
        <div>
          <h2 id="history-panel-title">历史任务</h2>
          <p>{isLoading ? '加载中' : `${jobs.length} 个任务`}</p>
        </div>
        <button className="icon-text-button" type="button" onClick={() => void onRefresh()}>
          刷新
        </button>
      </div>

      {errorMessage ? <p className="inline-message error-message">{errorMessage}</p> : null}

      {jobs.length === 0 && !isLoading ? <div className="empty-state">暂无历史任务</div> : null}

      <ol className="history-list">
        {jobs.map((job) => (
          <li className="history-row" key={job.id}>
            <div className="history-row-top">
              <span className={`status-pill status-${job.status}`}>{statusLabels[job.status]}</span>
              <time dateTime={job.createdAt}>{formatDateTime(job.createdAt)}</time>
            </div>
            <div className="history-model" title={`${job.provider} / ${job.model}`}>
              {job.provider} / {job.model}
            </div>
            <div className="history-meta">
              <span>{frameworkLabels[job.targetFramework]}</span>
              <span>{pageKindLabels[job.pageKind]}</span>
            </div>
            <div className="history-actions">
              <button className="secondary-button" type="button" onClick={() => void onOpenJob(job)}>
                打开
              </button>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  )
}

function formatDateTime(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}
