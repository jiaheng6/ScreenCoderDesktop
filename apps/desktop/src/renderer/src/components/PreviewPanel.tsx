import { useEffect, useState } from 'react'

interface PreviewPanelProps {
  selectedPath: string | null
}

export function PreviewPanel({ selectedPath }: PreviewPanelProps): JSX.Element {
  const [imageError, setImageError] = useState<string | null>(null)

  useEffect(() => {
    setImageError(null)
  }, [selectedPath])

  if (!selectedPath) {
    return (
      <section className="panel preview-panel" aria-labelledby="preview-panel-title">
        <div className="panel-header">
          <div>
            <h2 id="preview-panel-title">预览</h2>
            <p>截图画布</p>
          </div>
        </div>
        <div className="empty-state">暂无截图预览</div>
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
            src={toFileUrl(selectedPath)}
            alt="当前截图预览"
            onError={() => setImageError('图片无法预览，请确认文件仍可访问。')}
          />
        )}
      </div>

      <div className="path-block" title={selectedPath}>
        <span className="field-label">预览路径</span>
        <span className="path-value">{selectedPath}</span>
      </div>
    </section>
  )
}

function toFileUrl(path: string): string {
  const normalizedPath = path.replace(/\\/g, '/')
  const prefixedPath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`

  return `file://${encodeURI(prefixedPath).replace(/#/g, '%23').replace(/\?/g, '%3F')}`
}
