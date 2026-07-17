# 奥德赛0.4.0.7161 Hardboard Vibecoding Agent Guide

奥德赛0.4.0.7161 当前定位为 ESP-IDF 硬件 vibecoding IDE。Agent 写代码、调用 ESP-IDF、解释错误；右侧 BrowserView 用于文档、网页、工作台文件和调试页面。仓库和内部工程代号仍为 `vibeide`。

## 目录

- `runtime/hardboard/esptools/`：ESP-IDF 5.4.3、Python venv、CMake、Ninja、Xtensa 工具链。
- `runtime/hardboard/example/esp32s3/`：ESP32-S3 示例，禁止直接当工作工程修改。
- `runtime/hardboard/projects/`：工作工程目录，Agent 新建和修改代码放这里。
- `runtime/hardboard/doc/`：施工说明和硬件设备记录。
- `runtime/hardboard/git-snapshots/`：源码快照，改动前可调用 `hardboard.snapshot_create`。
- `runtime/hardboard/firmware/`：固件归档目录。
- `runtime/hardboard/logs/`：编译、烧录、串口日志目录。

## 默认硬件

- 默认 target：`esp32s3`
- 已验证设备端口：Windows `COM3`
- 已验证芯片：ESP32-S3 QFN56 revision v0.2，8MB PSRAM，USB-Serial/JTAG
- 已验证 ESP-IDF：5.4.3

## 标准工作流

1. `hardboard.env_status`
2. 如要烧录：`hardboard.devices_list`
3. 大改前：`hardboard.snapshot_create`
4. 新工程或 target 不确定：`hardboard.idf_set_target`
5. 编译：`hardboard.idf_build`
6. 烧录：`hardboard.idf_flash`
7. 运行验证：`hardboard.serial_capture`
8. 需要清理时：`hardboard.idf_clean`
9. 需要擦除芯片时：`hardboard.idf_erase_flash`

## 路径和文件定位规则

- 任务开始先调用 `hardboard.env_status`，后续文档路径以返回的 `docsDir` 为准。
- 不要从 Agent 当前工作目录猜 `..\runtime\hardboard\doc`；打包版 cwd 可能是 `runtime-data\agent-workspace`。
- 工程路径优先使用 `hardboard\projects\<project-name>` 这种相对路径。
- 查工程文件时排除 `build/**`，不要直接 `find <project> -type f`。
- 修改源码前先读 `main/CMakeLists.txt` 的 `SRCS` 字段，不要猜源码一定叫 `main.c`。
- `hardboard.idf_build` 和 `hardboard.idf_flash` 返回的是精简摘要；完整 stdout/stderr 在返回的 `stdoutLogPath` / `stderrLogPath`。

## 打包版 C++ include 排障

如果打包版 runtime 编译 ESP-IDF 工程时报：

```text
fatal error: bits/c++config.h: No such file or directory
fatal error: bits/stl_iterator_base_types.h: No such file or directory
```

不要先改业务源码。排查顺序：

1. `hardboard.env_status` 必须显示 `hardboardRoot` 位于 `%LOCALAPPDATA%\vibeide-hardboard-runtime\hardboard`。
2. 删除当前工程 `build` 目录，避免旧 Python、旧 ESP-IDF 路径或旧 toolchain include 缓存。
3. 重新执行 `hardboard.idf_build`，读取 compact JSON 里的 `stderrTail` 和 `stderrLogPath`。
4. runtime 会按工程 target 自动给 `CPLUS_INCLUDE_PATH` 注入 Xtensa GCC 14.2.0 C++ multilib include，例如 `xtensa-esp-elf/include/c++/14.2.0/xtensa-esp-elf/esp32s3/no-rtti`。如果仍然失败，先检查该目录是否存在；临时方案是在工程顶层 `CMakeLists.txt` 对 C++ 编译追加同一路径。

## 验证事实

Windows `C:\vibeide` 下已完成：

- `npm --prefix runtime run smoke:hardboard` 通过，输出 `hardboard build smoke ok`。
- `hardboard.idf_flash` 对 `COM3` 烧录 hello_world 成功。
- `hardboard.serial_capture` 用于 SSH/Agent 下非交互抓取串口日志，替代需要 TTY 的 `idf.py monitor`。
- 打包产物正式名使用 `奥德赛0.4.0.7161`。
- 打包版 `hardboard:build hardboard\projects\wifi_connect_fmai` 已验证 compact JSON 输出正常，`bits/c++config.h` 问题已通过 runtime C++ include 注入修复。
- 打包版 `hardboard:flash hardboard\projects\wifi_connect_fmai COM3` 已验证写入和 hash verified 成功。
- 打包版 `hardboard:serial COM3 8 115200` 已验证能抓到连续 `sin:<number>` 数据，可用于 IDE 串口监视器曲线测试。

不要假装编译或烧录成功。只有 hardboard 工具返回 exitCode 0，才可以报告成功。
