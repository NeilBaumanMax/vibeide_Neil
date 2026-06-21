# ESP-IDF Hardboard Vibecoding

用于 ESP32 / ESP32-S3 / ESP32-C3 硬件开发、编译、烧录、串口设备选择和本地工程维护。

## 默认环境

- 默认 ESP-IDF 版本：5.4.3。
- 默认 target：`esp32s3`。
- 硬件根目录：`runtime/hardboard`。
- 示例目录：`runtime/hardboard/example`。
- 工作工程目录：`runtime/hardboard/projects`。
- Agent 可读文档：`runtime/hardboard/doc`。
- 本地快照目录：`runtime/hardboard/git-snapshots`。

## 路径规则

- 硬件任务必须先调用 `hardboard.env_status`。后续读取文档、示例、工程时，以返回的 `docsDir`、`examplesDir`、`projectsDir` 为准。
- 不要假设当前工作目录在仓库根目录。Agent 默认 cwd 可能是 `runtime-data/agent-workspace`，因此 `..\runtime\hardboard\doc` 这类相对路径经常会错。
- 调用 hardboard 工具时优先使用相对工程路径，例如 `hardboard\projects\wifi_connect_fmai`。
- 不要手写打包后的长绝对路径，例如 `C:\vibeide\electron\dist-package\win-unpacked\resources\runtime\hardboard\...`。
- Windows 打包版 runtime 会自动把 hardboard 映射到短路径 `%LOCALAPPDATA%\vibeide-hardboard-runtime\hardboard`。
- 如果用户贴出 `bits/c++config.h: No such file or directory` 或 `bits/stl_iterator_base_types.h: No such file or directory`，先检查 `hardboard.env_status` 是否已经显示短路径；这个错误通常不是业务源码问题，而是打包长路径、旧 build 缓存或 Xtensa GCC C++ multilib include 未注入。
- 旧 build 缓存可能记录旧 Python 或旧路径；runtime 会自动删 `build` 并重试一次，但排查时仍要留意 `Run 'idf.py fullclean'` 相关提示。
- runtime 会按工程 target 自动给 `CPLUS_INCLUDE_PATH` 注入 Xtensa GCC C++ multilib include，例如 `xtensa-esp-elf/include/c++/14.2.0/xtensa-esp-elf/esp32s3/no-rtti`。如果清理 build 后仍缺 `bits/*`，不要继续改 `main/*.c`；应先检查该目录是否存在和是否被注入，必要时临时在顶层 `CMakeLists.txt` 追加同一路径，再重新打包复测。

## 先读资料

硬件任务开始时先读：

1. 调用 `hardboard.env_status`。
2. 读取返回的 `${docsDir}\README.md`。
3. 读取返回的 `${docsDir}\device-profile-esp32s3.md`。

如果任务涉及官方流程，可在右侧 BrowserView 打开 Espressif 文档，但不要用网页步骤替代 hardboard 工具。

## 标准调用顺序

1. `hardboard.env_status`：确认 `idfPath`、`idfPy`、`python`、`idfToolsPath`。
2. `hardboard.devices_list`：烧录前列出串口；Windows 串口通常为 `COM3`、`COM8`。
3. `hardboard.snapshot_create`：大改或用户要求可回滚时，先创建源码快照。
4. `hardboard.idf_set_target`：新工程或 target 不确定时执行，默认 `esp32s3`。
5. `hardboard.idf_build`：编译。
6. `hardboard.idf_flash`：烧录，必须传入真实端口。
7. `hardboard.serial_capture`：烧录后非交互读取串口日志，验证固件实际运行；SSH/Agent 场景不要依赖 `idf.py monitor`。
8. `hardboard.idf_clean`：需要清理构建缓存时执行。
9. `hardboard.idf_erase_flash`：用户明确要求擦除芯片时执行。

## 工程规则

- 不要直接修改 `runtime/hardboard/example/**`；先复制到 `runtime/hardboard/projects/<project-name>`。
- 不要把工程放到带空格路径。
- 查文件时不要直接 `find <project>` 扫整个工程，因为 `build/**` 会产生几十万字符输出。应使用：
  - `find <project> -path '*/build' -prune -o -type f -print`
  - 或只查 `CMakeLists.txt`、`main/CMakeLists.txt`、`main/*`。
- 不要猜源码叫 `main.c`。必须先读 `main/CMakeLists.txt` 的 `SRCS` 字段，再打开真实源码文件，例如 `wifi_connect_main.c`。
- 修改 ESP-IDF 工程时重点检查：
  - 顶层 `CMakeLists.txt`
  - `main/CMakeLists.txt`
  - `main/*.c` / `main/*.cpp`
  - `sdkconfig.defaults`
  - 组件依赖和 `idf_component_register`
- 编译失败先读 hardboard 工具返回的 `stderr/stdout`，再改代码。

## 成功标准

- “写好了”只代表文件已创建。
- “编译通过”必须来自 `hardboard.idf_build` exitCode 0。
- “烧录成功”必须来自 `hardboard.idf_flash` exitCode 0，并且输出包含写入和校验信息。
- “运行正常”必须来自 `hardboard.serial_capture` 的串口日志，或用户能看到的等价硬件输出。
- 不能因为生成了代码或看起来合理就报告硬件验证成功。

## 串口监视器测试

- IDE 前端的串口监视器在右侧 `监视器` 标签，不等同于 `hardboard.serial_capture` 一次性抓日志。
- 测试 IDE 监视器时，先确认板子正在用 `COM3`/`115200` 持续输出文本。
- 曲线测试推荐固件每行输出一个可解析数字，例如 `sin:0.7071`；前端曲线会提取每行最后一个数字。
- 如果命令行 `hardboard.serial_capture COM3 5 115200` 能收到数据，但 IDE 监视器收不到，要继续查 Electron 主进程 `hardboard:serialStart` 和渲染进程 `hardboard:serial-data` IPC。

## 已验证基线

- Windows `C:\vibeide` 下 ESP-IDF 5.4.3 可用。
- `runtime/hardboard/projects/hello_world_esp32s3` 已完成 set-target/build。
- ESP32-S3 板子在 `COM3` 烧录成功。
- 打包产物正式名使用 `奥德赛0.0`，目录仍是 `win-unpacked`。
- 打包版 runtime 已验证 compact JSON 输出不会溢出 Agent；`hardboard\projects\wifi_connect_fmai` 的打包版 build/flash/serial 均已通过，串口能抓到连续 `sin:<number>` 数据。
