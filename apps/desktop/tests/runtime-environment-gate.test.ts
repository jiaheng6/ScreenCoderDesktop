import { describe, expect, it } from 'vitest'
import { isRunPipelineDisabled } from '../src/renderer/src/runtime-environment-gate'
import type { ScreencoderRuntimeEnvironmentStatus } from '../src/renderer/src/global'

const readyStatus: ScreencoderRuntimeEnvironmentStatus = {
  ok: true,
  pythonExecutable: 'C:\\app\\runtime\\python.exe',
  managedPythonExecutable: 'C:\\app\\runtime\\python.exe',
  managedPythonExists: true,
  workerCwd: 'C:\\app\\python',
  requirementsPath: 'C:\\app\\python\\requirements-runtime.txt',
  missingDependencies: [],
  playwrightChromiumReady: true,
  canInstall: true,
  message: '运行环境可用'
}

describe('运行流水线前置条件', () => {
  it('环境尚未检测完成时禁用运行按钮', () => {
    expect(
      isRunPipelineDisabled({
        selectedPath: 'C:\\screen.png',
        hasSelectedModel: true,
        isRunning: false,
        isCheckingEnvironment: true,
        isInstallingEnvironment: false,
        runtimeStatus: null
      })
    ).toBe(true)
  })

  it('环境检测未通过时禁用运行按钮', () => {
    expect(
      isRunPipelineDisabled({
        selectedPath: 'C:\\screen.png',
        hasSelectedModel: true,
        isRunning: false,
        isCheckingEnvironment: false,
        isInstallingEnvironment: false,
        runtimeStatus: {
          ...readyStatus,
          ok: false,
          missingDependencies: [{ moduleName: 'cv2', packageName: 'opencv-python-headless' }],
          message: '缺少运行依赖'
        }
      })
    ).toBe(true)
  })

  it('截图、模型和环境都就绪时允许运行', () => {
    expect(
      isRunPipelineDisabled({
        selectedPath: 'C:\\screen.png',
        hasSelectedModel: true,
        isRunning: false,
        isCheckingEnvironment: false,
        isInstallingEnvironment: false,
        runtimeStatus: readyStatus
      })
    ).toBe(false)
  })
})
