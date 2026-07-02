import { useEffect, useMemo, useState } from 'react'
import type { ScreencoderJobRecord, ScreencoderJobStatus } from '../global'

interface HistoryPanelProps {
  jobs: ScreencoderJobRecord[]
  isLoading: boolean
  errorMessage: string | null
  onRefresh: () => Promise<void> | void
  onOpenJob: (job: ScreencoderJobRecord) => Promise<void> | void
  onDeleteJobs: (jobIds: string[]) => Promise<void> | void
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
  onOpenJob,
  onDeleteJobs
}: HistoryPanelProps): JSX.Element {
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(() => new Set())
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const selectableJobs = useMemo(
    () => jobs.filter((job) => job.status !== 'running'),
    [jobs]
  )
  const selectableJobIds = useMemo(
    () => new Set(selectableJobs.map((job) => job.id)),
    [selectableJobs]
  )
  const selectedCount = selectedJobIds.size
  const isAllSelected =
    selectableJobs.length > 0 && selectableJobs.every((job) => selectedJobIds.has(job.id))

  useEffect(() => {
    setSelectedJobIds((currentSelectedIds) => {
      const nextSelectedIds = new Set(
        Array.from(currentSelectedIds).filter((jobId) => selectableJobIds.has(jobId))
      )

      return nextSelectedIds.size === currentSelectedIds.size ? currentSelectedIds : nextSelectedIds
    })
  }, [selectableJobIds])

  const toggleJob = (jobId: string): void => {
    setDeleteError(null)
    setSelectedJobIds((currentSelectedIds) => {
      const nextSelectedIds = new Set(currentSelectedIds)
      if (nextSelectedIds.has(jobId)) {
        nextSelectedIds.delete(jobId)
      } else {
        nextSelectedIds.add(jobId)
      }

      return nextSelectedIds
    })
  }

  const toggleAll = (): void => {
    setDeleteError(null)
    setSelectedJobIds(() =>
      isAllSelected ? new Set() : new Set(selectableJobs.map((job) => job.id))
    )
  }

  const deleteSelectedJobs = async (): Promise<void> => {
    if (selectedCount === 0) {
      return
    }

    if (!window.confirm(`确定删除选中的 ${selectedCount} 个历史任务吗？对应产物目录也会被清理。`)) {
      return
    }

    try {
      setDeleteError(null)
      await onDeleteJobs(Array.from(selectedJobIds))
      setSelectedJobIds(new Set())
    } catch (error) {
      setDeleteError(getErrorMessage(error))
    }
  }

  return (
    <aside className="panel history-panel" aria-labelledby="history-panel-title">
      <div className="panel-header">
        <div>
          <h2 id="history-panel-title">历史任务</h2>
          <p>{isLoading ? '加载中' : `${jobs.length} 个任务`}</p>
        </div>
        <div className="history-header-actions">
          <button
            className="icon-text-button"
            type="button"
            disabled={selectableJobs.length === 0}
            onClick={toggleAll}
          >
            {isAllSelected ? '取消全选' : '全选'}
          </button>
          <button className="icon-text-button" type="button" onClick={() => void onRefresh()}>
            刷新
          </button>
        </div>
      </div>

      {errorMessage ? <p className="inline-message error-message">{errorMessage}</p> : null}
      {deleteError ? <p className="inline-message error-message">{deleteError}</p> : null}

      {jobs.length > 0 ? (
        <div className="history-bulk-bar">
          <span>{selectedCount > 0 ? `已选择 ${selectedCount} 个` : '选择历史任务后可批量删除'}</span>
          <button
            className="danger-button"
            type="button"
            disabled={selectedCount === 0}
            onClick={() => void deleteSelectedJobs()}
          >
            删除选中
          </button>
        </div>
      ) : null}

      {jobs.length === 0 && !isLoading ? <div className="empty-state">暂无历史任务</div> : null}

      <ol className="history-list">
        {jobs.map((job) => (
          <li
            className={selectedJobIds.has(job.id) ? 'history-row is-selected' : 'history-row'}
            key={job.id}
          >
            <label className="history-select">
              <input
                type="checkbox"
                checked={selectedJobIds.has(job.id)}
                disabled={job.status === 'running'}
                aria-label={`选择任务 ${job.provider} / ${job.model}`}
                onChange={() => toggleJob(job.id)}
              />
            </label>
            <div className="history-row-content">
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
            </div>
          </li>
        ))}
      </ol>
    </aside>
  )
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '删除历史任务失败'
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
