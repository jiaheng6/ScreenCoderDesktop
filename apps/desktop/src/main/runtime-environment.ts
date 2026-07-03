import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface RuntimeDependency {
  moduleName: string
  packageName: string
}

export interface RuntimeEnvironmentCheckInput {
  pythonExecutable: string
  managedPythonDir: string
  managedPythonExecutable: string
  workerCwd: string
  requirementsPath: string
}

export interface RuntimeEnvironmentStatus {
  ok: boolean
  pythonExecutable: string
  managedPythonExecutable: string
  managedPythonExists: boolean
  workerCwd: string
  requirementsPath: string
  missingDependencies: RuntimeDependency[]
  playwrightChromiumReady: boolean | null
  canInstall: boolean
  message: string
}

export interface RuntimeEnvironmentInstallInput {
  basePythonExecutable: string
  managedPythonDir: string
  managedPythonExecutable: string
  workerCwd: string
  requirementsPath: string
}

export interface RuntimeEnvironmentInstallResult {
  ok: boolean
  pythonExecutable: string
  log: string
  error?: string
}

interface PythonEnvironmentCheckResult {
  missingModules: string[]
  playwrightChromiumReady: boolean | null
}

const runtimeDependencies: RuntimeDependency[] = [
  { moduleName: 'cv2', packageName: 'opencv-python-headless' },
  { moduleName: 'PIL', packageName: 'Pillow' },
  { moduleName: 'bs4', packageName: 'beautifulsoup4' },
  { moduleName: 'requests', packageName: 'requests' },
  { moduleName: 'numpy', packageName: 'numpy' },
  { moduleName: 'playwright', packageName: 'playwright' },
  { moduleName: 'sklearn', packageName: 'scikit-learn' },
  { moduleName: 'scipy', packageName: 'scipy' },
  { moduleName: 'pandas', packageName: 'pandas' }
]

export function resolveManagedPythonExecutable(managedPythonDir: string): string {
  return process.platform === 'win32'
    ? join(managedPythonDir, 'Scripts', 'python.exe')
    : join(managedPythonDir, 'bin', 'python')
}

export function resolveRuntimeRequirementsPath(workerCwd: string): string {
  return join(workerCwd, 'requirements-runtime.txt')
}

export function checkRuntimeEnvironment(
  input: RuntimeEnvironmentCheckInput
): RuntimeEnvironmentStatus {
  const managedPythonExists = existsSync(input.managedPythonExecutable)

  if (!existsSync(input.requirementsPath)) {
    return {
      ok: false,
      pythonExecutable: input.pythonExecutable,
      managedPythonExecutable: input.managedPythonExecutable,
      managedPythonExists,
      workerCwd: input.workerCwd,
      requirementsPath: input.requirementsPath,
      missingDependencies: runtimeDependencies,
      playwrightChromiumReady: null,
      canInstall: false,
      message: `运行依赖清单不存在：${input.requirementsPath}`
    }
  }

  const result = spawnSync(input.pythonExecutable, ['-c', createEnvironmentCheckScript()], {
    encoding: 'utf8',
    windowsHide: true
  })

  if (result.error || result.status !== 0 || !result.stdout.trim()) {
    return {
      ok: false,
      pythonExecutable: input.pythonExecutable,
      managedPythonExecutable: input.managedPythonExecutable,
      managedPythonExists,
      workerCwd: input.workerCwd,
      requirementsPath: input.requirementsPath,
      missingDependencies: runtimeDependencies,
      playwrightChromiumReady: null,
      canInstall: !result.error,
      message: result.error
        ? `无法运行 Python：${result.error.message}`
        : `Python 环境检测失败：${result.stderr.trim() || '没有返回检测结果'}`
    }
  }

  const parsed = parsePythonEnvironmentCheck(result.stdout)
  const missingModuleNames = new Set(parsed.missingModules)
  const missingDependencies = runtimeDependencies.filter((dependency) =>
    missingModuleNames.has(dependency.moduleName)
  )
  const playwrightChromiumReady = parsed.playwrightChromiumReady
  const ok = missingDependencies.length === 0 && playwrightChromiumReady !== false

  return {
    ok,
    pythonExecutable: input.pythonExecutable,
    managedPythonExecutable: input.managedPythonExecutable,
    managedPythonExists,
    workerCwd: input.workerCwd,
    requirementsPath: input.requirementsPath,
    missingDependencies,
    playwrightChromiumReady,
    canInstall: true,
    message: ok
      ? `运行环境可用：${input.pythonExecutable}`
      : buildMissingEnvironmentMessage(missingDependencies, playwrightChromiumReady)
  }
}

export async function installRuntimeEnvironment(
  input: RuntimeEnvironmentInstallInput
): Promise<RuntimeEnvironmentInstallResult> {
  const logParts: string[] = []

  try {
    mkdirSync(dirname(input.managedPythonDir), { recursive: true })

    if (!existsSync(input.managedPythonExecutable)) {
      logParts.push(`创建托管 Python 环境：${input.managedPythonDir}`)
      await runCommand(input.basePythonExecutable, ['-m', 'venv', input.managedPythonDir], logParts)
    }

    logParts.push('升级 pip、setuptools 和 wheel')
    await runCommand(
      input.managedPythonExecutable,
      ['-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', 'wheel'],
      logParts
    )

    logParts.push(`安装 ScreenCoder 运行依赖：${input.requirementsPath}`)
    await runCommand(
      input.managedPythonExecutable,
      [
        '-m',
        'pip',
        'install',
        '--prefer-binary',
        '--only-binary=:all:',
        '-r',
        input.requirementsPath
      ],
      logParts
    )

    logParts.push('安装 Playwright Chromium')
    await runCommand(input.managedPythonExecutable, ['-m', 'playwright', 'install', 'chromium'], logParts)

    logParts.push(`运行环境安装完成：${input.managedPythonExecutable}`)
    return {
      ok: true,
      pythonExecutable: input.managedPythonExecutable,
      log: logParts.join('\n')
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '运行环境安装失败'
    logParts.push(errorMessage)
    return {
      ok: false,
      pythonExecutable: input.managedPythonExecutable,
      log: logParts.join('\n'),
      error: errorMessage
    }
  }
}

function parsePythonEnvironmentCheck(stdout: string): PythonEnvironmentCheckResult {
  try {
    const parsed = JSON.parse(stdout.trim()) as Partial<PythonEnvironmentCheckResult>
    return {
      missingModules: Array.isArray(parsed.missingModules)
        ? parsed.missingModules.filter((moduleName): moduleName is string => typeof moduleName === 'string')
        : runtimeDependencies.map((dependency) => dependency.moduleName),
      playwrightChromiumReady:
        typeof parsed.playwrightChromiumReady === 'boolean' ? parsed.playwrightChromiumReady : null
    }
  } catch {
    return {
      missingModules: runtimeDependencies.map((dependency) => dependency.moduleName),
      playwrightChromiumReady: null
    }
  }
}

function createEnvironmentCheckScript(): string {
  const dependencyMap = Object.fromEntries(
    runtimeDependencies.map((dependency) => [dependency.moduleName, dependency.packageName])
  )

  return `
import importlib.util
import json
from pathlib import Path

required = ${JSON.stringify(dependencyMap)}
missing = [module_name for module_name in required if importlib.util.find_spec(module_name) is None]
chromium_ready = None

if "playwright" not in missing:
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as playwright:
            chromium_path = playwright.chromium.executable_path
        chromium_ready = Path(chromium_path).exists()
    except Exception:
        chromium_ready = False

print(json.dumps({
    "missingModules": missing,
    "playwrightChromiumReady": chromium_ready,
}, ensure_ascii=False))
`.trim()
}

function buildMissingEnvironmentMessage(
  missingDependencies: RuntimeDependency[],
  playwrightChromiumReady: boolean | null
): string {
  const messages: string[] = []

  if (missingDependencies.length > 0) {
    messages.push(
      `缺少 ${missingDependencies.length} 个运行依赖：${missingDependencies
        .map((dependency) => dependency.moduleName)
        .join('、')}`
    )
  }

  if (playwrightChromiumReady === false) {
    messages.push('Playwright Chromium 未安装或不可访问')
  }

  return messages.join('；') || '运行环境不可用'
}

function runCommand(command: string, args: string[], logParts: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: {
        ...process.env,
        PIP_DISABLE_PIP_VERSION_CHECK: '1',
        PYTHONIOENCODING: 'utf-8'
      },
      windowsHide: true
    })
    const commandLine = [command, ...args].join(' ')

    logParts.push(`> ${commandLine}`)

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8').trim()
      if (text) {
        logParts.push(text)
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8').trim()
      if (text) {
        logParts.push(text)
      }
    })
    child.on('error', (error) => {
      reject(new Error(`${commandLine} 启动失败：${error.message}`))
    })
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${commandLine} 执行失败，退出码：${code ?? 1}`))
    })
  })
}
