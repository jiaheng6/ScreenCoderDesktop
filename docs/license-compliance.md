# 开源合规说明

## 背景

ScreenCoderDesktop 基于 `leigest519/ScreenCoder` 的技术路线做桌面端产品化。上游 ScreenCoder 使用 Apache License 2.0，本仓库也采用 Apache License 2.0，以降低后续集成和二次开发的许可证冲突。

## 当前仓库状态

当前仓库包含 Electron 桌面端、Python Worker 模拟流水线、历史记录、模型配置、日志流、最终预览和目标框架导出器。当前实现未直接复制上游 ScreenCoder 源码。

## Apache License 2.0 合规要求

后续如果复制、修改或分发上游 ScreenCoder 代码，需要遵守以下要求：

1. 保留 Apache License 2.0 许可证全文。
2. 保留上游源码中的版权声明、许可证头和免责声明。
3. 如果上游项目包含 `NOTICE` 文件，分发时需要保留其中适用的声明。
4. 修改上游源码时，在被修改文件或变更记录中做出明确说明。
5. 不暗示上游作者为本项目背书。
6. 对新增代码明确采用本项目许可证。
7. 对第三方依赖建立依赖清单和许可证清单。

## 本项目执行策略

- 仓库根目录保留 `LICENSE`，使用 Apache License 2.0。
- 仓库根目录保留 `NOTICE`，说明与 ScreenCoder 的关系。
- 若后续引入上游源码，放入独立目录，例如 `python/screencoder_core/vendor/screencoder` 或按模块重构后保留文件级来源说明。
- 若重写而非复制上游代码，在对应文档中说明设计参考来源，但不保留不准确的版权声明。
- 新增 Electron、任务管理、历史管理、导出器等代码统一按本仓库 Apache License 2.0 授权。
- 发布打包产物时同时包含 `LICENSE`、`NOTICE` 和第三方依赖许可证清单。
- 任何模型 API Key、密钥引用和本地配置不得提交到仓库。

## 需要特别注意的地方

ScreenCoder 当前项目是研究型脚本，存在固定路径、模型配置写死、中间文件复用等问题。桌面端开发过程中如果直接修改上游文件，应保留变更说明；如果重构为新的 Python Worker，应在文档中标注“基于 ScreenCoder 技术路线重构”。

## 后续待补充

- 第三方依赖许可证清单。
- Electron 打包产物中的许可证归档策略。
- 上游源码引入清单。
- 文件级修改记录。
