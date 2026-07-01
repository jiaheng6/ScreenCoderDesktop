interface LogPanelProps {
  activeJobId: string | null
  logs: string[]
}

export function LogPanel({ activeJobId, logs }: LogPanelProps): JSX.Element {
  return (
    <section className="panel log-panel" aria-labelledby="log-panel-title">
      <div className="panel-header">
        <div>
          <h2 id="log-panel-title">运行日志</h2>
          <p>{activeJobId ? `当前任务：${activeJobId}` : '等待流水线运行'}</p>
        </div>
      </div>

      <pre className="log-stream" aria-live="polite">
        {logs.length > 0 ? logs.join('\n') : '暂无运行日志'}
      </pre>
    </section>
  )
}
