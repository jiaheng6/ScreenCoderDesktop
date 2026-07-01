# ScreenCoderDesktop

ScreenCoderDesktop 是一个 Electron 桌面端项目，用于把 ScreenCoder 的截图转代码流水线产品化。

当前仓库阶段：MVP 已实现。仓库包含 Electron 桌面端、Python Worker 模拟流水线、SQLite 历史记录、模型配置、实时日志、最终 HTML 预览和目标框架导出器。当前阶段未直接复制上游 ScreenCoder 源码。

## 项目目标

- 支持拖拽或选择上传截图。
- 支持配置大模型提供商、Base URL、API Key 和模型名。
- 支持运行截图转代码流水线。
- 支持分阶段日志和实时预览。
- 支持导出 HTML、Vue 2、Vue 3、React。
- 支持生成历史管理、重新预览、重新导出。

## 许可证

本项目采用 Apache License 2.0。原型方案参考并计划兼容集成 `leigest519/ScreenCoder`，该项目同样采用 Apache License 2.0。

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

## MVP 状态

改造成 Electron 桌面端可行，但不建议直接把现有 Python 脚本嵌入界面调用。应先把 ScreenCoder 流水线改造成参数化 Python Worker，再由 Electron 主进程调度任务，渲染进程只负责交互、日志、预览和历史管理。

当前 MVP 已按该架构打通端到端链路：桌面端可上传截图、配置模型信息、启动 Worker、查看日志、生成目标框架产物、预览最终 HTML，并从历史任务重新打开结果。
