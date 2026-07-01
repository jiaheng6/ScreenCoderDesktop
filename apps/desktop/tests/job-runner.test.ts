import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runWorker, type WorkerEvent } from '../src/main/jobs/job-runner'

const testDirectory = dirname(fileURLToPath(import.meta.url))
const workerCwd = resolve(testDirectory, '../../../python')

function createTempWorkspace(prefix: string): { directory: string; cleanup: () => void } {
  const directory = mkdtempSync(join(tmpdir(), prefix))

  return {
    directory,
    cleanup: () => rmSync(directory, { recursive: true, force: true })
  }
}

function resolvePythonExecutable(): string {
  if (process.env.SCREENCODER_PYTHON) {
    return process.env.SCREENCODER_PYTHON
  }

  if (process.platform === 'win32') {
    const result = spawnSync('py', ['-3', '-c', 'import sys; print(sys.executable)'], {
      encoding: 'utf8'
    })

    if (result.status === 0) {
      return result.stdout.trim()
    }
  }

  for (const executable of ['python3', 'python']) {
    const result = spawnSync(executable, ['-c', 'import sys; print(sys.executable)'], {
      encoding: 'utf8'
    })

    if (result.status === 0) {
      return result.stdout.trim()
    }
  }

  throw new Error('未找到可用的 Python 解释器')
}

function findFinalEvent(events: WorkerEvent[], status: string): WorkerEvent | undefined {
  return events.find(
    (event) => event.type === 'stage' && event.stage === 'final' && event.status === status
  )
}

describe('runWorker', () => {
  it('会运行真实 Python Worker，并生成最终 HTML 产物', async () => {
    const { directory, cleanup } = createTempWorkspace('screencoder-job-runner-')
    const inputPath = join(directory, 'input.png')
    const outputDir = join(directory, 'output')
    const events: WorkerEvent[] = []

    writeFileSync(inputPath, Buffer.from('mock image bytes'))

    try {
      const code = await runWorker({
        pythonExecutable: resolvePythonExecutable(),
        workerCwd,
        inputPath,
        outputDir,
        provider: 'mock',
        model: 'mock-model',
        target: 'html',
        pageKind: 'web',
        onEvent: (event) => events.push(event)
      })

      expect(code).toBe(0)
      expect(findFinalEvent(events, 'done')).toMatchObject({
        type: 'stage',
        stage: 'final',
        status: 'done',
        output: join(outputDir, 'final.html')
      })
      expect(existsSync(join(outputDir, 'final.html'))).toBe(true)
    } finally {
      cleanup()
    }
  })

  it('输入文件不存在时会返回失败码，并转发最终失败事件', async () => {
    const { directory, cleanup } = createTempWorkspace('screencoder-job-runner-missing-')
    const outputDir = join(directory, 'output')
    const events: WorkerEvent[] = []

    try {
      const code = await runWorker({
        pythonExecutable: resolvePythonExecutable(),
        workerCwd,
        inputPath: join(directory, 'missing.png'),
        outputDir,
        provider: 'mock',
        model: 'mock-model',
        target: 'html',
        pageKind: 'web',
        onEvent: (event) => events.push(event)
      })

      expect(code).toBe(1)
      expect(findFinalEvent(events, 'failed')).toMatchObject({
        type: 'stage',
        stage: 'final',
        status: 'failed'
      })
    } finally {
      cleanup()
    }
  })

  it('会转发 stderr 日志，并解析没有尾部换行的 stdout JSON', async () => {
    const { directory, cleanup } = createTempWorkspace('screencoder-job-runner-fake-')
    const workerCwd = createFakeWorker(directory, [
      'import sys',
      'print("诊断日志", file=sys.stderr)',
      'print(\'{"type":"stage","stage":"final","status":"done"}\', end="")'
    ])
    const events: WorkerEvent[] = []

    try {
      const code = await runWorker({
        pythonExecutable: resolvePythonExecutable(),
        workerCwd,
        inputPath: 'input.png',
        outputDir: 'output',
        provider: 'mock',
        model: 'mock-model',
        target: 'html',
        pageKind: 'web',
        onEvent: (event) => events.push(event)
      })

      expect(code).toBe(0)
      expect(events).toContainEqual({ type: 'log', stream: 'stderr', line: '诊断日志' })
      expect(events).toContainEqual({ type: 'stage', stage: 'final', status: 'done' })
    } finally {
      cleanup()
    }
  })

  it('stdout 不是合法 Worker 事件时会拒绝，并停止继续分发事件', async () => {
    const { directory, cleanup } = createTempWorkspace('screencoder-job-runner-invalid-')
    const workerCwd = createFakeWorker(directory, [
      'print("[]")',
      'print(\'{"type":"stage","stage":"final","status":"done"}\')'
    ])
    const events: WorkerEvent[] = []

    try {
      await expect(
        runWorker({
          pythonExecutable: resolvePythonExecutable(),
          workerCwd,
          inputPath: 'input.png',
          outputDir: 'output',
          provider: 'mock',
          model: 'mock-model',
          target: 'html',
          pageKind: 'web',
          onEvent: (event) => events.push(event)
        })
      ).rejects.toThrow('Worker stdout 输出的 JSON 事件必须是对象')

      expect(events).toEqual([])
    } finally {
      cleanup()
    }
  })

  it('stdout 不是合法 JSON 时会带上下文拒绝', async () => {
    const { directory, cleanup } = createTempWorkspace('screencoder-job-runner-bad-json-')
    const workerCwd = createFakeWorker(directory, [
      'print("not-json")',
      'print(\'{"type":"stage","stage":"final","status":"done"}\')'
    ])
    const events: WorkerEvent[] = []

    try {
      await expect(
        runWorker({
          pythonExecutable: resolvePythonExecutable(),
          workerCwd,
          inputPath: 'input.png',
          outputDir: 'output',
          provider: 'mock',
          model: 'mock-model',
          target: 'html',
          pageKind: 'web',
          onEvent: (event) => events.push(event)
        })
      ).rejects.toThrow('Worker stdout 不是合法 JSON：not-json')

      expect(events).toEqual([])
    } finally {
      cleanup()
    }
  })
})

function createFakeWorker(directory: string, bodyLines: string[]): string {
  const packageDir = join(directory, 'screencoder_worker')
  mkdirSync(packageDir, { recursive: true })
  writeFileSync(join(packageDir, '__init__.py'), '', 'utf8')
  writeFileSync(join(packageDir, 'cli.py'), `${bodyLines.join('\n')}\n`, 'utf8')
  return directory
}
