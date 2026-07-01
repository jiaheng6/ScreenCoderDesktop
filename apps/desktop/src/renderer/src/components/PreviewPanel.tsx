import { useEffect, useState, type CSSProperties } from 'react'

export type PreviewContent =
  | { type: 'empty' }
  | {
      type: 'image'
      path: string
      dataUrl: string
      imageWidth: number | null
      imageHeight: number | null
    }
  | {
      type: 'html'
      jobId: string
      htmlPath: string
      htmlUrl: string
      previewHtml: string
      imageWidth: number | null
      imageHeight: number | null
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
    const sizeLabel = formatImageSize(preview.imageWidth, preview.imageHeight)
    const stageClassName = getPreviewStageClassName(preview.imageWidth, preview.imageHeight)

    return (
      <section className="panel preview-panel" aria-labelledby="preview-panel-title">
        <div className="panel-header">
          <div>
            <h2 id="preview-panel-title">最终预览</h2>
            <p>{sizeLabel ? `任务：${preview.jobId}，原始尺寸：${sizeLabel}` : `任务：${preview.jobId}`}</p>
          </div>
        </div>

        <div className="preview-canvas">
          <div
            className={stageClassName}
            style={getPreviewStageStyle(preview.imageWidth, preview.imageHeight)}
          >
            <iframe
              className="preview-frame"
              sandbox="allow-scripts"
              srcDoc={preview.previewHtml}
              title="最终 HTML 预览"
            />
          </div>
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

  const sizeLabel = formatImageSize(preview.imageWidth, preview.imageHeight)
  const stageClassName = getPreviewStageClassName(preview.imageWidth, preview.imageHeight)

  return (
    <section className="panel preview-panel" aria-labelledby="preview-panel-title">
      <div className="panel-header">
        <div>
          <h2 id="preview-panel-title">预览</h2>
          <p>{sizeLabel ? `截图画布，原始尺寸：${sizeLabel}` : '截图画布'}</p>
        </div>
      </div>

      <div className="preview-canvas">
        {imageError ? (
          <div className="empty-state">{imageError}</div>
        ) : (
          <div
            className={stageClassName}
            style={getPreviewStageStyle(preview.imageWidth, preview.imageHeight)}
          >
            <img
              className="preview-image"
              src={preview.dataUrl}
              alt="当前截图预览"
              onError={() => setImageError('图片无法预览，请确认文件仍可访问。')}
            />
          </div>
        )}
      </div>

      <div className="path-block" title={preview.path}>
        <span className="field-label">预览路径</span>
        <span className="path-value">{preview.path}</span>
      </div>
    </section>
  )
}

function getPreviewStageClassName(width: number | null, height: number | null): string {
  return hasPreviewSize(width, height) ? 'preview-stage' : 'preview-stage preview-stage-fluid'
}

function getPreviewStageStyle(width: number | null, height: number | null): CSSProperties | undefined {
  if (!isPositiveNumber(width) || !isPositiveNumber(height)) {
    return undefined
  }

  return {
    width,
    height
  }
}

function hasPreviewSize(width: number | null, height: number | null): boolean {
  return isPositiveNumber(width) && isPositiveNumber(height)
}

function isPositiveNumber(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function formatImageSize(width: number | null, height: number | null): string | null {
  if (!hasPreviewSize(width, height)) {
    return null
  }

  return `${width} × ${height}`
}
