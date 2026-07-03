import type { ScreencoderRuntimeEnvironmentStatus } from './global'

export interface RunPipelineGateInput {
  selectedPath: string | null
  hasSelectedModel: boolean
  isRunning: boolean
  isCheckingEnvironment: boolean
  isInstallingEnvironment: boolean
  runtimeStatus: ScreencoderRuntimeEnvironmentStatus | null
}

export function isRunPipelineDisabled(input: RunPipelineGateInput): boolean {
  return (
    input.isRunning ||
    input.isCheckingEnvironment ||
    input.isInstallingEnvironment ||
    !input.selectedPath ||
    !input.hasSelectedModel ||
    input.runtimeStatus?.ok !== true
  )
}
