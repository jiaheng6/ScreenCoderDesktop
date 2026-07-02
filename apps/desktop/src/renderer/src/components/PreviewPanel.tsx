import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { calculateHtmlPreviewMetrics, type PreviewScaleMode } from '../preview-scaling'

export interface PreviewImageArtifact {
  path: string
  dataUrl: string
  imageWidth: number | null
  imageHeight: number | null
}

export type PreviewContent =
  | { type: 'empty' }
  | ({
      type: 'image'
    } & PreviewImageArtifact)
  | {
      type: 'html'
      jobId: string
      htmlPath: string
      htmlUrl: string
      previewHtml: string
      imageWidth: number | null
      imageHeight: number | null
      inputPreview: PreviewImageArtifact | null
      annotationPreview: PreviewImageArtifact | null
      html: string
      sourcePath: string | null
      source: string | null
    }

interface PreviewPanelProps {
  preview: PreviewContent
}

type PreviewTab = 'compare' | 'input' | 'annotation' | 'generated' | 'source'

const htmlPreviewTabs: Array<{ id: PreviewTab; label: string }> = [
  { id: 'compare', label: '对比' },
  { id: 'input', label: '原图' },
  { id: 'annotation', label: '标注' },
  { id: 'generated', label: '生成' },
  { id: 'source', label: '源码' }
]

export function PreviewPanel({ preview }: PreviewPanelProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<PreviewTab>('compare')
  const [scaleMode, setScaleMode] = useState<PreviewScaleMode>('actual')
  const [failedImagePaths, setFailedImagePaths] = useState<string[]>([])

  useEffect(() => {
    setActiveTab(preview.type === 'html' ? 'compare' : 'input')
    setScaleMode('actual')
    setFailedImagePaths([])
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

  if (preview.type === 'image') {
    const sizeLabel = formatImageSize(preview.imageWidth, preview.imageHeight)

    return (
      <section className="panel preview-panel" aria-labelledby="preview-panel-title">
        <div className="panel-header">
          <div>
            <h2 id="preview-panel-title">原始截图</h2>
            <p>{sizeLabel ? `原始尺寸：${sizeLabel}` : '截图画布'}</p>
          </div>
        </div>
        <PreviewToolbar scaleMode={scaleMode} onScaleModeChange={setScaleMode} />
        <div className="preview-canvas">
          {renderImageStage({
            artifact: preview,
            alt: '当前截图预览',
            scaleMode,
            failedImagePaths,
            onImageError: markImageFailed
          })}
        </div>
        <PathBlock label="预览路径" path={preview.path} />
      </section>
    )
  }

  const sizeLabel = formatImageSize(preview.imageWidth, preview.imageHeight)
  const visibleTabs = preview.sourcePath
    ? htmlPreviewTabs
    : htmlPreviewTabs.filter((tab) => tab.id !== 'source')
  const safeActiveTab = visibleTabs.some((tab) => tab.id === activeTab) ? activeTab : 'compare'

  return (
    <section className="panel preview-panel" aria-labelledby="preview-panel-title">
      <div className="panel-header">
        <div>
          <h2 id="preview-panel-title">预览对比</h2>
          <p>{sizeLabel ? `任务：${preview.jobId}，原始尺寸：${sizeLabel}` : `任务：${preview.jobId}`}</p>
        </div>
      </div>

      <PreviewToolbar
        tabs={visibleTabs}
        activeTab={safeActiveTab}
        scaleMode={scaleMode}
        onTabChange={setActiveTab}
        onScaleModeChange={setScaleMode}
        hideScale={safeActiveTab === 'source'}
      />

      <div className="preview-canvas">
        {safeActiveTab === 'compare'
          ? renderCompareView(preview, scaleMode, failedImagePaths, markImageFailed)
          : renderSingleTab(preview, safeActiveTab, scaleMode, failedImagePaths, markImageFailed)}
      </div>

      <div className="preview-path-grid">
        <PathBlock label="HTML 产物" path={preview.htmlPath} />
        {preview.sourcePath ? <PathBlock label="源码产物" path={preview.sourcePath} /> : null}
      </div>
    </section>
  )

  function markImageFailed(path: string): void {
    setFailedImagePaths((currentPaths) =>
      currentPaths.includes(path) ? currentPaths : [...currentPaths, path]
    )
  }
}

interface PreviewToolbarProps {
  tabs?: Array<{ id: PreviewTab; label: string }>
  activeTab?: PreviewTab
  scaleMode: PreviewScaleMode
  hideScale?: boolean
  onTabChange?: (tab: PreviewTab) => void
  onScaleModeChange: (mode: PreviewScaleMode) => void
}

function PreviewToolbar({
  tabs,
  activeTab,
  scaleMode,
  hideScale = false,
  onTabChange,
  onScaleModeChange
}: PreviewToolbarProps): JSX.Element {
  return (
    <div className="preview-toolbar">
      {tabs && activeTab && onTabChange ? (
        <div className="preview-tabs" role="tablist" aria-label="预览类型">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={activeTab === tab.id ? 'preview-tab is-active' : 'preview-tab'}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : (
        <div />
      )}

      {hideScale ? null : (
        <div className="preview-scale-switch" aria-label="预览缩放">
          <button
            className={scaleMode === 'actual' ? 'preview-scale-button is-active' : 'preview-scale-button'}
            type="button"
            onClick={() => onScaleModeChange('actual')}
          >
            100%
          </button>
          <button
            className={scaleMode === 'fit' ? 'preview-scale-button is-active' : 'preview-scale-button'}
            type="button"
            onClick={() => onScaleModeChange('fit')}
          >
            适合窗口
          </button>
        </div>
      )}
    </div>
  )
}

function renderCompareView(
  preview: Extract<PreviewContent, { type: 'html' }>,
  scaleMode: PreviewScaleMode,
  failedImagePaths: string[],
  onImageError: (path: string) => void
): JSX.Element {
  return (
    <div className={scaleMode === 'fit' ? 'preview-comparison-grid is-fit' : 'preview-comparison-grid'}>
      <ArtifactPane
        title="原始截图"
        path={preview.inputPreview?.path ?? null}
        sizeLabel={formatImageSize(preview.inputPreview?.imageWidth ?? null, preview.inputPreview?.imageHeight ?? null)}
      >
        {preview.inputPreview
          ? renderImageStage({
              artifact: preview.inputPreview,
              alt: '原始截图',
              scaleMode,
              failedImagePaths,
              onImageError
            })
          : <div className="empty-state">原始截图不可用</div>}
      </ArtifactPane>

      <ArtifactPane
        title="区域标注"
        path={preview.annotationPreview?.path ?? null}
        sizeLabel={formatImageSize(
          preview.annotationPreview?.imageWidth ?? null,
          preview.annotationPreview?.imageHeight ?? null
        )}
      >
        {preview.annotationPreview
          ? renderImageStage({
              artifact: preview.annotationPreview,
              alt: '区域标注图',
              scaleMode,
              failedImagePaths,
              onImageError
            })
          : <div className="empty-state">未生成标注图</div>}
      </ArtifactPane>

      <ArtifactPane title="生成效果" path={preview.htmlPath} sizeLabel={formatImageSize(preview.imageWidth, preview.imageHeight)}>
        {renderHtmlStage(preview, scaleMode)}
      </ArtifactPane>
    </div>
  )
}

function renderSingleTab(
  preview: Extract<PreviewContent, { type: 'html' }>,
  activeTab: PreviewTab,
  scaleMode: PreviewScaleMode,
  failedImagePaths: string[],
  onImageError: (path: string) => void
): JSX.Element {
  if (activeTab === 'input') {
    return preview.inputPreview
      ? renderImageStage({
          artifact: preview.inputPreview,
          alt: '原始截图',
          scaleMode,
          failedImagePaths,
          onImageError
        })
      : <div className="empty-state">原始截图不可用</div>
  }

  if (activeTab === 'annotation') {
    return preview.annotationPreview
      ? renderImageStage({
          artifact: preview.annotationPreview,
          alt: '区域标注图',
          scaleMode,
          failedImagePaths,
          onImageError
        })
      : <div className="empty-state">未生成标注图</div>
  }

  if (activeTab === 'generated') {
    return renderHtmlStage(preview, scaleMode)
  }

  if (activeTab === 'source') {
    return (
      <div className="source-preview source-preview-expanded">
        <pre>{preview.source ?? '源码文件为空'}</pre>
      </div>
    )
  }

  return renderCompareView(preview, scaleMode, failedImagePaths, onImageError)
}

interface ArtifactPaneProps {
  title: string
  path: string | null
  sizeLabel: string | null
  children: ReactNode
}

function ArtifactPane({ title, path, sizeLabel, children }: ArtifactPaneProps): JSX.Element {
  return (
    <section className="preview-artifact-pane" aria-label={title}>
      <div className="preview-artifact-header">
        <div>
          <h3>{title}</h3>
          <p>{sizeLabel ?? '未读取尺寸'}</p>
        </div>
      </div>
      <div className="preview-artifact-body">{children}</div>
      {path ? <div className="preview-artifact-path" title={path}>{path}</div> : null}
    </section>
  )
}

interface RenderImageStageInput {
  artifact: PreviewImageArtifact
  alt: string
  scaleMode: PreviewScaleMode
  failedImagePaths: string[]
  onImageError: (path: string) => void
}

function renderImageStage({
  artifact,
  alt,
  scaleMode,
  failedImagePaths,
  onImageError
}: RenderImageStageInput): JSX.Element {
  if (failedImagePaths.includes(artifact.path)) {
    return <div className="empty-state">图片无法预览，请确认文件仍可访问。</div>
  }

  return (
    <div className={getPreviewStageClassName(artifact.imageWidth, artifact.imageHeight, scaleMode)} style={getPreviewStageStyle(artifact.imageWidth, artifact.imageHeight)}>
      <img
        className="preview-image"
        src={artifact.dataUrl}
        alt={alt}
        onError={() => onImageError(artifact.path)}
      />
    </div>
  )
}

function renderHtmlStage(
  preview: Extract<PreviewContent, { type: 'html' }>,
  scaleMode: PreviewScaleMode
): JSX.Element {
  if (scaleMode === 'fit' && hasPreviewSize(preview.imageWidth, preview.imageHeight)) {
    return <HtmlFitPreviewStage preview={preview} />
  }

  return (
    <div className={getPreviewStageClassName(preview.imageWidth, preview.imageHeight, scaleMode)} style={getPreviewStageStyle(preview.imageWidth, preview.imageHeight)}>
      <iframe
        className="preview-frame"
        sandbox="allow-scripts"
        srcDoc={preview.previewHtml}
        title="最终 HTML 预览"
      />
    </div>
  )
}

interface HtmlFitPreviewStageProps {
  preview: Extract<PreviewContent, { type: 'html' }>
}

function HtmlFitPreviewStage({ preview }: HtmlFitPreviewStageProps): JSX.Element {
  const shellRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState<number | null>(null)
  const previewWidth = preview.imageWidth ?? 1
  const previewHeight = preview.imageHeight ?? 1

  useEffect(() => {
    const shell = shellRef.current
    if (!shell) {
      return
    }

    const updateAvailableWidth = (): void => {
      setAvailableWidth(shell.clientWidth)
    }

    updateAvailableWidth()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateAvailableWidth)
      return () => window.removeEventListener('resize', updateAvailableWidth)
    }

    const observer = new ResizeObserver(updateAvailableWidth)
    observer.observe(shell)
    return () => observer.disconnect()
  }, [])

  const metrics = calculateHtmlPreviewMetrics({
    width: previewWidth,
    height: previewHeight,
    scaleMode: 'fit',
    availableWidth
  })
  const stageStyle = {
    ...getPreviewStageStyle(previewWidth, previewHeight),
    width: `${metrics.stageWidth}px`,
    height: `${metrics.stageHeight}px`
  } as CSSProperties
  const frameStyle = {
    width: `${metrics.frameWidth}px`,
    height: `${metrics.frameHeight}px`,
    transform: `scale(${metrics.scale})`
  } as CSSProperties

  return (
    <div className="preview-html-fit-shell" ref={shellRef}>
      <div className="preview-stage preview-html-stage is-fit" style={stageStyle}>
        <iframe
          className="preview-frame preview-frame-scaled"
          sandbox="allow-scripts"
          srcDoc={preview.previewHtml}
          style={frameStyle}
          title="最终 HTML 预览"
        />
      </div>
    </div>
  )
}

interface PathBlockProps {
  label: string
  path: string
}

function PathBlock({ label, path }: PathBlockProps): JSX.Element {
  return (
    <div className="path-block" title={path}>
      <span className="field-label">{label}</span>
      <span className="path-value">{path}</span>
    </div>
  )
}

function getPreviewStageClassName(
  width: number | null,
  height: number | null,
  scaleMode: PreviewScaleMode
): string {
  const classNames = hasPreviewSize(width, height)
    ? ['preview-stage']
    : ['preview-stage', 'preview-stage-fluid']

  if (scaleMode === 'fit') {
    classNames.push('is-fit')
  }

  return classNames.join(' ')
}

function getPreviewStageStyle(width: number | null, height: number | null): CSSProperties | undefined {
  if (!isPositiveNumber(width) || !isPositiveNumber(height)) {
    return undefined
  }

  return {
    '--preview-width': `${width}px`,
    '--preview-height': `${height}px`,
    '--preview-aspect': `${width} / ${height}`
  } as CSSProperties
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
