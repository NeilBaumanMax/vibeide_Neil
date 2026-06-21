# ESP-IDF Hardboard Vibecoding

本 skill 用于 ESP32 / ESP32-S3 / ESP32-C3 硬件开发、编译、烧录、串口设备选择和本地工程维护。

## 默认环境

- 默认 ESP-IDF 版本：5.4.3。
- 默认硬件资源根目录：`runtime/hardboard`。
- 示例工程目录：`runtime/hardboard/example`。
- Agent 可工作的工程目录：`runtime/hardboard/projects`。
- 施工文档和硬件记录：`runtime/hardboard/doc`。
- 本地回滚快照：`runtime/hardboard/git-snapshots`。

## 标准调用顺序

1. 先调用 `hardboard.env_status`，确认 `idfPath`、`idfPy`、`python` 是否存在。
2. 如果需要烧录，调用 `hardboard.devices_list`，让用户确认串口；Windows 串口通常是 `COM3`、`COM8` 这种格式。
3. 新工程或目标不确定时，先调用 `hardboard.idf_set_target`，默认 target 为 `esp32s3`。
4. 编译调用 `hardboard.idf_build`。
5. 烧录调用 `hardboard.idf_flash`，必须传入 `port`。

## ESP-IDF 官方流程约束

参考 Espressif ESP-IDF v5.4 Windows start project 文档：

- ESP-IDF 路径和工程路径不要包含空格。
- 可从 `%IDF_PATH%\examples\get-started\hello_world` 复制工程作为起点。
- 进入工程目录后先执行 `idf.py set-target esp32s3`，再执行 build/flash。
- `menuconfig` 只在需要改配置时使用；hello_world 默认配置可跳过。

## Agent 行为规则

- 不要用系统外部 IDE 替代 MCP hardboard 工具。
- 不要假装烧录成功；必须展示 `hardboard.idf_flash` 的结果。
- 编译失败时，先读错误摘要，定位 `CMakeLists.txt`、`sdkconfig.defaults`、`main/*` 或组件依赖，再修改。
- 修改工程前，优先在 `runtime/hardboard/projects/<project-name>` 下创建或复制工程。
- 大改前在 `runtime/hardboard/git-snapshots` 建本地 git 快照或说明当前状态。
- 如果用户只要求写代码，不要烧录；如果用户要求“编译测试”，必须实际调用 `hardboard.idf_build`。
