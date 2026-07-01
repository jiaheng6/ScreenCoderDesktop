# 实施说明

## 当前阶段

当前实现是 ScreenCoderDesktop 真实接入版，包含 Electron 桌面端、Python Worker、真实 ScreenCoder core 适配器、SQLite 历史记录、提供商/模型配置、连接测试、日志流、最终 HTML 预览和目标框架导出器。

## 与 ScreenCoder 的关系

仓库根目录 `screencoder-core/` 包含来自 `leigest519/ScreenCoder` 的最小运行版源码副本。Worker 每次运行会把该 core 复制到任务目录 `screencoder-work/`，把上传截图放入 `data/input/test1.png`，并在任务副本里注入模型名、Base URL 和 API Key 环境变量。

## ScreenCoder 接入策略

1. 保留上游 Apache License 2.0 文件。
2. 不在仓库中改写 API Key 或本地路径。
3. 对上游硬编码模型配置的处理发生在每个任务的运行副本中。
4. 中间产物隔离到 `workspace/jobs/{jobId}`。
5. API Key 通过 Electron `safeStorage` 加密保存，运行时只在主进程和 Worker 环境变量中出现。
6. 分发时同时包含 `LICENSE`、`NOTICE`、`screencoder-core/LICENSE` 和依赖许可证清单。

## 当前功能边界

- 支持选择或拖入截图。
- 支持配置提供商、Base URL、API Key，并配置绑定到提供商的模型。
- 支持测试模型连接。
- 支持选择 HTML、Vue 2、Vue 3、React 目标输出。
- 支持运行真实 ScreenCoder Python Worker，并实时显示 JSONL 事件日志。
- 支持生成 `final.html`，并按目标框架生成源码产物。
- 支持历史任务列表和重新打开最终预览。

当前 Worker 已去除模拟 HTML 生成，最终 HTML 来自 ScreenCoder core 生成的 `data/output/test1_layout_final.html` 或 `data/output/test1_layout.html`。
