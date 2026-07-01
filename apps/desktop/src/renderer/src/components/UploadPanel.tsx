import { useState, type DragEvent } from 'react'

interface UploadPanelProps {
  selectedPath: string | null
  onSelectPath: (path: string) => void
}

export function UploadPanel({ selectedPath, onSelectPath }: UploadPanelProps): JSX.Element {
  const [isSelecting, setIsSelecting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  async function handleSelectImage(): Promise<void> {
    setIsSelecting(true)
    setMessage(null)

    try {
      const path = await window.screencoder.selectImage()

      if (path) {
        onSelectPath(path)
        setMessage('截图已选择')
      }
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setIsSelecting(false)
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setIsDragging(true)
  }

  function handleDragLeave(): void {
    setIsDragging(false)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    setIsDragging(false)
    setMessage(null)

    const droppedFile = event.dataTransfer.files.item(0) as (File & { path?: string }) | null

    if (droppedFile?.path) {
      if (!/\.(png|jpe?g|webp)$/i.test(droppedFile.path)) {
        setMessage('仅支持 png、jpg、jpeg、webp 图片。')
        return
      }

      onSelectPath(droppedFile.path)
      setMessage('截图已选择')
      return
    }

    setMessage('拖入文件没有可读取路径，请通过按钮选择截图。')
  }

  return (
    <section className="panel upload-panel" aria-labelledby="upload-panel-title">
      <div className="panel-header">
        <div>
          <h2 id="upload-panel-title">截图</h2>
          <p>选择输入图片</p>
        </div>
        <button className="primary-button" type="button" onClick={handleSelectImage} disabled={isSelecting}>
          {isSelecting ? '选择中' : '选择截图'}
        </button>
      </div>

      <div
        className={isDragging ? 'drop-zone is-dragging' : 'drop-zone'}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className="drop-zone-title">拖入截图文件</span>
        <span className="drop-zone-copy">支持 png、jpg、jpeg、webp</span>
      </div>

      <div className="path-block" title={selectedPath ?? undefined}>
        <span className="field-label">当前路径</span>
        <span className={selectedPath ? 'path-value' : 'muted-value'}>
          {selectedPath ?? '尚未选择截图'}
        </span>
      </div>

      {message ? <p className="inline-message">{message}</p> : null}
    </section>
  )
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '选择截图失败'
}
