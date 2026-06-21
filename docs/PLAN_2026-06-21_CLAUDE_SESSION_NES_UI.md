# 2026-06-21 Claude 会话与 NES UI 重构计划

## 目标

本轮重构解决两个核心问题：

1. Claude Code CLI 当前每次用户提问都会以 `claude -p <prompt>` 启动一个新进程，导致每个问题都是新会话。目标是软件打开期间保持同一个 Claude 会话上下文。
2. Electron 前端需要大范围重构为 NES.css / 蓝白机风格，包括 Agent 对话、右侧 Chrome 外框、窗口边缘和应用图标。

同时调整 Windows 打包规则，让新图标、应用名和资源过滤规则进入打包链路。

追加需求：右侧工作台里的文件 / 目录不能只是展示列表，必须可以点击并在右侧浏览页层打开。

## 当前证据

- `electron/src/main/worker/orchestrator.ts` 在每次 `runTask()` 开头发现旧 Agent 进程会 `killAgent()`。
- `electron/src/main/agent.ts` 每次调用 `spawnAgent(prompt)` 都执行一次 `claude ... -p prompt`。
- 当前前端样式主要在 `electron/src/renderer/styles/global.less`，是暖色玻璃拟态，不是 NES.css 风格。
- 当前 Electron package / builder 仍使用 `@coffecat/electron`、`productName: coffecat`、`appId: com.coffecat.app`。
- 当前 builder 没有配置自定义 icon。

## Claude 会话方案

### 选择

短期采用“应用级会话上下文 + Claude resume 参数”双层方案：

1. 应用内维护 `ClaudeSessionStore`，把用户输入、Agent 输出摘要和最近消息写入 `runtime/claude-session/session.json`。
2. 每次调用 Claude CLI 时，把“当前软件会话上下文”注入 prompt，保证即使 CLI 子进程退出，下次问题仍能看到同一软件会话。
3. 如果当前 Claude Code CLI 支持 `--continue` 或 `--resume <id>`，在 `agent.ts` 中预留 flag 选择；如果运行时不支持，则上下文注入仍是稳定兜底。

### 为什么不直接长驻交互进程

Claude Code 的交互 TTY 协议不适合当前 `stream-json` 解析链路；直接长驻 stdin/stdout 会引入复杂的终端状态、输入确认和 MCP 初始化问题。当前阶段先保持一次任务一个子进程，但把“软件会话”上移到应用层持久化。

### 交付

- 新增 `electron/src/main/worker/session-store.ts`
- `orchestrator.ts`：
  - 不再把每次问题理解为无上下文任务。
  - 构造 prompt 前读取 session context。
  - Agent 完成后写入用户消息、Agent 文本摘要、任务状态。
  - UI 显示当前会话 id / 轮次。
- `agent.ts`：
  - 支持可选 Claude CLI session flags。
  - 不因新任务强行 kill 已完成的历史上下文；只 kill 正在运行的旧进程。

### 验证

- `cd electron && npm run verify:session`
- 验证点：
  - 新 session 从 0 轮开始。
  - 追加两轮后 `turnCount=2`。
  - `buildClaudeSessionContext()` 能读到前两轮用户和 Agent 内容。

## NES.css / 蓝白机 UI 方案

### 设计方向

- 视觉基调：NES.css 风格，像素字体、硬边框、蓝白机配色。
- 主色：深蓝、亮蓝、白、红色强调，不再使用暖色咖啡/玻璃拟态。
- 控件：按钮、输入框、面板、tabs、状态条全部采用像素边框。
- 右侧浏览器外框模拟 8-bit Chrome：顶部标签、地址栏、录制按钮、页面选择器都像游戏机 UI。
- 窗口边缘：Electron header 和 app 外框使用像素边框。
- 图标：生成/绘制一个像素风 `vibeide` 图标，并配置到打包规则。

### 交付

- 引入 `nes.css` 依赖。
- `electron/src/renderer/main.tsx` 引入 `nes.css/css/nes.min.css`。
- 大幅重写 `global.less`。
- 调整组件 class：
  - `ChatPanel.tsx`
  - `TaskProgress.tsx`
  - `ResultPanel.tsx`
  - `BrowserPanel.tsx`
  - `WorkspacePanel.tsx`
  - `App.tsx`
- 新增/更新图标资源：
  - `electron/assets/icon.svg`
  - `electron/assets/icon.png`（如可生成）
  - `electron/assets/icon.ico`（Windows 打包使用）

## 打包规则方案

- `electron/package.json`
  - package name 改为 `@vibeide/electron`
  - product name / title 改为 `vibeide`
  - 增加必要 icon 资源引用
- `electron/electron-builder.yml`
  - `appId: com.vibeide.app`
  - `productName: vibeide`
  - `win.icon: assets/icon.ico`
  - Linux/mac icon 预留
  - 不把 `apikey.txt` 作为强制 extraResource；真实 key 不应进入 installer
  - 继续包含 `agent`、`runtime/dist`、`runtime/node_modules`、`scripts`、`config`、`_bundled`，但排除 logs、screenshots、recordings、profile、workflows

## 工作台点击方案

- `electron/src/main/workbench.ts`
  - 增加 `openWorkbenchItem()`。
  - 只允许打开项目根、录制目录、工作流目录和 `agent/tools` 范围内的文件 / 目录。
  - 返回 `file://` URL。
- `electron/src/main/gateway.ts`
  - 增加 `workbench:openItem` IPC。
  - 打开成功后调用 `openTabUrl(url, true)`，在右侧浏览页层新开 / 激活页面。
- `WorkspacePanel.tsx`
  - 工作台条目从 `article` 改为按钮。
  - 点击按钮调用 preload 暴露的 `openWorkbenchItem()`。

### 验证

- `cd electron && npm run smoke:workbench`
- 验证点：
  - 启动真实 Electron 构建页面。
  - 在 smoke 模式下触发工作台第一条按钮 `.click()`。
  - 主进程收到 `workbench:openItem` 并返回 `file://` URL。

## 验收标准

1. `pytest tests/test_project.py` 通过。
2. `node --check agent/tools/*.mjs` 通过。
3. `cd electron && npm run typecheck` 通过。
4. `cd runtime && npm run typecheck` 通过。
5. `cd electron && npm run build:renderer && npm run build:main` 通过。
6. `cd electron && npm run verify:session` 通过。
7. `cd electron && npm run smoke:workbench` 通过。
8. Windows 上能启动：
   - `powershell -ExecutionPolicy Bypass -File scripts\start_electron_desktop.ps1`
9. Windows Electron 窗口能看到：
   - NES.css / 蓝白机风格窗口边缘
   - Agent 对话像素风
   - 右侧 Chrome 外框像素风
   - 应用标题为 `vibeide`
10. 连续发送两条任务时，第二条 prompt 包含同一软件会话上下文。
11. 右侧工作台条目点击后能打开文件 / 目录。
12. `git status --short --ignored` 中敏感文件仍被忽略。

## 风险

- `nes.css` 会带默认字体和组件样式，可能与现有自定义 CSS 冲突；需要以 `global.less` 做统一覆盖。
- Windows 图标格式需要 `.ico`；如果本机没有转换工具，先提交 SVG/PNG 并在 builder 中配置可用格式，Windows 实机再补 `.ico`。
- Claude Code CLI 的真实 `--continue/--resume` 行为需以当前安装版本 help 为准。若不可用，本轮用应用级 session context 保证体验。
