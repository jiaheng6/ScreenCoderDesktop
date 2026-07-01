import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const candidates = process.env.SCREENCODER_PYTHON
  ? [[process.env.SCREENCODER_PYTHON, ['-m', 'pytest']]]
  : process.platform === 'win32'
    ? [
        ['py', ['-3', '-m', 'pytest']],
        ['python', ['-m', 'pytest']]
      ]
    : [
        ['python3', ['-m', 'pytest']],
        ['python', ['-m', 'pytest']]
      ]

let lastError = null

for (const [command, args] of candidates) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })

  if (result.error) {
    lastError = result.error
    continue
  }

  process.exit(result.status ?? 1)
}

console.error(`没有找到可用的 Python 解释器：${lastError?.message ?? '未知错误'}`)
process.exit(1)
