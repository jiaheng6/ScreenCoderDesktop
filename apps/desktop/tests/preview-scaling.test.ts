import { describe, expect, it } from 'vitest'
import { calculateHtmlPreviewMetrics } from '../src/renderer/src/preview-scaling'

describe('HTML 预览缩放', () => {
  it('适合窗口时保持 iframe 原始 viewport，只缩放外层显示尺寸', () => {
    const metrics = calculateHtmlPreviewMetrics({
      width: 3368,
      height: 1710,
      scaleMode: 'fit',
      availableWidth: 1090
    })

    expect(metrics.frameWidth).toBe(3368)
    expect(metrics.frameHeight).toBe(1710)
    expect(metrics.scale).toBeCloseTo(1090 / 3368)
    expect(metrics.stageWidth).toBeCloseTo(1090)
    expect(metrics.stageHeight).toBeCloseTo(1710 * (1090 / 3368))
  })

  it('100% 模式使用原始尺寸', () => {
    expect(
      calculateHtmlPreviewMetrics({
        width: 3368,
        height: 1710,
        scaleMode: 'actual',
        availableWidth: 1090
      })
    ).toEqual({
      frameWidth: 3368,
      frameHeight: 1710,
      stageWidth: 3368,
      stageHeight: 1710,
      scale: 1
    })
  })

  it('适合窗口不会放大超过原始尺寸', () => {
    expect(
      calculateHtmlPreviewMetrics({
        width: 800,
        height: 600,
        scaleMode: 'fit',
        availableWidth: 1200
      }).scale
    ).toBe(1)
  })
})
