# ScreenCoderDesktop MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建 ScreenCoderDesktop 的 MVP：Electron 桌面端支持拖拽截图、配置模型、运行 Python 截图转代码流水线、查看实时日志和最终 HTML 预览，并保存历史记录。

**Architecture:** Electron Renderer 只负责界面；Preload 通过 `contextBridge` 暴露白名单 API；Electron Main 负责文件、配置、SQLite、Python Worker 子进程和 IPC。Python Worker 先以可测试的模拟流水线落地，再逐步接入 ScreenCoder 参数化核心。

**Tech Stack:** Electron、Vite、React、TypeScript、SQLite、Python 3.11、pytest、Vitest、Playwright、Apache License 2.0。

---

## 文件结构

本计划会创建以下主要目录和文件：

```text
ScreenCoderDesktop/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  apps/desktop/
    package.json
    electron.vite.config.ts
    src/main/
      index.ts
      ipc.ts
      paths.ts
      jobs/job-store.ts
      jobs/job-runner.ts
      models/model-profile-store.ts
    src/preload/
      index.ts
    src/renderer/
      index.html
      src/App.tsx
      src/components/UploadPanel.tsx
      src/components/ModelSettings.tsx
      src/components/RunPanel.tsx
      src/components/PreviewPanel.tsx
      src/components/HistoryPanel.tsx
      src/styles.css
    tests/
      job-store.test.ts
      model-profile-store.test.ts
  python/
    screencoder_worker/
      __init__.py
      cli.py
      contracts.py
      pipeline.py
      providers/opencode_go.py
      exporters/html.py
      exporters/vue2.py
      exporters/vue3.py
      exporters/react.py
    tests/
      test_cli.py
      test_pipeline.py
      test_exporters.py
    pyproject.toml
  docs/
    implementation-notes.md
```

## Task 1: 建立 Electron + Python 工作区骨架

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/electron.vite.config.ts`
- Create: `apps/desktop/src/main/index.ts`
- Create: `apps/desktop/src/preload/index.ts`
- Create: `apps/desktop/src/renderer/index.html`
- Create: `apps/desktop/src/renderer/src/App.tsx`
- Create: `apps/desktop/src/renderer/src/styles.css`
- Create: `python/pyproject.toml`
- Create: `python/screencoder_worker/__init__.py`

- [ ] **Step 1: 创建根 package 配置**

Create `package.json`:

```json
{
  "name": "screencoder-desktop",
  "version": "0.1.0",
  "private": true,
  "license": "Apache-2.0",
  "scripts": {
    "dev": "pnpm --filter @screencoder/desktop dev",
    "build": "pnpm --filter @screencoder/desktop build",
    "test": "pnpm --filter @screencoder/desktop test",
    "lint": "pnpm --filter @screencoder/desktop lint",
    "python:test": "cd python && python -m pytest"
  },
  "packageManager": "pnpm@9.15.4"
}
```

- [ ] **Step 2: 创建 pnpm 工作区**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
```

- [ ] **Step 3: 创建 TypeScript 基础配置**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 4: 创建桌面端 package 配置**

Create `apps/desktop/package.json`:

```json
{
  "name": "@screencoder/desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "test": "vitest run",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "better-sqlite3": "^11.8.1",
    "electron": "^33.2.1",
    "electron-vite": "^2.3.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "uuid": "^11.0.3"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^22.10.2",
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "@types/uuid": "^10.0.0",
    "typescript": "^5.7.2",
    "vite": "^6.0.5",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 5: 创建 electron-vite 配置**

Create `apps/desktop/electron.vite.config.ts`:

```ts
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/main/index.ts')
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/preload/index.ts')
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()]
  }
})
```

- [ ] **Step 6: 创建 Electron 主进程最小入口**

Create `apps/desktop/src/main/index.ts`:

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 720,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 7: 创建 Preload 最小 API**

Create `apps/desktop/src/preload/index.ts`:

```ts
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('screencoder', {
  appVersion: '0.1.0'
})
```

- [ ] **Step 8: 创建 Renderer 入口**

Create `apps/desktop/src/renderer/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ScreenCoderDesktop</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/App.tsx"></script>
  </body>
</html>
```

Create `apps/desktop/src/renderer/src/App.tsx`:

```tsx
import { createRoot } from 'react-dom/client'
import './styles.css'

function App(): JSX.Element {
  return (
    <main className="app-shell">
      <section className="workspace">
        <h1>ScreenCoderDesktop</h1>
        <p>截图转代码桌面端 MVP</p>
      </section>
    </main>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(<App />)
```

Create `apps/desktop/src/renderer/src/styles.css`:

```css
html,
body,
#root {
  height: 100%;
  margin: 0;
  font-family: Inter, "Segoe UI", "Microsoft YaHei", sans-serif;
  color: #172033;
  background: #f5f7fb;
}

.app-shell {
  min-height: 100%;
  display: flex;
}

.workspace {
  flex: 1;
  padding: 24px;
}
```

- [ ] **Step 9: 创建 Python 包配置**

Create `python/pyproject.toml`:

```toml
[project]
name = "screencoder-worker"
version = "0.1.0"
description = "Python worker for ScreenCoderDesktop"
requires-python = ">=3.11"
dependencies = [
  "beautifulsoup4>=4.12.0",
  "opencv-python-headless>=4.8.0",
  "pillow>=10.0.0",
  "requests>=2.31.0"
]

[project.optional-dependencies]
dev = [
  "pytest>=8.3.0"
]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
```

Create `python/screencoder_worker/__init__.py`:

```py
__all__ = ["__version__"]

__version__ = "0.1.0"
```

- [ ] **Step 10: 安装依赖并验证桌面壳**

Run:

```bash
pnpm install
pnpm lint
pnpm build
```

Expected:

```text
没有 TypeScript 编译错误
electron-vite build 成功生成 dist
```

- [ ] **Step 11: 提交**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json apps python
git commit -m "chore: scaffold desktop and worker workspace"
```

## Task 2: 定义共享契约和 Python Worker 模拟流水线

**Files:**
- Create: `python/screencoder_worker/contracts.py`
- Create: `python/screencoder_worker/pipeline.py`
- Create: `python/screencoder_worker/cli.py`
- Create: `python/tests/test_pipeline.py`
- Create: `python/tests/test_cli.py`

- [ ] **Step 1: 写失败测试，验证 Worker 会创建产物和事件**

Create `python/tests/test_pipeline.py`:

```py
import json
from pathlib import Path

from screencoder_worker.pipeline import run_pipeline
from screencoder_worker.contracts import RunConfig


def test_run_pipeline_creates_html_artifact(tmp_path: Path):
    input_file = tmp_path / "input.png"
    input_file.write_bytes(b"fake image")
    output_dir = tmp_path / "artifacts"

    events = list(run_pipeline(RunConfig(
        input_path=input_file,
        output_dir=output_dir,
        provider="mock",
        model="mock-model",
        target="html",
        page_kind="web"
    )))

    final_html = output_dir / "final.html"
    assert final_html.exists()
    assert "ScreenCoderDesktop Mock Output" in final_html.read_text(encoding="utf-8")
    assert events[0]["stage"] == "prepare"
    assert events[-1]["stage"] == "final"
    assert events[-1]["status"] == "done"
```

Create `python/tests/test_cli.py`:

```py
import json
import subprocess
import sys
from pathlib import Path


def test_cli_run_outputs_jsonl_events(tmp_path: Path):
    input_file = tmp_path / "input.png"
    input_file.write_bytes(b"fake image")
    output_dir = tmp_path / "out"

    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "screencoder_worker.cli",
            "run",
            "--input",
            str(input_file),
            "--output",
            str(output_dir),
            "--provider",
            "mock",
            "--model",
            "mock-model",
            "--target",
            "html",
            "--page-kind",
            "web",
        ],
        cwd=Path(__file__).resolve().parents[1],
        text=True,
        capture_output=True,
        check=True,
    )

    lines = [json.loads(line) for line in result.stdout.strip().splitlines()]
    assert lines[0]["type"] == "stage"
    assert lines[-1]["stage"] == "final"
    assert (output_dir / "final.html").exists()
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cd python
python -m pytest tests/test_pipeline.py tests/test_cli.py -v
```

Expected:

```text
FAIL，原因是 screencoder_worker.pipeline 或 contracts 尚不存在
```

- [ ] **Step 3: 实现 Worker 契约**

Create `python/screencoder_worker/contracts.py`:

```py
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

TargetFramework = Literal["html", "vue2", "vue3", "react"]
PageKind = Literal["web", "mobile", "custom"]


@dataclass(frozen=True)
class RunConfig:
    input_path: Path
    output_dir: Path
    provider: str
    model: str
    target: TargetFramework
    page_kind: PageKind


def stage_event(stage: str, status: str, **extra: object) -> dict[str, object]:
    return {
        "type": "stage",
        "stage": stage,
        "status": status,
        **extra,
    }


def artifact_event(name: str, path: Path) -> dict[str, object]:
    return {
        "type": "artifact",
        "name": name,
        "path": str(path),
    }
```

- [ ] **Step 4: 实现模拟流水线**

Create `python/screencoder_worker/pipeline.py`:

```py
from collections.abc import Iterator
from pathlib import Path

from .contracts import RunConfig, artifact_event, stage_event


def run_pipeline(config: RunConfig) -> Iterator[dict[str, object]]:
    yield stage_event("prepare", "running")
    config.output_dir.mkdir(parents=True, exist_ok=True)
    copied_input = config.output_dir / "input.png"
    copied_input.write_bytes(config.input_path.read_bytes())
    yield artifact_event("input", copied_input)
    yield stage_event("prepare", "done")

    yield stage_event("html_generation", "running")
    final_html = config.output_dir / "final.html"
    final_html.write_text(
        """<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>ScreenCoderDesktop Mock Output</title></head>
<body><h1>ScreenCoderDesktop Mock Output</h1></body>
</html>
""",
        encoding="utf-8",
    )
    yield artifact_event("final", final_html)
    yield stage_event("html_generation", "done")

    yield stage_event("final", "done", output=str(final_html))
```

- [ ] **Step 5: 实现 CLI**

Create `python/screencoder_worker/cli.py`:

```py
import argparse
import json
from pathlib import Path

from .contracts import RunConfig
from .pipeline import run_pipeline


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="screencoder-worker")
    subparsers = parser.add_subparsers(dest="command", required=True)

    run = subparsers.add_parser("run")
    run.add_argument("--input", required=True, type=Path)
    run.add_argument("--output", required=True, type=Path)
    run.add_argument("--provider", required=True)
    run.add_argument("--model", required=True)
    run.add_argument("--target", required=True, choices=["html", "vue2", "vue3", "react"])
    run.add_argument("--page-kind", required=True, choices=["web", "mobile", "custom"])

    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.command == "run":
        config = RunConfig(
            input_path=args.input,
            output_dir=args.output,
            provider=args.provider,
            model=args.model,
            target=args.target,
            page_kind=args.page_kind,
        )
        for event in run_pipeline(config):
            print(json.dumps(event, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 6: 运行 Python 测试确认通过**

Run:

```bash
cd python
python -m pytest -v
```

Expected:

```text
2 passed
```

- [ ] **Step 7: 提交**

```bash
git add python
git commit -m "feat: add worker cli contract"
```

## Task 3: 实现 SQLite 历史和模型配置存储

**Files:**
- Create: `apps/desktop/src/main/paths.ts`
- Create: `apps/desktop/src/main/jobs/job-store.ts`
- Create: `apps/desktop/src/main/models/model-profile-store.ts`
- Create: `apps/desktop/tests/job-store.test.ts`
- Create: `apps/desktop/tests/model-profile-store.test.ts`

- [ ] **Step 1: 写失败测试：任务存储可创建和更新任务**

Create `apps/desktop/tests/job-store.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JobStore } from '../src/main/jobs/job-store'

describe('JobStore', () => {
  it('creates and updates a job', () => {
    const dir = mkdtempSync(join(tmpdir(), 'screencoder-job-store-'))
    const store = new JobStore(join(dir, 'app.db'))

    const job = store.createJob({
      inputPath: join(dir, 'input.png'),
      outputDir: join(dir, 'job-1'),
      provider: 'mock',
      model: 'mock-model',
      targetFramework: 'html',
      pageKind: 'web'
    })

    store.updateStatus(job.id, 'running')
    const found = store.getJob(job.id)

    expect(found?.status).toBe('running')
    expect(store.listJobs()).toHaveLength(1)
  })
})
```

- [ ] **Step 2: 写失败测试：模型配置可保存**

Create `apps/desktop/tests/model-profile-store.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ModelProfileStore } from '../src/main/models/model-profile-store'

describe('ModelProfileStore', () => {
  it('saves and lists model profiles', () => {
    const dir = mkdtempSync(join(tmpdir(), 'screencoder-profile-store-'))
    const store = new ModelProfileStore(join(dir, 'app.db'))

    const profile = store.saveProfile({
      name: 'OpenCode Go',
      provider: 'opencode-go',
      baseUrl: 'https://opencode.ai/zen/go/v1',
      model: 'minimax-m3',
      apiKeyRef: 'secure-store:test'
    })

    expect(profile.id).toBeTruthy()
    expect(store.listProfiles()[0].model).toBe('minimax-m3')
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```bash
pnpm --filter @screencoder/desktop test
```

Expected:

```text
FAIL，原因是 JobStore 和 ModelProfileStore 不存在
```

- [ ] **Step 4: 实现路径工具**

Create `apps/desktop/src/main/paths.ts`:

```ts
import { app } from 'electron'
import { join } from 'node:path'

export function getAppDataDir(): string {
  return join(app.getPath('userData'), 'ScreenCoderDesktop')
}

export function getDatabasePath(): string {
  return join(getAppDataDir(), 'app.db')
}

export function getWorkspaceDir(): string {
  return join(getAppDataDir(), 'workspace')
}
```

- [ ] **Step 5: 实现任务存储**

Create `apps/desktop/src/main/jobs/job-store.ts`:

```ts
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export interface CreateJobInput {
  inputPath: string
  outputDir: string
  provider: string
  model: string
  targetFramework: string
  pageKind: string
}

export interface JobRecord extends CreateJobInput {
  id: string
  status: JobStatus
  createdAt: string
  updatedAt: string
}

export class JobStore {
  private db: Database.Database

  constructor(databasePath: string) {
    this.db = new Database(databasePath)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        input_path TEXT NOT NULL,
        output_dir TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        target_framework TEXT NOT NULL,
        page_kind TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)
  }

  createJob(input: CreateJobInput): JobRecord {
    const now = new Date().toISOString()
    const record: JobRecord = {
      ...input,
      id: randomUUID(),
      status: 'queued',
      createdAt: now,
      updatedAt: now
    }
    this.db.prepare(`
      INSERT INTO jobs (
        id, input_path, output_dir, provider, model, target_framework,
        page_kind, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.inputPath,
      record.outputDir,
      record.provider,
      record.model,
      record.targetFramework,
      record.pageKind,
      record.status,
      record.createdAt,
      record.updatedAt
    )
    return record
  }

  updateStatus(id: string, status: JobStatus): void {
    this.db.prepare('UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, new Date().toISOString(), id)
  }

  getJob(id: string): JobRecord | undefined {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as Record<string, string> | undefined
    return row ? mapJob(row) : undefined
  }

  listJobs(): JobRecord[] {
    const rows = this.db.prepare('SELECT * FROM jobs ORDER BY created_at DESC').all() as Record<string, string>[]
    return rows.map(mapJob)
  }
}

function mapJob(row: Record<string, string>): JobRecord {
  return {
    id: row.id,
    inputPath: row.input_path,
    outputDir: row.output_dir,
    provider: row.provider,
    model: row.model,
    targetFramework: row.target_framework,
    pageKind: row.page_kind,
    status: row.status as JobStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
```

- [ ] **Step 6: 实现模型配置存储**

Create `apps/desktop/src/main/models/model-profile-store.ts`:

```ts
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'

export interface SaveModelProfileInput {
  name: string
  provider: string
  baseUrl: string
  model: string
  apiKeyRef: string
}

export interface ModelProfileRecord extends SaveModelProfileInput {
  id: string
  createdAt: string
  updatedAt: string
}

export class ModelProfileStore {
  private db: Database.Database

  constructor(databasePath: string) {
    this.db = new Database(databasePath)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS model_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        base_url TEXT NOT NULL,
        model TEXT NOT NULL,
        api_key_ref TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)
  }

  saveProfile(input: SaveModelProfileInput): ModelProfileRecord {
    const now = new Date().toISOString()
    const record: ModelProfileRecord = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now
    }
    this.db.prepare(`
      INSERT INTO model_profiles (
        id, name, provider, base_url, model, api_key_ref, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.name,
      record.provider,
      record.baseUrl,
      record.model,
      record.apiKeyRef,
      record.createdAt,
      record.updatedAt
    )
    return record
  }

  listProfiles(): ModelProfileRecord[] {
    const rows = this.db.prepare('SELECT * FROM model_profiles ORDER BY created_at DESC').all() as Record<string, string>[]
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      provider: row.provider,
      baseUrl: row.base_url,
      model: row.model,
      apiKeyRef: row.api_key_ref,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }))
  }
}
```

- [ ] **Step 7: 运行测试确认通过**

Run:

```bash
pnpm --filter @screencoder/desktop test
```

Expected:

```text
2 passed
```

- [ ] **Step 8: 提交**

```bash
git add apps/desktop/src/main apps/desktop/tests
git commit -m "feat: add local job and model stores"
```

## Task 4: Electron Main 调用 Python Worker

**Files:**
- Create: `apps/desktop/src/main/jobs/job-runner.ts`
- Create: `apps/desktop/tests/job-runner.test.ts`
- Modify: `apps/desktop/src/main/index.ts`

- [ ] **Step 1: 写失败测试：JobRunner 能解析 JSONL 事件**

Create `apps/desktop/tests/job-runner.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseJsonLine } from '../src/main/jobs/job-runner'

describe('parseJsonLine', () => {
  it('parses valid json line', () => {
    const event = parseJsonLine('{"type":"stage","stage":"final","status":"done"}')
    expect(event).toEqual({ type: 'stage', stage: 'final', status: 'done' })
  })

  it('returns stderr event for non-json line', () => {
    const event = parseJsonLine('plain log')
    expect(event).toEqual({ type: 'log', level: 'info', message: 'plain log' })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
pnpm --filter @screencoder/desktop test
```

Expected:

```text
FAIL，原因是 job-runner 不存在
```

- [ ] **Step 3: 实现 JobRunner**

Create `apps/desktop/src/main/jobs/job-runner.ts`:

```ts
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

export type WorkerEvent =
  | Record<string, unknown>
  | { type: 'log'; level: 'info' | 'error'; message: string }

export interface RunWorkerInput {
  pythonExecutable: string
  workerCwd: string
  inputPath: string
  outputDir: string
  provider: string
  model: string
  target: string
  pageKind: string
  onEvent: (event: WorkerEvent) => void
}

export function parseJsonLine(line: string): WorkerEvent {
  try {
    return JSON.parse(line) as Record<string, unknown>
  } catch {
    return { type: 'log', level: 'info', message: line }
  }
}

export function runWorker(input: RunWorkerInput): Promise<number> {
  const child = spawn(input.pythonExecutable, [
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
  ], {
    cwd: input.workerCwd,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  createInterface({ input: child.stdout }).on('line', (line) => {
    input.onEvent(parseJsonLine(line))
  })

  createInterface({ input: child.stderr }).on('line', (line) => {
    input.onEvent({ type: 'log', level: 'error', message: line })
  })

  return new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => resolve(code ?? 1))
  })
}
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
pnpm --filter @screencoder/desktop test
```

Expected:

```text
测试通过
```

- [ ] **Step 5: 提交**

```bash
git add apps/desktop/src/main/jobs/job-runner.ts apps/desktop/tests/job-runner.test.ts
git commit -m "feat: add python worker runner"
```

## Task 5: 设计 IPC 白名单 API

**Files:**
- Create: `apps/desktop/src/main/ipc.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/preload/index.ts`

- [ ] **Step 1: 实现 IPC 注册**

Create `apps/desktop/src/main/ipc.ts`:

```ts
import { dialog, ipcMain } from 'electron'
import { mkdirSync, copyFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getWorkspaceDir } from './paths'
import { JobStore } from './jobs/job-store'
import { ModelProfileStore } from './models/model-profile-store'

export function registerIpcHandlers(jobStore: JobStore, profileStore: ModelProfileStore): void {
  ipcMain.handle('dialog:select-image', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('profiles:list', () => profileStore.listProfiles())

  ipcMain.handle('jobs:list', () => jobStore.listJobs())

  ipcMain.handle('jobs:create-from-file', (_event, inputPath: string) => {
    const jobId = randomUUID()
    const outputDir = join(getWorkspaceDir(), 'jobs', jobId)
    mkdirSync(outputDir, { recursive: true })
    const copiedInput = join(outputDir, basename(inputPath))
    copyFileSync(inputPath, copiedInput)
    return jobStore.createJob({
      inputPath: copiedInput,
      outputDir,
      provider: 'mock',
      model: 'mock-model',
      targetFramework: 'html',
      pageKind: 'web'
    })
  })
}
```

- [ ] **Step 2: 在 Main 入口注册 IPC**

Modify `apps/desktop/src/main/index.ts`:

```ts
import { app, BrowserWindow } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { registerIpcHandlers } from './ipc'
import { getAppDataDir, getDatabasePath } from './paths'
import { JobStore } from './jobs/job-store'
import { ModelProfileStore } from './models/model-profile-store'

function createWindow(): void {
  mkdirSync(getAppDataDir(), { recursive: true })
  const dbPath = getDatabasePath()
  registerIpcHandlers(new JobStore(dbPath), new ModelProfileStore(dbPath))

  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 720,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 3: 暴露 Preload API**

Modify `apps/desktop/src/preload/index.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('screencoder', {
  selectImage: () => ipcRenderer.invoke('dialog:select-image'),
  listJobs: () => ipcRenderer.invoke('jobs:list'),
  createJobFromFile: (inputPath: string) => ipcRenderer.invoke('jobs:create-from-file', inputPath),
  listProfiles: () => ipcRenderer.invoke('profiles:list')
})
```

- [ ] **Step 4: 运行类型检查**

Run:

```bash
pnpm --filter @screencoder/desktop lint
```

Expected:

```text
没有 TypeScript 错误
```

- [ ] **Step 5: 提交**

```bash
git add apps/desktop/src/main apps/desktop/src/preload
git commit -m "feat: expose safe desktop ipc api"
```

## Task 6: Renderer 实现上传、配置、运行状态和预览布局

**Files:**
- Create: `apps/desktop/src/renderer/src/global.d.ts`
- Create: `apps/desktop/src/renderer/src/components/UploadPanel.tsx`
- Create: `apps/desktop/src/renderer/src/components/ModelSettings.tsx`
- Create: `apps/desktop/src/renderer/src/components/RunPanel.tsx`
- Create: `apps/desktop/src/renderer/src/components/PreviewPanel.tsx`
- Create: `apps/desktop/src/renderer/src/components/HistoryPanel.tsx`
- Modify: `apps/desktop/src/renderer/src/App.tsx`
- Modify: `apps/desktop/src/renderer/src/styles.css`

- [ ] **Step 1: 创建 Renderer 类型声明**

Create `apps/desktop/src/renderer/src/global.d.ts`:

```ts
export {}

declare global {
  interface Window {
    screencoder: {
      selectImage: () => Promise<string | null>
      listJobs: () => Promise<Array<Record<string, unknown>>>
      createJobFromFile: (inputPath: string) => Promise<Record<string, unknown>>
      listProfiles: () => Promise<Array<Record<string, unknown>>>
    }
  }
}
```

- [ ] **Step 2: 创建上传组件**

Create `apps/desktop/src/renderer/src/components/UploadPanel.tsx`:

```tsx
interface UploadPanelProps {
  selectedPath: string
  onSelected: (path: string) => void
}

export function UploadPanel({ selectedPath, onSelected }: UploadPanelProps): JSX.Element {
  async function selectImage(): Promise<void> {
    const path = await window.screencoder.selectImage()
    if (path) onSelected(path)
  }

  return (
    <section className="panel upload-panel">
      <h2>截图输入</h2>
      <button type="button" onClick={selectImage}>选择截图</button>
      <div className="drop-zone">
        {selectedPath ? selectedPath : '拖入 PNG、JPG、WebP 截图，或点击选择截图'}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: 创建模型配置组件**

Create `apps/desktop/src/renderer/src/components/ModelSettings.tsx`:

```tsx
export function ModelSettings(): JSX.Element {
  return (
    <section className="panel">
      <h2>模型配置</h2>
      <label>
        提供商
        <select defaultValue="opencode-go">
          <option value="opencode-go">OpenCode Go</option>
          <option value="openai-compatible">OpenAI Compatible</option>
          <option value="doubao">Doubao</option>
          <option value="qwen">Qwen</option>
          <option value="gemini">Gemini</option>
        </select>
      </label>
      <label>
        模型
        <input defaultValue="minimax-m3" />
      </label>
      <label>
        Base URL
        <input defaultValue="https://opencode.ai/zen/go/v1" />
      </label>
      <label>
        API Key
        <input type="password" placeholder="保存在系统安全存储中" />
      </label>
    </section>
  )
}
```

- [ ] **Step 4: 创建运行面板**

Create `apps/desktop/src/renderer/src/components/RunPanel.tsx`:

```tsx
interface RunPanelProps {
  selectedPath: string
  onJobCreated: (job: Record<string, unknown>) => void
}

export function RunPanel({ selectedPath, onJobCreated }: RunPanelProps): JSX.Element {
  async function run(): Promise<void> {
    if (!selectedPath) return
    const job = await window.screencoder.createJobFromFile(selectedPath)
    onJobCreated(job)
  }

  return (
    <section className="panel">
      <h2>运行</h2>
      <button type="button" disabled={!selectedPath} onClick={run}>创建任务</button>
      <p>首版先创建任务记录，下一阶段接入 Python Worker 实际运行。</p>
    </section>
  )
}
```

- [ ] **Step 5: 创建预览和历史组件**

Create `apps/desktop/src/renderer/src/components/PreviewPanel.tsx`:

```tsx
interface PreviewPanelProps {
  selectedPath: string
}

export function PreviewPanel({ selectedPath }: PreviewPanelProps): JSX.Element {
  return (
    <section className="panel preview-panel">
      <h2>实时预览</h2>
      {selectedPath ? <img src={`file://${selectedPath}`} alt="输入截图预览" /> : <div className="empty-preview">等待上传截图</div>}
    </section>
  )
}
```

Create `apps/desktop/src/renderer/src/components/HistoryPanel.tsx`:

```tsx
interface HistoryPanelProps {
  jobs: Array<Record<string, unknown>>
}

export function HistoryPanel({ jobs }: HistoryPanelProps): JSX.Element {
  return (
    <aside className="history">
      <h2>历史</h2>
      {jobs.length === 0 ? <p>暂无历史任务</p> : jobs.map((job) => (
        <article key={String(job.id)} className="history-item">
          <strong>{String(job.status)}</strong>
          <span>{String(job.model)}</span>
        </article>
      ))}
    </aside>
  )
}
```

- [ ] **Step 6: 组合 App 页面**

Modify `apps/desktop/src/renderer/src/App.tsx`:

```tsx
import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import { HistoryPanel } from './components/HistoryPanel'
import { ModelSettings } from './components/ModelSettings'
import { PreviewPanel } from './components/PreviewPanel'
import { RunPanel } from './components/RunPanel'
import { UploadPanel } from './components/UploadPanel'
import './styles.css'

function App(): JSX.Element {
  const [selectedPath, setSelectedPath] = useState('')
  const [jobs, setJobs] = useState<Array<Record<string, unknown>>>([])

  async function refreshJobs(): Promise<void> {
    setJobs(await window.screencoder.listJobs())
  }

  useEffect(() => {
    void refreshJobs()
  }, [])

  return (
    <main className="app-shell">
      <HistoryPanel jobs={jobs} />
      <section className="workspace">
        <header className="topbar">
          <h1>ScreenCoderDesktop</h1>
        </header>
        <div className="content-grid">
          <div className="left-column">
            <UploadPanel selectedPath={selectedPath} onSelected={setSelectedPath} />
            <ModelSettings />
            <RunPanel selectedPath={selectedPath} onJobCreated={() => void refreshJobs()} />
          </div>
          <PreviewPanel selectedPath={selectedPath} />
        </div>
      </section>
    </main>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(<App />)
```

- [ ] **Step 7: 更新样式**

Modify `apps/desktop/src/renderer/src/styles.css`:

```css
html,
body,
#root {
  height: 100%;
  margin: 0;
  font-family: Inter, "Segoe UI", "Microsoft YaHei", sans-serif;
  color: #172033;
  background: #f5f7fb;
}

button,
input,
select {
  font: inherit;
}

.app-shell {
  min-height: 100%;
  display: flex;
}

.history {
  width: 260px;
  padding: 16px;
  border-right: 1px solid #dce2ec;
  background: #ffffff;
}

.history-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  border: 1px solid #e3e8f0;
  border-radius: 6px;
  margin-bottom: 8px;
}

.workspace {
  flex: 1;
  padding: 20px;
}

.topbar {
  height: 44px;
  display: flex;
  align-items: center;
}

.topbar h1 {
  font-size: 20px;
  margin: 0;
}

.content-grid {
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  gap: 16px;
}

.left-column {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel {
  background: #ffffff;
  border: 1px solid #dfe5ef;
  border-radius: 8px;
  padding: 14px;
}

.panel h2 {
  font-size: 15px;
  margin: 0 0 12px;
}

.panel label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
  font-size: 13px;
}

.panel input,
.panel select {
  height: 34px;
  border: 1px solid #ccd5e1;
  border-radius: 6px;
  padding: 0 10px;
}

.panel button {
  height: 36px;
  padding: 0 14px;
  border: 0;
  border-radius: 6px;
  color: #ffffff;
  background: #2563eb;
}

.panel button:disabled {
  background: #9aa8bd;
}

.drop-zone {
  min-height: 120px;
  border: 1px dashed #9fb0c8;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  color: #526173;
  text-align: center;
  word-break: break-all;
}

.preview-panel {
  min-height: 620px;
}

.preview-panel img {
  max-width: 100%;
  max-height: 680px;
  object-fit: contain;
  border: 1px solid #e1e7f0;
}

.empty-preview {
  height: 520px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #78879a;
  background: #f8fafc;
  border: 1px solid #e3e8f0;
  border-radius: 8px;
}
```

- [ ] **Step 8: 运行类型检查和构建**

Run:

```bash
pnpm --filter @screencoder/desktop lint
pnpm --filter @screencoder/desktop build
```

Expected:

```text
类型检查通过，Electron/Vite 构建通过
```

- [ ] **Step 9: 提交**

```bash
git add apps/desktop/src/renderer
git commit -m "feat: add mvp renderer workspace"
```

## Task 7: 接入真实任务运行和日志流

**Files:**
- Modify: `apps/desktop/src/main/ipc.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/renderer/src/global.d.ts`
- Modify: `apps/desktop/src/renderer/src/components/RunPanel.tsx`
- Create: `apps/desktop/src/renderer/src/components/LogPanel.tsx`

- [ ] **Step 1: 在 IPC 中增加运行任务通道**

Modify `apps/desktop/src/main/ipc.ts`，保留已有代码并增加：

```ts
import { BrowserWindow } from 'electron'
import { runWorker } from './jobs/job-runner'

ipcMain.handle('jobs:run', async (event, jobId: string) => {
  const job = jobStore.getJob(jobId)
  if (!job) throw new Error(`任务不存在：${jobId}`)

  jobStore.updateStatus(job.id, 'running')
  const webContents = event.sender
  const code = await runWorker({
    pythonExecutable: process.platform === 'win32' ? 'python.exe' : 'python3',
    workerCwd: join(process.cwd(), 'python'),
    inputPath: job.inputPath,
    outputDir: job.outputDir,
    provider: job.provider,
    model: job.model,
    target: job.targetFramework,
    pageKind: job.pageKind,
    onEvent: (workerEvent) => {
      webContents.send('jobs:event', { jobId, event: workerEvent })
    }
  })

  jobStore.updateStatus(job.id, code === 0 ? 'succeeded' : 'failed')
  return jobStore.getJob(job.id)
})
```

如果这段和现有 `registerIpcHandlers` 作用域冲突，把 `ipcMain.handle('jobs:run', ...)` 放入 `registerIpcHandlers` 函数内部，复用函数参数里的 `jobStore`。

- [ ] **Step 2: 更新 Preload API**

Modify `apps/desktop/src/preload/index.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('screencoder', {
  selectImage: () => ipcRenderer.invoke('dialog:select-image'),
  listJobs: () => ipcRenderer.invoke('jobs:list'),
  createJobFromFile: (inputPath: string) => ipcRenderer.invoke('jobs:create-from-file', inputPath),
  runJob: (jobId: string) => ipcRenderer.invoke('jobs:run', jobId),
  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  onJobEvent: (callback: (payload: unknown) => void) => {
    const listener = (_event: unknown, payload: unknown): void => callback(payload)
    ipcRenderer.on('jobs:event', listener)
    return () => ipcRenderer.removeListener('jobs:event', listener)
  }
})
```

- [ ] **Step 3: 更新 Renderer 类型**

Modify `apps/desktop/src/renderer/src/global.d.ts`:

```ts
export {}

declare global {
  interface Window {
    screencoder: {
      selectImage: () => Promise<string | null>
      listJobs: () => Promise<Array<Record<string, unknown>>>
      createJobFromFile: (inputPath: string) => Promise<Record<string, unknown>>
      runJob: (jobId: string) => Promise<Record<string, unknown>>
      listProfiles: () => Promise<Array<Record<string, unknown>>>
      onJobEvent: (callback: (payload: unknown) => void) => () => void
    }
  }
}
```

- [ ] **Step 4: 创建日志面板**

Create `apps/desktop/src/renderer/src/components/LogPanel.tsx`:

```tsx
interface LogPanelProps {
  logs: string[]
}

export function LogPanel({ logs }: LogPanelProps): JSX.Element {
  return (
    <section className="panel log-panel">
      <h2>运行日志</h2>
      <pre>{logs.join('\n')}</pre>
    </section>
  )
}
```

Append to `apps/desktop/src/renderer/src/styles.css`:

```css
.log-panel pre {
  min-height: 160px;
  max-height: 240px;
  overflow: auto;
  margin: 0;
  padding: 10px;
  color: #d9e4f5;
  background: #111827;
  border-radius: 6px;
  font-size: 12px;
}
```

- [ ] **Step 5: 更新运行面板为创建并运行任务**

Modify `apps/desktop/src/renderer/src/components/RunPanel.tsx`:

```tsx
interface RunPanelProps {
  selectedPath: string
  onJobCreated: (job: Record<string, unknown>) => void
  onLog: (line: string) => void
}

export function RunPanel({ selectedPath, onJobCreated, onLog }: RunPanelProps): JSX.Element {
  async function run(): Promise<void> {
    if (!selectedPath) return
    const job = await window.screencoder.createJobFromFile(selectedPath)
    onJobCreated(job)
    onLog(`创建任务：${String(job.id)}`)
    const finished = await window.screencoder.runJob(String(job.id))
    onLog(`任务结束：${String(finished.status)}`)
  }

  return (
    <section className="panel">
      <h2>运行</h2>
      <button type="button" disabled={!selectedPath} onClick={run}>运行流水线</button>
      <p>运行过程中会实时显示 Worker 输出事件。</p>
    </section>
  )
}
```

- [ ] **Step 6: 在 App 中接收日志事件**

Modify `apps/desktop/src/renderer/src/App.tsx`，加入 `LogPanel` 和事件监听：

```tsx
import { LogPanel } from './components/LogPanel'
```

在组件内部加入：

```tsx
const [logs, setLogs] = useState<string[]>([])

useEffect(() => {
  return window.screencoder.onJobEvent((payload) => {
    setLogs((current) => [...current, JSON.stringify(payload)])
  })
}, [])
```

把 `RunPanel` 调用改为：

```tsx
<RunPanel
  selectedPath={selectedPath}
  onJobCreated={() => void refreshJobs()}
  onLog={(line) => setLogs((current) => [...current, line])}
/>
<LogPanel logs={logs} />
```

- [ ] **Step 7: 运行构建**

Run:

```bash
pnpm --filter @screencoder/desktop lint
pnpm --filter @screencoder/desktop build
```

Expected:

```text
构建通过
```

- [ ] **Step 8: 手动验证**

Run:

```bash
pnpm dev
```

Expected:

```text
桌面端打开后可以选择图片、创建任务、看到日志流，并在历史列表看到任务状态变化。
```

- [ ] **Step 9: 提交**

```bash
git add apps/desktop
git commit -m "feat: run worker jobs from desktop"
```

## Task 8: 导出器和最终预览闭环

**Files:**
- Create: `python/screencoder_worker/exporters/html.py`
- Create: `python/screencoder_worker/exporters/vue2.py`
- Create: `python/screencoder_worker/exporters/vue3.py`
- Create: `python/screencoder_worker/exporters/react.py`
- Modify: `python/screencoder_worker/pipeline.py`
- Modify: `python/tests/test_exporters.py`

- [ ] **Step 1: 写导出器测试**

Create `python/tests/test_exporters.py`:

```py
from screencoder_worker.exporters.html import export_html
from screencoder_worker.exporters.react import export_react
from screencoder_worker.exporters.vue2 import export_vue2
from screencoder_worker.exporters.vue3 import export_vue3


def test_export_html_returns_original_html():
    assert export_html("<main>页面</main>") == "<main>页面</main>"


def test_export_vue3_wraps_template():
    result = export_vue3("<main>页面</main>")
    assert "<template>" in result
    assert "<main>页面</main>" in result
    assert "<script setup" in result


def test_export_vue2_wraps_template():
    result = export_vue2("<main>页面</main>")
    assert "export default" in result
    assert "name: 'ScreenCoderPage'" in result


def test_export_react_wraps_component():
    result = export_react("<main>页面</main>")
    assert "export function ScreenCoderPage" in result
    assert "dangerouslySetInnerHTML" in result
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cd python
python -m pytest tests/test_exporters.py -v
```

Expected:

```text
FAIL，原因是 exporters 模块不存在
```

- [ ] **Step 3: 实现 HTML 导出器**

Create `python/screencoder_worker/exporters/html.py`:

```py
def export_html(html: str) -> str:
    return html
```

- [ ] **Step 4: 实现 Vue 3 导出器**

Create `python/screencoder_worker/exporters/vue3.py`:

```py
def export_vue3(html: str) -> str:
    return f"""<template>
{html}
</template>

<script setup lang="ts">
</script>

<style scoped>
</style>
"""
```

- [ ] **Step 5: 实现 Vue 2 导出器**

Create `python/screencoder_worker/exporters/vue2.py`:

```py
def export_vue2(html: str) -> str:
    return f"""<template>
{html}
</template>

<script>
export default {{
  name: 'ScreenCoderPage'
}}
</script>

<style scoped>
</style>
"""
```

- [ ] **Step 6: 实现 React 导出器**

Create `python/screencoder_worker/exporters/react.py`:

```py
def export_react(html: str) -> str:
    escaped = html.replace("`", "\\`").replace("${", "\\${")
    return f"""export function ScreenCoderPage() {{
  const html = `{escaped}`;
  return <div dangerouslySetInnerHTML={{{{ __html: html }}}} />;
}}
"""
```

- [ ] **Step 7: 修改 pipeline 写出目标技术栈产物**

Modify `python/screencoder_worker/pipeline.py`，在 `final_html.write_text(...)` 后加入：

```py
    html = final_html.read_text(encoding="utf-8")
    if config.target == "vue3":
        from .exporters.vue3 import export_vue3
        export_path = config.output_dir / "ScreenCoderPage.vue"
        export_path.write_text(export_vue3(html), encoding="utf-8")
        yield artifact_event("source", export_path)
    elif config.target == "vue2":
        from .exporters.vue2 import export_vue2
        export_path = config.output_dir / "ScreenCoderPage.vue"
        export_path.write_text(export_vue2(html), encoding="utf-8")
        yield artifact_event("source", export_path)
    elif config.target == "react":
        from .exporters.react import export_react
        export_path = config.output_dir / "ScreenCoderPage.tsx"
        export_path.write_text(export_react(html), encoding="utf-8")
        yield artifact_event("source", export_path)
```

- [ ] **Step 8: 运行 Python 测试**

Run:

```bash
cd python
python -m pytest -v
```

Expected:

```text
全部 Python 测试通过
```

- [ ] **Step 9: 提交**

```bash
git add python
git commit -m "feat: add framework exporters"
```

## Task 9: 开源合规和发布准备

**Files:**
- Modify: `README.md`
- Modify: `NOTICE`
- Modify: `docs/license-compliance.md`
- Create: `docs/implementation-notes.md`

- [ ] **Step 1: 创建实施说明文档**

Create `docs/implementation-notes.md`:

```md
# 实施说明

## 当前阶段

当前实现是 ScreenCoderDesktop MVP，包含 Electron 桌面端、Python Worker 模拟流水线、历史记录、模型配置结构、日志流和导出器。

## 与 ScreenCoder 的关系

当前代码未直接复制 ScreenCoder 上游源码。Python Worker 的设计为后续接入 ScreenCoder 参数化流水线预留接口。

## 后续接入 ScreenCoder 的要求

1. 引入上游代码时保留 Apache License 2.0 声明。
2. 修改上游文件时保留来源说明和修改记录。
3. 把固定路径改为任务目录参数。
4. 把中间产物隔离到 `workspace/jobs/{jobId}/artifacts`。
5. 所有模型密钥通过安全存储或环境变量传入，不提交到仓库。
```

- [ ] **Step 2: 更新 README 增加开发命令**

Modify `README.md`，追加：

```md
## 开发命令

```bash
pnpm install
pnpm dev
pnpm test
pnpm build
pnpm python:test
```

## MVP 状态

MVP 以 Electron 桌面端和 Python Worker 分离的方式实现。当前阶段先用模拟 Worker 打通任务链路，后续再接入 ScreenCoder 参数化流水线。
```
```

- [ ] **Step 3: 更新 NOTICE**

Modify `NOTICE`，追加：

```text

ScreenCoderDesktop source code in this repository is authored for this project unless a file header states otherwise.
Future copied or modified ScreenCoder files must retain their original Apache License 2.0 notices.
```

- [ ] **Step 4: 运行全量验证**

Run:

```bash
pnpm lint
pnpm test
pnpm build
pnpm python:test
```

Expected:

```text
TypeScript 检查通过
Vitest 测试通过
Electron 构建通过
pytest 测试通过
```

- [ ] **Step 5: 提交**

```bash
git add README.md NOTICE docs
git commit -m "docs: document mvp implementation and compliance"
```

## Task 10: MVP 最终验收

**Files:**
- No source files should be modified in this task unless a verification failure identifies a specific bug.

- [ ] **Step 1: 从干净状态安装依赖**

Run:

```bash
git status --short
pnpm install
```

Expected:

```text
git status --short 没有未提交源码改动
pnpm install 成功
```

- [ ] **Step 2: 运行全部测试**

Run:

```bash
pnpm test
pnpm python:test
```

Expected:

```text
桌面端测试通过
Python Worker 测试通过
```

- [ ] **Step 3: 运行构建**

Run:

```bash
pnpm build
```

Expected:

```text
Electron 构建成功
```

- [ ] **Step 4: 手动运行桌面端**

Run:

```bash
pnpm dev
```

Manual verification:

```text
应用窗口打开
可以选择截图
可以创建任务
可以运行 Worker
日志面板显示 JSONL 事件
历史列表显示任务
预览区域显示输入截图
```

- [ ] **Step 5: 推送**

```bash
git status --short
git push origin main
```

Expected:

```text
工作区干净
main 推送成功
```

## 自检结果

- 技术方案覆盖：上传、模型配置、流水线、实时预览、目标导出、历史管理、Electron 安全、Apache 合规均有对应任务。
- 暂缓内容：真实 ScreenCoder 参数化接入、手动框选、批量任务、打包安装器不进入 MVP，以降低首版风险。
- 关键风险：Python Worker 当前先用模拟流水线打通桌面链路，后续必须单独制定 ScreenCoder 核心接入计划。
