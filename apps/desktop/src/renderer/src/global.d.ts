export type ScreencoderJobStatus = 'queued' | 'running' | 'succeeded' | 'failed'
export type ScreencoderPageKind = 'web' | 'mobile' | 'custom'
export type ScreencoderTargetFramework = 'html' | 'vue2' | 'vue3' | 'react'

export interface ScreencoderJobRecord {
  id: string
  inputPath: string
  outputDir: string
  modelConfigId: string
  provider: string
  model: string
  targetFramework: ScreencoderTargetFramework
  pageKind: ScreencoderPageKind
  status: ScreencoderJobStatus
  createdAt: string
  updatedAt: string
}

export interface ScreencoderModelProviderInput {
  id?: string
  name: string
  provider: string
  baseUrl: string
  apiKey?: string
}

export interface ScreencoderModelProviderRecord {
  id: string
  name: string
  provider: string
  baseUrl: string
  hasApiKey: boolean
  createdAt: string
  updatedAt: string
}

export interface ScreencoderModelConfigInput {
  id?: string
  name: string
  providerId: string
  model: string
}

export interface ScreencoderModelConfigRecord {
  id: string
  name: string
  providerId: string
  model: string
  createdAt: string
  updatedAt: string
}

export interface ScreencoderCreateJobInput {
  inputPath: string
  modelConfigId: string
  targetFramework: ScreencoderTargetFramework
  pageKind: ScreencoderPageKind
}

export type ScreencoderWorkerEvent = Record<string, unknown>

export interface ScreencoderJobEventPayload {
  jobId: string
  event: ScreencoderWorkerEvent
}

export interface ScreencoderJobPreview {
  jobId: string
  htmlPath: string
  htmlUrl: string
  previewHtml: string
  imageWidth: number | null
  imageHeight: number | null
  inputPreview: ScreencoderImagePreview | null
  annotationPreview: ScreencoderImagePreview | null
  html: string
  sourcePath: string | null
  source: string | null
}

export interface ScreencoderImagePreview {
  path: string
  dataUrl: string
  imageWidth: number | null
  imageHeight: number | null
}

export interface ScreencoderModelConnectionTestResult {
  ok: boolean
  status: number | null
  message: string
  latencyMs: number
}

export interface ScreencoderRuntimeDependency {
  moduleName: string
  packageName: string
}

export interface ScreencoderRuntimeEnvironmentStatus {
  ok: boolean
  pythonExecutable: string
  managedPythonExecutable: string
  managedPythonExists: boolean
  workerCwd: string
  requirementsPath: string
  missingDependencies: ScreencoderRuntimeDependency[]
  playwrightChromiumReady: boolean | null
  canInstall: boolean
  message: string
}

export interface ScreencoderRuntimeEnvironmentInstallResult {
  ok: boolean
  pythonExecutable: string
  log: string
  error?: string
}

export interface ScreencoderRuntimeEnvironmentInstallProgress {
  type: 'progress'
  status: 'running' | 'done' | 'failed'
  step:
    | 'prepare'
    | 'create_venv'
    | 'upgrade_pip'
    | 'install_dependencies'
    | 'install_chromium'
    | 'final'
  label: string
  percent: number
  detail?: string
}

declare global {
  interface Window {
    screencoder: {
      appVersion: string
      selectImage: () => Promise<string | null>
      readImagePreview: (inputPath: string) => Promise<ScreencoderImagePreview>
      listJobs: () => Promise<ScreencoderJobRecord[]>
      createJobFromFile: (input: ScreencoderCreateJobInput) => Promise<ScreencoderJobRecord>
      runJob: (jobId: string) => Promise<ScreencoderJobRecord>
      readJobPreview: (jobId: string) => Promise<ScreencoderJobPreview>
      deleteJobs: (jobIds: string[]) => Promise<{ deletedCount: number }>
      onJobEvent: (callback: (payload: ScreencoderJobEventPayload) => void) => () => void
      onRuntimeEnvironmentEvent: (
        callback: (payload: ScreencoderRuntimeEnvironmentInstallProgress) => void
      ) => () => void
      listProviders: () => Promise<ScreencoderModelProviderRecord[]>
      saveProvider: (
        input: ScreencoderModelProviderInput
      ) => Promise<ScreencoderModelProviderRecord>
      listModels: () => Promise<ScreencoderModelConfigRecord[]>
      saveModel: (input: ScreencoderModelConfigInput) => Promise<ScreencoderModelConfigRecord>
      testModelConnection: (modelId: string) => Promise<ScreencoderModelConnectionTestResult>
      checkRuntimeEnvironment: () => Promise<ScreencoderRuntimeEnvironmentStatus>
      installRuntimeEnvironment: () => Promise<ScreencoderRuntimeEnvironmentInstallResult>
    }
  }
}
