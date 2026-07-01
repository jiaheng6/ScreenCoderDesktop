import type { ScreencoderModelConfigRecord } from './global'

export function selectPreferredModel(
  models: ScreencoderModelConfigRecord[],
  currentModel: ScreencoderModelConfigRecord | null
): ScreencoderModelConfigRecord | null {
  if (currentModel) {
    const existingModel = models.find((model) => model.id === currentModel.id)
    if (existingModel) {
      return existingModel
    }
  }

  return models[0] ?? null
}
