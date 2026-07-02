# 开源合规说明

## 背景

ScreenCoderDesktop 基于 `leigest519/ScreenCoder` 做桌面端产品化。上游 ScreenCoder 使用 Apache License 2.0，本仓库也采用 Apache License 2.0，以降低后续集成和二次开发的许可证冲突。

## 当前仓库状态

当前仓库包含 Electron 桌面端、Python Worker、真实 ScreenCoder core 适配器、历史记录、提供商/模型配置、连接测试、日志流、最终预览和目标框架导出器。

仓库根目录 `screencoder-core/` 包含从上游 ScreenCoder 复制的最小运行版源码：

- 根目录运行脚本：`main.py`、`block_parsor.py`、`html_generator.py`、`image_box_detection.py`、`mapping.py`、`image_replacer.py`、`utils.py`
- 上游 `UIED/` 运行目录
- 上游 `LICENSE`、`README.md`、`requirements.txt`

未复制训练目录、示例压缩包、虚拟环境、历史输出、缓存和本项目无关的桌面端目录。

## Apache License 2.0 合规要求

复制、修改或分发上游 ScreenCoder 代码，需要遵守以下要求：

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
- 上游源码放入独立目录 `screencoder-core/`。
- Worker 对上游硬编码模型配置的改写发生在任务运行副本 `workspace/jobs/{jobId}/screencoder-work/` 中，不直接修改仓库内的上游副本。
- 新增 Electron、任务管理、历史管理、导出器等代码统一按本仓库 Apache License 2.0 授权。
- 发布打包产物时同时包含 `LICENSE`、`NOTICE` 和第三方依赖许可证清单。
- 任何模型 API Key、密钥引用和本地配置不得提交到仓库。

## 需要特别注意的地方

ScreenCoder 当前项目是研究型脚本，存在固定路径、模型配置写死、中间文件复用等问题。桌面端 Worker 通过任务副本隔离这些运行时状态，避免多个历史任务互相覆盖。

## 后续待补充

- 第三方依赖许可证清单。
- Electron 打包产物中的许可证归档策略。
- 上游版本号或提交哈希记录。
