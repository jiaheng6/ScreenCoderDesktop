import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const rendererIndexPath = resolve(__dirname, '../src/renderer/index.html')

describe('渲染层安全策略', () => {
  it('允许沙箱预览加载 Tailwind CDN 和 HTTPS 图片资源', () => {
    const html = readFileSync(rendererIndexPath, 'utf8')
    const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1]

    expect(csp).toBeTruthy()
    expect(csp).toContain('https://cdn.tailwindcss.com')
    expect(csp).toMatch(/img-src[^;]*https:/)
  })
})
