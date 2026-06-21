# Hardboard IDE 施工文档

## 目标

把 vibeide 从网页采集/自动化原型，重构为硬件 vibecoding 专用 IDE：

- 左侧 Agent 对话负责写 ESP-IDF 代码、解释步骤、调用工具。
- 右侧 BrowserView 保留，用于打开乐鑫文档、GitHub、工作台文件和调试页面。
- 前端原重放区改成设备选择、Build、Flash。
- 原浏览器、录制、workflow、storage 等 MVP 能力保留，不删除。
- Windows 打包后尽量免系统环境变量配置，Claude Code 可直接调用随包 ESP-IDF。

## 当前落地结构

```text
runtime/hardboard/
  esptools/        ESP-IDF 5.4.3 及工具链目标位置
  example/         ESP32-S3 示例工程
  projects/        Agent 修改和编译的工作工程
  doc/             Agent 可读施工文档和设备记录
  git-snapshots/   本地回滚快照
  firmware/        bin/elf/map 等产物
  logs/            编译/烧录/串口日志
```

## ESP-IDF 版本

- 当前按用户确认使用本机版本：ESP-IDF 5.4.3。
- 乐鑫 v5.4 / v5.4.4 文档作为流程参考。
- 默认 target：`esp32s3`。

## 官方流程映射

参考乐鑫 Windows 开始工程文档：

1. ESP-IDF 路径和工程路径不要包含空格。
2. 示例可从 `%IDF_PATH%\examples\get-started\hello_world` 复制。
3. 连接开发板后确认串口，Windows 通常为 `COMx`。
4. 进入工程目录后执行 `idf.py set-target esp32s3`。
5. 执行 `idf.py build`。
6. 执行 `idf.py -p COMx flash`。

在 vibeide 中对应为：

```text
hardboard.env_status
hardboard.devices_list
hardboard.idf_set_target
hardboard.idf_build
hardboard.idf_flash
```

## 当前已做

- 新增 `runtime/src/hardboard.ts`。
- 新增 MCP tools：`hardboard.env_status`、`hardboard.devices_list`、`hardboard.idf_set_target`、`hardboard.idf_build`、`hardboard.idf_flash`。
- 新增 `agent/skills/espidf_hardboard.md`。
- 前端输入框提示改为硬件任务。
- 右侧原重放操作区改为设备选择、Build、Flash。
- 工作台增加硬件文档、硬件示例、硬件工程入口。
- 打包配置包含 `runtime/hardboard`。
- 已复制 ESP32-S3 示例：blink、hello_world、openlive2d_atri。
- 已新增 `npm --prefix runtime run smoke:hardboard`，用于验证 Claude/MCP 同路径下的 set-target/build 能否实际跑通。

## 仍需完成

- 把完整 ESP-IDF 5.4.3 和 Windows 工具链复制到 `runtime/hardboard/esptools/esp-idf-v5.4.3`。
- 继续排查本机 ESP-IDF 5.4.3 cmake 配置卡住问题；当前已用 `--no-constraints` 建好 `idf5.4_py3.13_env`，`smoke:hardboard` 能找到 Python venv，但 `idf.py set-target esp32s3` 在 cmake 配置阶段长时间无输出。
- 验证 Windows 打包版中 `hardboard.idf_build` 可由 Claude Code 实际调用成功。
- 增加 monitor / clean / erase_flash 工具。
- 增加工程快照按钮或 Agent 命令。
- 根据真实开发板补齐 `runtime/hardboard/doc/device-profile-esp32s3.md`。
