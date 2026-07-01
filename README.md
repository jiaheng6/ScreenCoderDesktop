# ScreenCoderDesktop

ScreenCoderDesktop 是一个计划中的 Electron 桌面端项目，用于把 ScreenCoder 的截图转代码流水线产品化。

当前仓库阶段：技术方案与合规准备。暂未引入上游 ScreenCoder 源码，也暂未提交 Electron 实现代码。

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
- [开源合规说明](./docs/license-compliance.md)

## 当前结论

改造成 Electron 桌面端可行，但不建议直接把现有 Python 脚本嵌入界面调用。应先把 ScreenCoder 流水线改造成参数化 Python Worker，再由 Electron 主进程调度任务，渲染进程只负责交互、日志、预览和历史管理。
