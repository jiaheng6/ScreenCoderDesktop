export type ScreencoderJobStatus = 'queued' | 'running' | 'succeeded' | 'failed'
export type ScreencoderPageKind = 'web' | 'mobile' | 'custom'
export type ScreencoderTargetFramework = 'html' | 'vue2' | 'vue3' | 'react'

export interface ScreencoderJobRecord {
  id: string
  inputPath: string
  outputDir: string
  provider: string
  model: string
  targetFramework: ScreencoderTargetFramework
  pageKind: ScreencoderPageKind
  status: ScreencoderJobStatus
  createdAt: string
  updatedAt: string
}

export interface ScreencoderModelProfileInput {
  name: string
  provider: string
  baseUrl: string
  model: string
  apiKeyRef: string
}

export interface ScreencoderModelProfileRecord extends ScreencoderModelProfileInput {
  id: string
  createdAt: string
  updatedAt: string
}

export interface ScreencoderCreateJobInput {
  inputPath: string
  provider: string
  model: string
  targetFramework: ScreencoderTargetFramework
  pageKind: ScreencoderPageKind
}

declare global {
  interface Window {
    screencoder: {
      appVersion: string
      selectImage: () => Promise<string | null>
      listJobs: () => Promise<ScreencoderJobRecord[]>
      createJobFromFile: (input: ScreencoderCreateJobInput) => Promise<ScreencoderJobRecord>
      listProfiles: () => Promise<ScreencoderModelProfileRecord[]>
      saveProfile: (
        input: ScreencoderModelProfileInput
      ) => Promise<ScreencoderModelProfileRecord>
    }
  }
}
