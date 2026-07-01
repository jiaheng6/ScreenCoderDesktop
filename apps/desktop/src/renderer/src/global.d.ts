export {}

interface ScreencoderJobRecord {
  id: string
  inputPath: string
  outputDir: string
  provider: string
  model: string
  targetFramework: string
  pageKind: string
  status: string
  createdAt: string
  updatedAt: string
}

interface ScreencoderModelProfileInput {
  name: string
  provider: string
  baseUrl: string
  model: string
  apiKeyRef: string
}

interface ScreencoderModelProfileRecord extends ScreencoderModelProfileInput {
  id: string
  createdAt: string
  updatedAt: string
}

declare global {
  interface Window {
    screencoder: {
      appVersion: string
      selectImage: () => Promise<string | null>
      listJobs: () => Promise<ScreencoderJobRecord[]>
      createJobFromFile: (inputPath: string) => Promise<ScreencoderJobRecord>
      listProfiles: () => Promise<ScreencoderModelProfileRecord[]>
      saveProfile: (
        input: ScreencoderModelProfileInput
      ) => Promise<ScreencoderModelProfileRecord>
    }
  }
}
