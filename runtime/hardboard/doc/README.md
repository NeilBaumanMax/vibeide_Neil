# Hardboard Vibecoding 施工文档

目标：把 vibeide 改造成 ESP-IDF 硬件 vibecoding 专用 IDE。左侧 Agent 负责写代码、解释过程、调用 ESP-IDF 工具；右侧 BrowserView 保留，用于打开文档、网页、HTML 调试页和工作台文件。

## 目录约定

- `runtime/hardboard/esptools/`：ESP-IDF 和命令行工具。当前目标版本为 ESP-IDF 5.4.3。
- `runtime/hardboard/example/`：按芯片和板型保存示例工程，当前先放 ESP32-S3 示例。
- `runtime/hardboard/projects/`：Agent 生成、修改、编译、烧录的工作工程。
- `runtime/hardboard/doc/`：施工文档、硬件引脚、设备记录、调试规范。
- `runtime/hardboard/git-snapshots/`：本地 git 快照和回滚点。
- `runtime/hardboard/firmware/`：可交付 bin/elf/map/烧录说明。
- `runtime/hardboard/logs/`：编译、烧录、串口监视日志。

## ESP-IDF 标准流程

参考 Espressif 官方 ESP-IDF v5.4 Windows 开始工程文档：

1. 确保 ESP-IDF 路径和工程路径没有空格。
2. 从示例复制工程，例如 `examples/get-started/hello_world`。
3. 进入工程目录。
4. 执行 `idf.py set-target esp32s3`。
5. 执行 `idf.py build`。
6. 选择串口，例如 Windows 下的 `COM3`。
7. 执行 `idf.py -p COM3 flash`。

在 vibeide 中，Agent 应通过 MCP 工具完成：

```text
hardboard.env_status
hardboard.devices_list
hardboard.idf_set_target
hardboard.idf_build
hardboard.idf_flash
```

## 当前 MVP 状态

- 前端保留浏览器和工作台。
- 原重放入口改为硬件设备选择、Build、Flash。
- 浏览器录制/工作流底层代码暂时保留，不作为主入口。
- Agent 会自动加载 `espidf_hardboard.md` skill。
- Windows 打包会包含 `runtime/hardboard`，但完整 ESP-IDF 工具链体积较大，需要单独确认最终随包策略。

## 下一步

1. 把本机 ESP-IDF 5.4.3 复制或镜像到 `runtime/hardboard/esptools/esp-idf-v5.4.3/esp-idf`。
2. 排查本机 `idf.py set-target esp32s3` 在 cmake 配置阶段长时间无输出的问题。
3. 补齐 Windows Python、CMake、Ninja、Xtensa/RISC-V toolchain 缓存。
4. 用 Claude Code 真实调用 `hardboard.idf_build` 编译 ESP32-S3 示例工程。
5. 在 Windows 上检测用户已插入的 ESP32-S3 串口并测试烧录。
6. 接入串口 monitor 和日志保存。
