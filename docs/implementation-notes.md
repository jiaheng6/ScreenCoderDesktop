# 实施说明

## 当前阶段

当前实现是 ScreenCoderDesktop MVP，包含 Electron 桌面端、Python Worker 模拟流水线、SQLite 历史记录、模型配置结构、日志流、最终 HTML 预览和目标框架导出器。

## 与 ScreenCoder 的关系

当前代码未直接复制 `leigest519/ScreenCoder` 上游源码。Python Worker 的设计为后续接入 ScreenCoder 参数化流水线预留接口，同时保持桌面端任务调度、日志转发、预览和历史管理与具体模型实现解耦。

## 后续接入 ScreenCoder 的要求

1. 引入上游代码时保留 Apache License 2.0 声明。
2. 修改上游文件时保留来源说明和修改记录。
3. 把固定路径、全局中间文件和硬编码模型配置改为任务目录参数。
4. 把中间产物隔离到 `workspace/jobs/{jobId}`。
5. 所有模型密钥通过安全存储或环境变量传入，不提交到仓库。
6. 上游源码和本项目新增代码混合分发时，同时包含 `LICENSE`、`NOTICE` 和必要的第三方依赖许可证清单。

## MVP 功能边界

- 支持选择或拖入截图。
- 支持配置模型提供商、Base URL、模型名和密钥引用。
- 支持选择 HTML、Vue 2、Vue 3、React 目标输出。
- 支持运行 Python Worker，并实时显示 JSONL 事件日志。
- 支持生成 `final.html`，并按目标框架生成源码产物。
- 支持历史任务列表和重新打开最终预览。

当前 Worker 仍是模拟实现，生成结果用于验证桌面端产品闭环。真实 ScreenCoder 流水线接入应作为后续独立任务处理。
