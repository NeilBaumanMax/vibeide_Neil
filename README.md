# Catnip Forge

**中文全称：Catnip 硬件智能开发平台**

**英文定位：Autonomous Hardware Development Agent**

Catnip Forge 是一个面向硬件 vibecoding 的本地桌面 IDE。它把 Electron、Claude Code Agent、Runtime MCP 工具、ESP-IDF hardboard 工具链和可复用 Skill 放在同一个桌面应用里，用来完成 ESP32/ESP32-S3 工程编写、编译、烧录、串口监视、文档查看和网页辅助检索。

当前 GitHub 仓库、内部 npm 包名和运行态兼容键仍沿用 `vibeide`，作为工程代号；用户可见正式产品名统一为 `Catnip Forge`。

当前主线不是旧的纯 Python scaffold，而是：

```text
Electron UI -> Gateway -> Worker -> Agent -> Runtime MCP -> Electron Chromium / ESP-IDF hardboard
```

## 当前状态

- 当前 GitHub：`https://github.com/NeilBaumanMax/vibeide_Neil.git`
- 当前施工分支：`electron_design`
- 当前对外发布版本：`v1.0.0`；内部构建号 `7201`，npm 包版本 `1.0.0-7201`，Windows PE 文件版本 `1.0.0.7201`
- 当前 Windows 源码目录：`E:\Agent\vibeide\vibeide`
- 上一版 Windows v0.1.0 unpacked 包：`E:\vibeide-0.1-win-unpacked`（历史验证对象）
- 历史 Linux、`C:\vibeide` 和旧 `E:\vibeide` 路径仅用于迁移记录，不再作为当前施工目录。
- 当前代码来源：Windows 工作区在 `electron_design` 分支维护 Apple 风格 Electron 界面、任务历史真实清理、Skill/工程仓库入口、双向串口助手和编辑器交互修正；GitHub 推送状态以 `git branch -vv` 为准。

## 能力边界

- Electron 桌面窗口采用 Apple 风格冷色界面，提供聊天区、Skill/工程资源仓库、串口监视、任务管理和 Monaco 代码编辑入口；仓库页显示硬件工程、参考代码与 Skills，编辑器仍可访问 Agent 工作区等受控根目录。浏览器工作台前端入口当前隐藏，相关后端能力暂时保留。
- Worker 负责快捷任务、搜索预处理、任务上下文构造和 Agent 生命周期；同一时间只运行一个活动任务，执行中消息默认追加到当前任务，显式“排队”才建立独立后续任务。
- Agent 负责推理和任务执行规划，但所有浏览器操作必须通过 MCP 工具完成。
- Runtime 通过 CDP 连接 Electron Chromium，提供 `browser.*`、`storage.*` 和 `hardboard.*` MCP tools。
- 任务管理器的日志“清除”会立即清空历史视图，并真实删除 EventBus 历史和 Hardboard `.log` 文件；残留 PID/运行状态不再阻止清除，后续新事件仍继续显示。
- 监视器是内置双向串口助手：支持端口、波特率、数据位、停止位、校验位、文本/HEX 收发、GBK/UTF-8/ASCII/Latin1 和行尾控制。Windows 先通过 CIM 枚举设备，失败时自动回退到随包 `pyserial`；数值趋势图已删除。
- Windows 安装包只使用 `resources/runtime/python/Scripts/python.exe` 及同一目录内的依赖，不再打包或回退到绑定开发机器路径的 ESP-IDF Python venv。
- `runtime/hardboard` 保存 ESP-IDF 工具、ESP32-S3 示例、施工文档、本地工程和固件产物。
- 录制、回放和 workflow 保留，用于把网页/调试流程沉淀为可复用辅助任务。

## 快速开始

### Windows

```powershell
cd E:\Agent\vibeide\vibeide
powershell -ExecutionPolicy Bypass -File scripts\start_electron_desktop.ps1
```

或：

```cmd
cd /d E:\Agent\vibeide\vibeide
scripts\start_electron_desktop.cmd
```

发布给其他用户时，应压缩并分发完整的 `electron\dist-package\win-unpacked` 文件夹。接收方完整解压到普通可写目录后运行 `Catnip Forge.exe`；首次启动窗口会引导保存 DeepSeek API Key。不能只发送 exe，也不要把包含真实 `resources\apikey.txt` 的目录重新分发。详细口径见 [Windows v1.0.0 便携版发布检查](docs/WINDOWS_V1_0_0_RELEASE_CHECKLIST.md)。

### Linux / macOS

```bash
cd /path/to/vibeide
bash scripts/start_electron_desktop.sh
```

### 直接用 npm

```bash
cd runtime && npm install && npm run dev
cd ../electron && npm install && npm run desktop
```

## 目录结构

```text
electron/                  Electron 桌面端
electron/src/main/          主进程、Gateway、Worker、BrowserView
electron/src/renderer/      React UI
runtime/                   Runtime MCP 与 CDP 控制层
runtime/src/mcp/            MCP tools 注册
runtime/hardboard/          ESP-IDF hardboard 工具、示例、工程、施工文档
agent/                     Claude Code Agent 工作区
agent/skills/              平台知识与操作规则
agent/tools/               跨平台辅助脚本
config/                    YAML 配置
docs/                      新文档体系和接力材料
scripts/                   启动、报告和辅助脚本
tests/                     当前结构测试与旧 scaffold 测试
```

## 开发检查

```bash
git status --short

# Runtime
cd runtime
npm install
npm run typecheck

# Electron
cd ../electron
npm install
npm run typecheck
npm run build:main
npm run build:renderer

# Python 结构测试
cd ..
pytest tests/test_project.py
```

说明：`tests/test_scaffold.py` 保留了旧 Python scaffold 预期，当前可能和 Electron 主线不一致。重构时需要决定保留、迁移或删除这条旧线。

## 文档入口

- [文档索引](docs/INDEX.md)
- [架构说明](docs/ARCHITECTURE.md)
- [开发流程](docs/DEVELOPMENT.md)
- [GitHub 同步和接力](docs/GITHUB_SYNC.md)
- [重构计划](docs/REFACTOR_PLAN.md)
- [安全和账号规则](docs/SECURITY.md)
- [接力开发文档](docs/HANDOFF.md)
- [Hardboard 施工文档](docs/HARDBOARD_CONSTRUCTION.md)
- [Electron Apple 风格界面施工文档](docs/ELECTRON_APPLE_UI_CONSTRUCTION.md)
- [开发进度](docs/DEV_PROGRESS.md)
- [施工日志](docs/LOG.md)
- [Windows 0.1 测试报告](docs/WINDOWS_0_1_TEST_REPORT.md)
- [Hardboard Agent 运行文档](runtime/hardboard/doc/README.md)

## Git 策略

不要把 Windows 当前整目录直接提交。必须排除：

- `node_modules/`
- `electron/dist/`
- `electron/dist-package/`
- `runtime/dist/`
- `runtime/chrome_profile/`
- `runtime/recordings/`
- `runtime/workflows/`
- `agent/logs/`
- `agent/screenshots/`
- `apikey.txt`
- `.env`
- `.local-secrets/`

本机私有账号、密码和 SSH 信息记录在 `.local-secrets/HANDOFF_PRIVATE.md`，该目录已被 `.gitignore` 排除。

## 下一步

1. 继续以 `E:\Agent\vibeide\vibeide` 为唯一施工目录，在当前本地分支精确提交；远端同步按 [GitHub 同步和接力](docs/GITHUB_SYNC.md) 由用户决定。
2. 持续回归内置串口助手、`hardboard.serial_capture` 与不同 ESP32 console 接口的兼容性。
3. 按 [重构计划](docs/REFACTOR_PLAN.md) 清理旧 scaffold、整理 Runtime / Agent / Electron 边界。
