# 奥德赛0.0 接力开发文档

> 本文记录当前接手状态、架构规则、开发流程和同步方式。敏感账号密码不写在本文，见本机私有文件 `.local-secrets/HANDOFF_PRIVATE.md`，该目录已被 `.gitignore` 排除。

## 当前位置

- GitHub 仓库：`git@github.com:howtio/vibeide.git`
- Windows 实机目录：`C:\vibeide`
- 本机工作目录：`/run/media/howtion/thinkplus/hardvibecoding/vibeide`
- Windows SSH：`hp@192.168.137.1`
- Windows 机器名：`LAPTOP-JQQD9L56`

## 当前状态

- 正式项目名：奥德赛0.0。
- 内部工程代号 / GitHub 仓库：`vibeide`。
- Windows 正式目录：`C:\vibeide`，已经是 Git 仓库，后续以 GitHub `main` 为源码真相源。
- Linux 本机目录：`/run/media/howtion/thinkplus/hardvibecoding/vibeide`，用于主要改代码、提交和推送。
- Windows 端用于真实 Electron、ESP-IDF、ESP32-S3、串口和打包验证。
- 新文档体系：
  - `docs/INDEX.md`
  - `docs/ARCHITECTURE.md`
  - `docs/DEVELOPMENT.md`
  - `docs/GITHUB_SYNC.md`
  - `docs/REFACTOR_PLAN.md`
  - `docs/SECURITY.md`
- 已排除大体积运行产物和依赖：
  - `electron/node_modules`
  - `electron/dist`
  - `electron/dist-package`
  - `electron/dist-package.zip`
  - `agent/node_modules`
  - `agent/logs`
  - `agent/screenshots`
  - `agent/recordings`
  - `runtime/node_modules`
  - `runtime/dist`
  - `runtime/chrome_profile`
  - `runtime/recordings`
  - `runtime/workflows`
  - `_bundled`
  - `apikey.txt`

## 当前待接力事项

- `log.txt` 复盘出的文档定位、文件扫描、源码文件名猜测、MCP build 输出过大问题已经落到 hardboard skill、runtime compact output 和文档规则里。
- Windows 已能重新打包出 `奥德赛0.0` 产物，打包名已从用户视角统一。
- 最近一次打包版 `hardboard:build hardboard\projects\wifi_connect_fmai` 验证了 compact JSON 输出正常，但编译失败在 Xtensa GCC C++ multilib include：

```text
fatal error: bits/c++config.h: No such file or directory
```

- 这个问题不要当成业务源码错误。下一位接力应先清理 packaged 工程 `build` 后复测；如果仍失败，修 runtime 的 toolchain include 注入，或临时在工程顶层 `CMakeLists.txt` 对 C++ 编译追加 `xtensa-esp-elf/include/c++/14.2.0/xtensa-esp-elf/esp32s3/no-rtti`，然后重新打包并跑 packaged build。
- 用户最新要求是“先不用继续，去修文档”，所以本文档记录当前真实状态，不宣称 packaged hardboard build/flash 已最终通过。

## 接力操作手册

### 1. 开始前

```bash
cd /run/media/howtion/thinkplus/hardvibecoding/vibeide
git pull --ff-only origin main
git status --short
```

必须先读：

```bash
sed -n '1,220p' README.md
sed -n '1,260p' docs/HANDOFF.md
sed -n '1,260p' docs/HARDBOARD_CONSTRUCTION.md
sed -n '1,180p' agent/skills/espidf_hardboard.md
```

### 2. Windows SSH 链路

Windows 主机：

```text
hp@192.168.137.1
C:\vibeide
```

从 Linux 执行 Windows 命令的模式：

```bash
SSHPASS='<本机私有密码>' sshpass -e ssh -o StrictHostKeyChecking=no hp@192.168.137.1 "cmd /d /s /c \"cd /d C:\\vibeide && git status --short\""
```

密码和 API key 只在 `.local-secrets/HANDOFF_PRIVATE.md` 或用户本机环境中保存，不写入公开文档、提交信息、日志摘要或 issue。

### 3. 改代码原则

- 主要在 Linux 本机改源码。
- 用 `apply_patch` 精确改文件，不用 `git checkout --` 回滚用户改动。
- 不提交 `node_modules`、`dist`、`dist-package`、runtime logs、Chrome profile、密钥。
- hardboard 工程文件不要扫 `build/**`，查源码先读 `main/CMakeLists.txt` 的 `SRCS`。
- hardboard 工具调用优先使用相对路径：`hardboard\projects\<project>`。

### 4. 本机验证

```bash
npm --prefix runtime run build
npm --prefix electron run typecheck
npm --prefix electron run build:main
npm --prefix electron run build:renderer
```

如果改了 Agent skill/context：

```bash
npm --prefix electron run verify:session
npm --prefix electron run verify:hardboard
```

### 5. GitHub 同步

```bash
git status --short
git add <明确文件>
git commit -m "<type>: <summary>"
git push origin main
```

Windows 拉取：

```bash
SSHPASS='<本机私有密码>' sshpass -e ssh -o StrictHostKeyChecking=no hp@192.168.137.1 "cmd /d /s /c \"cd /d C:\\vibeide && git pull --ff-only origin main\""
```

### 6. Windows 编译和打包

快速验证源码：

```bash
SSHPASS='<本机私有密码>' sshpass -e ssh -o StrictHostKeyChecking=no hp@192.168.137.1 "cmd /d /s /c \"cd /d C:\\vibeide && npm --prefix runtime run build && npm --prefix electron run typecheck && npm --prefix electron run build:main && npm --prefix electron run build:renderer\""
```

完整 Windows 打包：

```bash
SSHPASS='<本机私有密码>' sshpass -e ssh -o StrictHostKeyChecking=no hp@192.168.137.1 "cmd /d /s /c \"cd /d C:\\vibeide && npm --prefix electron run dist:win\""
```

当前正式产品名是奥德赛0.0；打包产物文件名会使用该产品名。

### 7. Hardboard 验证

```cmd
cd /d C:\vibeide\electron\dist-package\win-unpacked\resources\runtime
node dist\index.js hardboard:env
node dist\index.js hardboard:build hardboard\projects\wifi_connect_fmai
node dist\index.js hardboard:devices
node dist\index.js hardboard:flash hardboard\projects\wifi_connect_fmai COM3
node dist\index.js hardboard:serial COM3 10 115200
```

期望：

- `hardboard:env` 的 `hardboardRoot` 指向 `%LOCALAPPDATA%\vibeide-hardboard-runtime\hardboard`。
- build/flash 返回 compact JSON，包含 `exitCode`、`ok`、`stdoutTail`、`stderrTail`、`stdoutLogPath`、`stderrLogPath`。
- 完整 Ninja / esptool 输出在 `runtime/hardboard/logs/*.log`。

### 8. 日志问题处理

如果用户提供 `log.txt`：

- 先完整阅读日志，不只看首尾。
- 从日志中提炼工具问题、skill 问题、路径问题和 UI/文档漂移问题。
- 对应修复必须落到代码或文档规则里，不能只解释。
- 如果 MCP 输出过大，应优先修工具返回格式，让 Agent 不需要读取 Claude 自己保存的超长 tool-result 文件。

## 架构概览

```text
Electron Window
├── Renderer UI
│   ├── ChatPanel
│   ├── TaskProgress
│   ├── ResultPanel
│   └── BrowserPanel / WorkspacePanel
├── Gateway
│   └── IPC 唯一入口
├── Worker / Orchestrator
│   ├── 快捷任务
│   ├── 搜索预处理
│   ├── 任务上下文构造
│   └── 拉起 Claude Agent
├── Agent 工作区
│   ├── agent/CLAUDE.md
│   ├── agent/skills/*.md
│   └── agent/tools/*
└── Runtime
    ├── CDP 连接 Electron Chromium
    ├── MCP Server
    ├── browser.* tools
    ├── storage.* tools
    └── 录制 / 回放 / workflow
```

核心链路：

```text
UI -> Gateway -> Worker -> Agent -> MCP -> Runtime -> Electron Chromium
```

## 关键规则

1. Gateway 是唯一 IPC 入口。
2. Runtime 不调 LLM，只做浏览器连接、动作、提取、录制、回放和存储。
3. Agent 不直接碰 Playwright，不写脚本操作浏览器，所有浏览器操作必须走 MCP。
4. Agent 可读 `agent/skills/`，可写 `agent/tools/`，不要修改 `runtime/`、`electron/`、`scripts/`。
5. 搜索任务优先用 `agent/tools/build_platform_search_url.mjs` 生成站内 URL，再 `browser.navigate`。
6. 录制、回放、复用流程优先使用 `browser.recording_*` 和 `browser.workflow_*`。
7. API key、cookie、Chrome profile、录制运行产物、依赖目录不进 Git。
8. 真实账号密码只放 `.local-secrets/`，不要提交、不要 push。

## 主要目录

```text
electron/                  Electron 桌面端
electron/src/main/          主进程、Gateway、Worker、BrowserView
electron/src/renderer/      React UI
runtime/                   Runtime MCP 与 CDP 控制层
runtime/src/mcp/            MCP tools 注册
agent/                     Claude Agent 工作区
agent/skills/              平台知识与操作规则
agent/tools/               跨平台辅助脚本
config/                    YAML 配置
docs/                      项目文档
scripts/                   启动、报告和辅助脚本
tests/                     Python scaffold / 结构测试
```

## 关键文件

- `CLAUDE.md`：总开发规则。
- `agent/CLAUDE.md`：Agent 运行规则，强调所有浏览器操作必须走 MCP。
- `electron/src/main/index.ts`：Electron 启动、窗口、CDP 端口、BrowserView 初始化。
- `electron/src/main/gateway.ts`：IPC 注册和 Worker 转发。
- `electron/src/main/worker/orchestrator.ts`：任务编排、快捷任务、搜索预处理、Agent 生命周期。
- `electron/src/main/worker/context.ts`：按任务选择 skills 并构造 Agent prompt。
- `electron/src/main/agent.ts`：拉起 Claude Code、生成 MCP 配置、读取 DeepSeek API key。
- `electron/src/main/browser-view.ts`：右侧 WebContentsView tabs、持久 session、bounds 同步。
- `electron/src/main/browser-recorder.ts`：Electron 侧录制和回放桥接。
- `runtime/src/mcp/browser.tool.ts`：注册 `browser.*` MCP tools。
- `runtime/src/browser.ts`：CDP 连接和页面选择。
- `runtime/src/record.ts` / `runtime/src/replay.ts`：Runtime 侧录制和回放。
- `runtime/src/workflows.ts`：workflow 持久化。

## 开发前检查

```bash
cd /run/media/howtion/thinkplus/hardvibecoding/vibeide
git status --short
git branch --show-current
sed -n '1,220p' docs/INDEX.md
sed -n '1,260p' docs/ARCHITECTURE.md
sed -n '1,260p' docs/REFACTOR_PLAN.md
```

如果要开始实质改动，建议先建备份分支：

```bash
git checkout -b backup/$(date +%Y%m%d)-before-work
git push -u origin HEAD
git checkout main
```

## 本机验证命令

```bash
# Python 结构测试
pytest tests/

# Runtime typecheck
cd runtime
npm install
npm run typecheck

# Electron typecheck / build
cd ../electron
npm install
npm run typecheck
npm run build:main
npm run build:renderer
```

注意：历史文档记录 `pytest tests/` 曾因缺少旧 `src/coddecat` scaffold 实现失败；当前代码应以 `tests/test_project.py` 的结构测试为主要参考，`tests/test_scaffold.py` 属于旧 scaffold 测试。

## Windows 实机运行

Windows 上项目目录：

```powershell
cd C:\vibeide
```

推荐启动：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start_electron_desktop.ps1
```

或：

```cmd
scripts\start_electron_desktop.cmd
```

## GitHub 同步策略

推荐把 GitHub 作为源码真相源：

1. 本机修改源码。
2. 本机验证。
3. 提交并 push 到 `git@github.com:howtio/vibeide.git`。
4. Windows 端后续改为 clone/pull 该仓库，或者从本机同步变更文件回 `C:\vibeide`。

不要把 Windows 当前整目录直接提交，因为里面有依赖、构建产物、运行态和密钥。

详细流程见 `docs/GITHUB_SYNC.md`。

## 从 Windows 重新同步源码

如果 Windows 原目录有新改动，可重新打源码包。注意继续排除依赖、产物、运行态和密钥：

```bash
ssh hp@192.168.137.1 "tar -a -cf C:\Users\HP\AppData\Local\Temp\vibeide-source.zip --exclude=./electron/node_modules --exclude=./electron/dist-package --exclude=./electron/dist-package.zip --exclude=./agent/node_modules --exclude=./agent/logs --exclude=./agent/screenshots --exclude=./agent/recordings --exclude=./_bundled --exclude=./apikey.txt -C C:\vibeide ."
scp hp@192.168.137.1:/C:/Users/HP/AppData/Local/Temp/vibeide-source.zip ../vibeide-source.zip
unzip -o ../vibeide-source.zip
```

`runtime/` 要单独同步源码，避免把运行态一起带进来：

```bash
ssh hp@192.168.137.1 "tar -a -cf C:\Users\HP\AppData\Local\Temp\vibeide-runtime-source.zip --exclude=./node_modules --exclude=./dist --exclude=./chrome_profile --exclude=./recordings --exclude=./workflows -C C:\vibeide\runtime ."
scp hp@192.168.137.1:/C:/Users/HP/AppData/Local/Temp/vibeide-runtime-source.zip ../vibeide-runtime-source.zip
mkdir -p runtime
unzip -o ../vibeide-runtime-source.zip -d runtime
```

## 敏感信息规则

- `apikey.txt` 不提交。
- `.env` 不提交。
- `.local-secrets/` 不提交。
- `runtime/chrome_profile/` 不提交。
- `runtime/recordings/` 和 `runtime/workflows/` 默认视为运行态，不提交，除非用户明确要求保存某个示例 workflow。
- 如果要记录账号密码，只写入 `.local-secrets/HANDOFF_PRIVATE.md`。

## 当前读码结论

- 这个项目目前更像 Electron + Runtime + Agent 的桌面采集原型，而不是 README 里旧的纯 Python `coddecat` scaffold。
- `pyproject.toml` 和 `tests/test_scaffold.py` 仍保留旧 Python scaffold 叙事，可能与当前主链路不一致。
- `README.md`、`CLAUDE.md` 已先统一成 `奥德赛0.0` 当前主线。
- 代码、package、UI、部分注释中仍有旧名 `coffecat/coddecat`，后续按 `docs/REFACTOR_PLAN.md` 分阶段处理。
- `electron/dist/` 已被同步出来，但属于构建产物，后续应从 Git 中排除。
- 中文文件名文档在当前 Linux 外置盘解包时出现编码/权限问题，必要时应从 Windows 远程读取或重命名为 ASCII 文件名后再入库。

## 下一步建议

1. 先清理 Git 跟踪范围：只提交源码、配置、文档，不提交 `electron/dist/` 和私有配置。
2. 提交并 push 当前源码和文档到 `git@github.com:howtio/vibeide.git`。
3. 明确 Python scaffold 是否还保留；如果不保留，应同步调整 `pyproject.toml` 和测试。
4. 在 Windows 上用 Git clone 方式替代原裸目录，之后统一通过 GitHub 接力。
