# ScreenCoderDesktop

ScreenCoderDesktop 是一个 Electron 桌面端项目，用于把 ScreenCoder 的截图转代码流水线产品化。

当前仓库阶段：生产化接入版。仓库包含 Electron 桌面端、真实 ScreenCoder Python Worker 适配器、SQLite 历史记录、提供商/模型配置、连接测试、实时日志、最终 HTML 预览和目标框架导出器。

## 项目目标

- 支持拖拽或选择上传截图。
- 支持分别配置大模型提供商和模型，API Key 使用 Electron `safeStorage` 加密保存到本机。
- 支持测试模型连接。
- 支持运行真实 ScreenCoder 截图转代码流水线。
- 支持分阶段日志和实时预览。
- 支持导出 HTML、Vue 2、Vue 3、React。
- 支持生成历史管理、重新预览、重新导出。

## 许可证

本项目采用 Apache License 2.0。仓库根目录的 `screencoder-core/` 包含来自 `leigest519/ScreenCoder` 的最小运行版源码副本，该项目同样采用 Apache License 2.0。

详见：

- [LICENSE](./LICENSE)
- [NOTICE](./NOTICE)
- [开源合规说明](./docs/license-compliance.md)

## 文档

- [技术方案](./docs/technical-plan.md)
- [实施说明](./docs/implementation-notes.md)
- [开源合规说明](./docs/license-compliance.md)

## 开发命令

```bash
pnpm install
pnpm --filter @screencoder/desktop dev
pnpm --filter @screencoder/desktop test
pnpm --filter @screencoder/desktop lint
pnpm --filter @screencoder/desktop build
pnpm python:test
```

项目根目录的 `.npmrc` 配置了 Electron 二进制下载镜像，用于避免 `pnpm install` 或 `pnpm dev` 时因默认下载源不可达导致 Electron 安装不完整。

## 运行真实 ScreenCoder

默认 Worker 会优先使用仓库内的 `screencoder-core/`。开发时也可以用环境变量覆盖：

```powershell
$env:SCREENCODER_CORE_DIR="E:\workSpace\ScreenCoder"
pnpm --filter @screencoder/desktop dev
```

运行前需要在“模型”页保存提供商、API Key 和模型，再保存模型配置。OpenCode Go 默认使用 `https://opencode.ai/zen/go/v1` 和 `minimax-m3`。

Python 依赖需要按 `screencoder-core/requirements.txt` 安装到 Worker 使用的 Python 环境中。可通过 `SCREENCODER_PYTHON` 指定解释器路径。
