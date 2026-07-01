import { useEffect, useState } from 'react'

export type PreviewContent =
  | { type: 'empty' }
  | { type: 'image'; path: string; dataUrl: string }
  | {
      type: 'html'
      jobId: string
      htmlPath: string
      htmlUrl: string
      html: string
      sourcePath: string | null
      source: string | null
    }

interface PreviewPanelProps {
  preview: PreviewContent
}

export function PreviewPanel({ preview }: PreviewPanelProps): JSX.Element {
  const [imageError, setImageError] = useState<string | null>(null)

  useEffect(() => {
    setImageError(null)
  }, [preview])

  if (preview.type === 'empty') {
    return (
      <section className="panel preview-panel" aria-labelledby="preview-panel-title">
        <div className="panel-header">
          <div>
            <h2 id="preview-panel-title">预览</h2>
            <p>等待截图或生成结果</p>
          </div>
        </div>
        <div className="empty-state">暂无截图预览</div>
      </section>
    )
  }

  if (preview.type === 'html') {
    return (
      <section className="panel preview-panel" aria-labelledby="preview-panel-title">
        <div className="panel-header">
          <div>
            <h2 id="preview-panel-title">最终预览</h2>
            <p>任务：{preview.jobId}</p>
          </div>
        </div>

        <div className="preview-canvas">
          <iframe
            className="preview-frame"
            sandbox="allow-scripts"
            src={preview.htmlUrl}
            title="最终 HTML 预览"
          />
        </div>

        <div className="path-block" title={preview.htmlPath}>
          <span className="field-label">HTML 产物</span>
          <span className="path-value">{preview.htmlPath}</span>
        </div>

        {preview.sourcePath ? (
          <details className="source-preview">
            <summary>源码产物：{preview.sourcePath}</summary>
            <pre>{preview.source ?? '源码文件为空'}</pre>
          </details>
        ) : null}
      </section>
    )
  }

  return (
    <section className="panel preview-panel" aria-labelledby="preview-panel-title">
      <div className="panel-header">
        <div>
          <h2 id="preview-panel-title">预览</h2>
          <p>截图画布</p>
        </div>
      </div>

      <div className="preview-canvas">
        {imageError ? (
          <div className="empty-state">{imageError}</div>
        ) : (
          <img
            src={preview.dataUrl}
            alt="当前截图预览"
            onError={() => setImageError('图片无法预览，请确认文件仍可访问。')}
          />
        )}
      </div>

      <div className="path-block" title={preview.path}>
        <span className="field-label">预览路径</span>
        <span className="path-value">{preview.path}</span>
      </div>
    </section>
  )
}
