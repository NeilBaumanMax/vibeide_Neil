# 奥德赛0.0

`奥德赛0.0` 是一个面向硬件 vibecoding 的本地桌面 IDE 原型。它把 Electron 内置浏览器、Claude Code Agent、Runtime MCP 工具、ESP-IDF hardboard 工具链和可复用录制工作流放在同一个桌面应用里，用来完成 ESP32/ESP32-S3 工程编写、编译、烧录、串口监视、文档查看和网页辅助检索。

当前 GitHub 仓库和内部 npm 包名仍沿用 `vibeide`，作为工程代号和迁移兼容名；用户可见正式产品名统一为 `奥德赛0.0`。

当前主线不是旧的纯 Python scaffold，而是：

```text
Electron UI -> Gateway -> Worker -> Agent -> Runtime MCP -> Electron Chromium / ESP-IDF hardboard
```

## 当前状态

- 当前备份 GitHub：`git@github.com:howtion0/vibeide.git`
- 主开发分支：`main`
- Windows 源码目录：`C:\vibeide`、`E:\vibeide`
- Windows 0.1 unpacked 包：`E:\vibeide-0.1-win-unpacked`
- 本机开发目录：`/home/howtion/桌面/hardvibecoding/vibeide`
- 当前代码来源：Linux 本机源码已同步到 Windows C/E 盘并备份到 GitHub。

## 能力边界

- Electron 桌面窗口提供聊天区、任务进度、右侧工作台、内置浏览器页和硬件 Build/Flash 入口。
- Worker 负责快捷任务、搜索预处理、任务上下文构造和 Agent 生命周期。
- Agent 负责推理和任务执行规划，但所有浏览器操作必须通过 MCP 工具完成。
- Runtime 通过 CDP 连接 Electron Chromium，提供 `browser.*`、`storage.*` 和 `hardboard.*` MCP tools。
- `runtime/hardboard` 保存 ESP-IDF 工具、ESP32-S3 示例、施工文档、本地工程和固件产物。
- 录制、回放和 workflow 保留，用于把网页/调试流程沉淀为可复用辅助任务。

## 快速开始

### Windows

```powershell
cd E:\vibeide
powershell -ExecutionPolicy Bypass -File scripts\start_electron_desktop.ps1
```

或：

```cmd
cd /d E:\vibeide
scripts\start_electron_desktop.cmd
```

### Linux / macOS

```bash
cd /home/howtion/桌面/hardvibecoding/vibeide
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

1. 继续按 [接力开发文档](docs/HANDOFF.md) 维护 Linux 本机、Windows C/E 盘、GitHub 三方同步。
2. 修复 `hardboard:serial` 在 ESP32-S3 上的 reset/open 时序，避免端口打开但无应用输出。
3. 按 [重构计划](docs/REFACTOR_PLAN.md) 清理旧 scaffold、整理 Runtime / Agent / Electron 边界。
