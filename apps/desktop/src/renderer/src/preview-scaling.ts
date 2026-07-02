export type PreviewScaleMode = 'actual' | 'fit'

interface CalculateHtmlPreviewMetricsInput {
  width: number
  height: number
  scaleMode: PreviewScaleMode
  availableWidth: number | null
}

interface HtmlPreviewMetrics {
  frameWidth: number
  frameHeight: number
  stageWidth: number
  stageHeight: number
  scale: number
}

export function calculateHtmlPreviewMetrics({
  width,
  height,
  scaleMode,
  availableWidth
}: CalculateHtmlPreviewMetricsInput): HtmlPreviewMetrics {
  const safeWidth = Math.max(1, width)
  const safeHeight = Math.max(1, height)
  const available = isPositiveNumber(availableWidth) ? availableWidth : 0
  const scale = scaleMode === 'fit' ? Math.min(1, available / safeWidth) : 1

  return {
    frameWidth: safeWidth,
    frameHeight: safeHeight,
    stageWidth: safeWidth * scale,
    stageHeight: safeHeight * scale,
    scale
  }
}

function isPositiveNumber(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}
