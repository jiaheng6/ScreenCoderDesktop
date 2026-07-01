import { spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import type { PageKind, TargetFramework } from './job-store'

export type WorkerEvent = Record<string, unknown>

export interface RunWorkerInput {
  pythonExecutable: string
  workerCwd: string
  inputPath: string
  outputDir: string
  provider: string
  model: string
  target: TargetFramework
  pageKind: PageKind
  onEvent: (event: WorkerEvent) => void
}

export function runWorker(input: RunWorkerInput): Promise<number> {
  return new Promise((resolve, reject) => {
    let settled = false
    let fatalError: unknown = null
    const args = [
      '-m',
      'screencoder_worker.cli',
      'run',
      '--input',
      input.inputPath,
      '--output',
      input.outputDir,
      '--provider',
      input.provider,
      '--model',
      input.model,
      '--target',
      input.target,
      '--page-kind',
      input.pageKind
    ]

    const child = spawn(input.pythonExecutable, args, {
      cwd: input.workerCwd,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const stopWithError = (error: unknown): void => {
      if (fatalError) {
        return
      }

      fatalError = error
      child.kill()
    }

    const stdoutReader = createLineReader((line) => {
      if (fatalError) {
        return
      }

      try {
        const event = parseWorkerEvent(line)

        if (!isWorkerEvent(event)) {
          throw new Error(`Worker stdout 输出的 JSON 事件必须是对象：${line}`)
        }

        input.onEvent(event)
      } catch (error) {
        stopWithError(error)
      }
    })

    const stderrReader = createLineReader((line) => {
      if (fatalError) {
        return
      }

      try {
        input.onEvent({
          type: 'log',
          stream: 'stderr',
          line
        })
      } catch (error) {
        stopWithError(error)
      }
    })

    child.stdout.on('data', (chunk: Buffer) => stdoutReader.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderrReader.push(chunk))
    child.stdout.on('error', stopWithError)
    child.stderr.on('error', stopWithError)
    child.on('error', (error) => {
      if (settled) {
        return
      }

      settled = true
      reject(error)
    })
    child.on('close', (code) => {
      if (!fatalError) {
        stdoutReader.end()
        stderrReader.end()
      }

      if (settled) {
        return
      }

      settled = true
      if (fatalError) {
        reject(fatalError)
        return
      }

      resolve(code ?? 1)
    })
  })
}

function createLineReader(onLine: (line: string) => void): {
  push: (chunk: Buffer) => void
  end: () => void
} {
  const decoder = new StringDecoder('utf8')
  let buffered = ''

  const consume = (text: string): void => {
    buffered += text

    let newlineIndex = buffered.indexOf('\n')
    while (newlineIndex !== -1) {
      emitLine(buffered.slice(0, newlineIndex))
      buffered = buffered.slice(newlineIndex + 1)
      newlineIndex = buffered.indexOf('\n')
    }
  }

  const emitLine = (line: string): void => {
    const normalized = line.endsWith('\r') ? line.slice(0, -1) : line

    if (normalized !== '') {
      onLine(normalized)
    }
  }

  return {
    push(chunk) {
      consume(decoder.write(chunk))
    },
    end() {
      consume(decoder.end())

      if (buffered !== '') {
        emitLine(buffered)
        buffered = ''
      }
    }
  }
}

function isWorkerEvent(value: unknown): value is WorkerEvent {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseWorkerEvent(line: string): unknown {
  try {
    return JSON.parse(line) as unknown
  } catch (error) {
    throw new Error(`Worker stdout 不是合法 JSON：${line}`, { cause: error })
  }
}
