# Hardboard IDE 施工文档

## 目标

把 Catnip Forge 建设为硬件 vibecoding 专用 IDE：

- 左侧 Agent 负责写 ESP-IDF 代码、解释步骤、调用工具、处理编译/烧录错误。
- 右侧 BrowserView 保留，用于打开乐鑫文档、GitHub、工作台文件和调试页面。
- 前端原重放区改为设备选择、Build、Flash；浏览器、录制、workflow、storage 等 MVP 能力保留。
- Windows 打包后不依赖用户手工配置 ESP-IDF 环境变量；Claude Code 通过 MCP hardboard tools 调用随包 ESP-IDF。

## 当前目录

```text
runtime/hardboard/
  esptools/        ESP-IDF 5.4.3 源码、CMake/Ninja/Xtensa 工具链
  example/         按芯片保存示例工程；当前包含 ESP32-S3 示例
  projects/        Agent 修改、编译、烧录的工作工程
  doc/             Agent 可读施工文档、设备记录、硬件约束
  git-snapshots/   本地工程快照，排除 build/.git 等产物
  firmware/        预留 bin/elf/map 等交付固件
  logs/            编译、烧录、串口日志
  events/          EventBus 事件持久化（events.jsonl / state.json）
  cache/           预留缓存目录（当前仅保留 .gitkeep）
```

Windows Python 独立放在 `runtime/python/`；安装后唯一运行入口为 `resources/runtime/python/Scripts/python.exe`。`esptools/idf-tools/python_env/**` 属于旧机器 venv，已从打包资源排除。

## ESP-IDF 版本

- 当前固定版本：ESP-IDF 5.4.3。
- 默认 target：`esp32s3`。
- 参考流程来自 Espressif ESP-IDF v5.4 Windows start-project 文档和 v5.4.4 get-started 文档。

## 官方流程映射

乐鑫标准流程：

1. ESP-IDF 路径和工程路径避免空格。
2. 从 `examples/get-started/hello_world` 复制工程。
3. 进入工程目录后执行 `idf.py set-target esp32s3`。
4. 执行 `idf.py build`。
5. 选择串口，例如 Windows 下当前实测 ESP32-S3 为 `COM7`。
6. 执行 `idf.py -p COM7 flash`。

Catnip Forge 对应工具：

```text
hardboard.env_status
hardboard.devices_list
hardboard.snapshot_create
hardboard.idf_set_target
hardboard.idf_build
hardboard.idf_flash
hardboard.serial_capture
hardboard.idf_clean
hardboard.idf_erase_flash
```

## 路径规则

ESP-IDF 工程可以使用相对路径，推荐 Agent 和工具调用统一写：

```text
hardboard\projects\<project-name>
```

不要让 Agent 拼 `C:\vibeide\electron\dist-package\win-unpacked\resources\runtime\hardboard\...` 这种打包后的长绝对路径。Windows 打包版 runtime 会在内部把 hardboard 根目录映射到短路径：

```text
C:\vibeide-hw\hardboard
```

用途：

- 避免随包 ESP-IDF/GCC 工具链在很深的 `resources\runtime\hardboard\esptools\...` 路径下出现 C++ 标准库头文件解析异常。
- 让 `hardboard.env_status` 返回的 `idfPath`、`python`、`idfToolsPath`、`projectsDir` 都是短路径。
- 允许旧的打包绝对路径输入被 runtime 自动重写到短路径别名下。
- 如果旧 build 缓存记录了旧 Python 或旧路径，runtime 会删除该项目 `build` 目录并自动重试一次。

已定位过的典型错误：

```text
fatal error: bits/c++config.h: No such file or directory
fatal error: bits/stl_iterator_base_types.h: No such file or directory
```

这类错误通常不是 ESP-IDF 源码缺文件。实测头文件存在，常见原因有两类：

1. 打包后路径过深或旧 build 缓存记录了旧路径。先确认 `hardboard.env_status` 返回的是短路径 `C:\vibeide-hw\hardboard`，然后删除工程 `build` 后重试。
2. 打包版 Xtensa GCC 14.2.0 的 C++ multilib include 没被编译命令带上。症状通常出现在 ESP-IDF C++ 组件，例如 `nvs_flash`，缺的是 `xtensa-esp-elf/include/c++/14.2.0/xtensa-esp-elf/esp32s3/no-rtti/bits/*`。

排查顺序：

```cmd
cd /d E:\vibeide-0.1-win-unpacked\resources\runtime
node dist\index.js hardboard:env
rmdir /S /Q hardboard\projects\wifi_connect_fmai\build
node dist\index.js hardboard:build hardboard\projects\wifi_connect_fmai
```

runtime 会根据工程 `sdkconfig` / `sdkconfig.defaults` 识别 `CONFIG_IDF_TARGET`，并把对应 Xtensa GCC C++ multilib include 目录注入 `CPLUS_INCLUDE_PATH`。如果仍然报 `bits/c++config.h` 或 `bits/stl_iterator_base_types.h`，不要继续改业务源码；应先检查 runtime 注入的 include 路径是否存在，必要时再在具体 ESP-IDF 工程顶层 `CMakeLists.txt` 临时补 workaround，并重新打包验证。修复后用打包版 runtime 执行：

```cmd
cd /d E:\vibeide-0.1-win-unpacked\resources\runtime
node dist\index.js hardboard:env
node dist\index.js hardboard:build hardboard\projects\wifi_connect_fmai
```

`hardboard:env` 应显示：

```text
hardboardRoot = C:\vibeide-hw\hardboard
```

## log.txt 复盘出的已修复问题

### Agent 文档定位错误

日志里 Agent 试图读取：

```text
runtime-data\agent-workspace\..\runtime\hardboard\doc\README.md
```

这个路径错误，因为 Agent 默认 cwd 不是仓库根目录。规则已改为：硬件任务先调用 `hardboard.env_status`，再读取返回的 `docsDir`。

### 文件扫描扫进 build 产物

日志里直接 `find <project> -type f`，输出被 `build/**` 放大到几十万字符。规则已改为：

```bash
find <project> -path '*/build' -prune -o -type f -print
```

或者只读取 `CMakeLists.txt`、`main/CMakeLists.txt`、`main/*`。

### 源码文件名猜错

日志里 Agent 先找 `main/main.c`，但真实源码由 `main/CMakeLists.txt` 的 `SRCS` 指向 `wifi_connect_main.c`。规则已改为：修改 ESP-IDF 工程前必须先读 `main/CMakeLists.txt`。

### MCP build 输出过大

日志里 `hardboard.idf_build` 返回 15 万字符，触发 Claude 工具结果溢出。runtime 已改为：

- 完整 stdout/stderr 写入 `runtime/hardboard/logs/*.log`。
- MCP 和 CLI 返回 compact JSON：`exitCode`、`ok`、`cwd`、`stdoutLogPath`、`stderrLogPath`、`stdoutTail`、`stderrTail`、`stdoutBytes`、`stderrBytes`。
- Agent 不再需要读取 Claude 自己保存的超长 tool-result 文件。

## 2026-07-21 当前接力状态

- 唯一施工目录：`E:\Agent\vibeide\vibeide`。
- 当前打包目录：`electron\dist-package\win-unpacked`；正式入口为 `Catnip Forge.exe`。
- Windows 随包 Python、pyserial 与 ESP-IDF 冷构建已在最终目录验证；Python 不再引用 `C:\Users\HP\...`。
- 当前硬件工程 `runtime/hardboard/projects/touch_hello` 面向 Waveshare ESP32-S3-Touch-AMOLED-1.8；已编译、烧录 COM5，并验证触摸按钮输出 `hello`。
- 内置串口助手通过 CIM + pyserial fallback 枚举设备，支持完整串口参数与文本/HEX 双向收发；重开前等待旧子进程退出。
- Agent 动态 MCP 配置已补齐 `mcp` 参数，开发模式通过 `ELECTRON_RUN_AS_NODE=1` 启动 stdio 服务。

## 历史 0.1 接力状态

> 本节只保留旧设备和旧包的测试事实，不代表当前工作目录、Python 策略或串口状态。

- Windows 源码目录：`C:\vibeide`、`E:\vibeide`。
- Windows 0.1 unpacked 包：`E:\vibeide-0.1-win-unpacked`。
- 当时硬件测试报告：`docs/WINDOWS_0_1_TEST_REPORT.md`。
- Windows 发现串口：`COM7`、`COM8`、`COM9`。
- ESP32-S3 实测烧录端口：`COM7`。
- `COM7` 经 esptool 识别为 ESP32-S3 QFN56 revision v0.2：
  - 特性：Wi-Fi、BT 5 LE、Dual Core + LP Core、240MHz、Embedded PSRAM 8MB。
  - USB 模式：USB-Serial/JTAG。
  - MAC：`94:a9:90:30:50:00`。
- Windows 打包版 0.1 已验证：
  - `E:\vibeide-0.1-win-unpacked\奥德赛0.0.exe`
  - `FileVersion=0.1.0`
  - `ProductVersion=0.1.0`
- 打包版 runtime 的输出压缩机制已验证：`hardboard:build` 会返回 compact JSON 和 `stdoutLogPath` / `stderrLogPath`，不会再把大段 Ninja 输出直接塞回 Agent。
- 打包版 runtime 相对路径编译已通过：
  - `node dist\index.js hardboard:build hardboard\projects\wifi_connect_fmai`
  - `node dist\index.js hardboard:build hardboard\projects\hello_world_esp32s3`
  - 两个工程均 `exitCode=0`、`ok=true`。
- 打包版 runtime 烧录已通过：
  - `node dist\index.js hardboard:flash hardboard\projects\wifi_connect_fmai COM7`
  - `node dist\index.js hardboard:flash hardboard\projects\hello_world_esp32s3 COM7`
  - bootloader、app、partition table 均 hash verified。
- 串口剩余问题：
  - `hardboard:serial` 能打开 `COM7` / `COM8` 并生成日志，但当前没有抓到应用层输出。
  - `COM9` 打开失败，Windows 返回串口超时。
  - 下一步应修复 reset/open 时序或 console 接口配置，不能把串口应用输出记录为已通过。

## 随包环境策略

`runtime/src/hardboard/env.ts` 不要求用户打开 ESP-IDF shell。每次运行 `idf.py` 前会自动设置：

- `IDF_PATH`
- `IDF_TOOLS_PATH`
- `IDF_PYTHON_ENV_PATH`
- `ESP_ROM_ELF_DIR`
- `IDF_PYTHON_CHECK_CONSTRAINTS=no`
- `PYTHON` / `PYTHONHOME` / `PYTHONNOUSERSITE=1`：Windows 指向同一个随包 Python 根目录。
- `PATH`：自动追加随包 Python 根目录、`Scripts`、ESP-IDF tools 和已安装工具链 bin 目录。
- `CPLUS_INCLUDE_PATH`：自动追加当前 target 对应的 Xtensa GCC C++ multilib include，例如 `xtensa-esp-elf/include/c++/14.2.0/xtensa-esp-elf/esp32s3/no-rtti`。

Windows 打包配置包含 `runtime/hardboard`，但排除 ESP-IDF 自带 `examples/**` 和旧 `idf-tools/python_env/**`。`runtime/python/sitecustomize.py` 在 embeddable Python 的 `._pth` 隔离下只恢复当前脚本目录导入，防止混入用户机器的 Python 安装。Catnip Forge 自己的 `runtime/hardboard/example/**` 保留。

## Agent 开发规则

- 硬件任务先读 `agent/skills/espidf_hardboard.md`。
- `agent/skills/espidf_hardboard.md` 已写明：先 `hardboard.env_status`，用返回的 `docsDir/projectsDir`，不要猜当前 cwd。
- 新工程放在 `runtime/hardboard/projects/<project-name>`，不要直接改原始 example。
- 查工程文件必须排除 `build/**`，并先读 `main/CMakeLists.txt` 定位真实源码。
- 大改前调用 `hardboard.snapshot_create`。
- 编译必须调用 `hardboard.idf_build`；烧录必须调用 `hardboard.devices_list` 后再 `hardboard.idf_flash`。
- 用户要求“测试运行/联网/板子情况”时，烧录后必须调用 `hardboard.serial_capture` 或等价串口日志采集。
- 不允许只凭文件生成或口头描述宣称编译/烧录成功。

## 后续增强

- 串口监视器继续增强：
  - 前端入口在右侧 `监视器` 标签。
  - 已有 COM、波特率、数据位、停止位、校验位和字符编码选择。
  - 已有文本/HEX 双向收发和 LF/CRLF 行尾；原数值曲线已按用户反馈删除。
  - 后续要补 Electron smoke，直接调用主进程串口监视器并等待真实 `serial-data` IPC。
- 为 ESP32-C3/ESP32-C6 增加示例、target、真实设备记录。
- 增加固件归档工具，把 `.bin/.elf/.map/flasher_args.json` 复制到 `runtime/hardboard/firmware`。
