import { describe, expect, it } from 'vitest'
import { selectPreferredModel } from '../src/renderer/src/model-selection'

type ModelRecord = Parameters<typeof selectPreferredModel>[0][number]

const minimaxModel: ModelRecord = {
  id: 'model-minimax',
  name: 'Minimax M3',
  providerId: 'provider-opencode',
  model: 'minimax-m3',
  createdAt: '2026-07-02T00:00:00.000Z',
  updatedAt: '2026-07-02T00:00:00.000Z'
}

const fallbackModel: ModelRecord = {
  id: 'model-fallback',
  name: '备用模型',
  providerId: 'provider-opencode',
  model: 'fallback-model',
  createdAt: '2026-07-02T00:01:00.000Z',
  updatedAt: '2026-07-02T00:01:00.000Z'
}

describe('模型默认选择', () => {
  it('没有当前选择时会使用第一个已保存模型', () => {
    expect(selectPreferredModel([minimaxModel, fallbackModel], null)).toEqual(minimaxModel)
  })

  it('当前选择仍存在时会保留当前模型', () => {
    expect(selectPreferredModel([minimaxModel, fallbackModel], fallbackModel)).toEqual(fallbackModel)
  })

  it('当前选择已不存在时会回退到第一个模型', () => {
    expect(
      selectPreferredModel([minimaxModel], {
        ...fallbackModel,
        id: 'deleted-model'
      })
    ).toEqual(minimaxModel)
  })
})
