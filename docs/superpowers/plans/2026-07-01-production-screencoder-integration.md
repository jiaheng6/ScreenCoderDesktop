# ScreenCoder 生产化接入实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 ScreenCoderDesktop 从模拟流水线升级为可配置提供商/模型、可测试连接、可运行真实 ScreenCoder 的桌面端。

**Architecture:** Renderer 只负责交互；Main Process 负责本地文件读取、配置持久化、模型连接测试和 Worker 调度；Python Worker 负责真实 ScreenCoder 编排。真实 ScreenCoder 以参数化运行目录执行，所有输入、输出和中间产物隔离到任务目录。

**Tech Stack:** Electron、React、TypeScript、Node SQLite、Python、ScreenCoder、pytest、Vitest。

---

## 文件职责

- `apps/desktop/src/main/ipc.ts`：新增图片预览读取、提供商/模型配置、测试连接 IPC。
- `apps/desktop/src/main/models/*`：拆分提供商和模型存储。
- `apps/desktop/src/renderer/src/components/ModelSettings.tsx`：改为提供商和模型两段配置。
- `apps/desktop/src/renderer/src/components/PreviewPanel.tsx`：使用主进程返回的 `data:` URL 预览图片。
- `python/screencoder_worker/pipeline.py`：替换模拟 HTML 生成，调用真实 ScreenCoder 编排器。
- `python/screencoder_worker/screencoder_runner.py`：新增真实 ScreenCoder 运行目录准备、脚本执行和产物收集。
- `python/tests/*` 与 `apps/desktop/tests/*`：覆盖上述行为。

## 任务

### Task 1: 修复本地图片预览

- [ ] 新增 IPC 测试：读取 PNG 返回 `data:image/png;base64,...`。
- [ ] 新增 IPC 测试：非法扩展名和不存在文件返回中文错误。
- [ ] 实现 `images:read-preview`。
- [ ] Renderer 选择文件后调用 `readImagePreview`，不再使用 `file://`。
- [ ] 运行 `pnpm test && pnpm lint && pnpm build`。
- [ ] 提交 `fix: preview local images through main process`。

### Task 2: 拆分提供商和模型配置

- [ ] 新增 ProviderStore 和 ModelStore 测试。
- [ ] Provider 保存：名称、类型、Base URL、密钥引用。
- [ ] Model 保存：名称、模型 ID、所属 provider、是否视觉模型。
- [ ] Renderer 模型页分成“提供商”和“模型”两个表单。
- [ ] Model 表单通过下拉选择已有 provider。
- [ ] 运行桌面端测试和构建。
- [ ] 提交 `feat: split provider and model configuration`。

### Task 3: 模型连接测试

- [ ] 新增 `models:test-connection` IPC 测试，注入 fake tester。
- [ ] 主进程按 provider/model 组装测试请求。
- [ ] Renderer 增加“测试连接”按钮和结果展示。
- [ ] 对真实密钥仅通过密钥引用或环境变量解析，不在 renderer 返回。
- [ ] 提交 `feat: test model connections`。

### Task 4: 真实 ScreenCoder Worker 编排

- [ ] 新增 Python 测试，使用 fake ScreenCoder core 验证脚本顺序和产物收集。
- [ ] 新增 `screencoder_runner.py`，准备隔离工作目录、复制截图、执行原始脚本。
- [ ] `pipeline.py` 移除模拟 HTML，调用真实 runner。
- [ ] 产物统一输出 `final.html`、`ScreenCoderPage.*` 和 debug 文件。
- [ ] 提交 `feat: run real screencoder pipeline`。

### Task 5: 分发准备和文档

- [ ] 文档说明 `SCREENCODER_CORE_DIR`、Python 依赖和打包策略。
- [ ] LICENSE/NOTICE 增加真实上游代码接入要求。
- [ ] 全量验证：`pnpm lint && pnpm test && pnpm build && pnpm python:test`。
- [ ] Electron dev 烟测。
- [ ] 推送分支。
