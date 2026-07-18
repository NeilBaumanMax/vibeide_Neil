# 架构说明

## 一句话

`奥德赛0.4.0-7171` 是一个 Electron 桌面自动化 IDE：用户在左侧对话，右侧提供仓库、监视器、任务管理器和编辑器；浏览器工作台后端暂时保留。任务由 Worker 编排，Agent 通过 Runtime MCP tools 控制同一个 Electron Chromium。

## 分层

```text
Renderer UI
  ↓ IPC
Gateway
  ↓ method dispatch
Worker / Orchestrator
  ↓ spawn prompt
Agent (Claude Code)
  ↓ MCP stdio
Runtime MCP Server
  ↓ Playwright CDP
Electron Chromium / WebContentsView
```

## Electron 层

位置：`electron/`

职责：

- 创建主窗口。
- 暴露 CDP 端口 `9230`。
- 管理右侧 `WebContentsView` 浏览页和 tabs。
- 提供 Renderer 到 Worker 的 IPC。
- 桥接浏览器录制、回放、编辑器目录读取和受限文件操作。

关键文件：

- `electron/src/main/index.ts`：应用启动、主窗口、CDP、生命周期。
- `electron/src/main/gateway.ts`：IPC 注册，唯一入口。
- `electron/src/main/browser-view.ts`：右侧 WebContentsView tabs、持久 session、bounds 同步。
- `electron/src/main/browser-recorder.ts`：Electron 侧录制和回放。
- `electron/src/main/workbench.ts`：工作台概览和编辑器文件系统边界；提供允许根目录下的目录枚举、文本读写、新建、重命名及移到系统回收站，禁止修改资源管理器根目录。
- `electron/src/main/hardboard.ts`：硬件设备、串口、Runtime EventBus、Build/Flash 的 IPC 桥接。
- `electron/src/main/paths.ts`：开发版与 packaged 环境的资源、Runtime、Agent 和 API key 路径解析。
- `electron/src/main/agent.ts`：Claude Agent 进程、动态 MCP 配置和生命周期管理。
- `electron/src/main/first-run.ts`：首次运行目录与资源初始化。
- `electron/src/main/tray.ts`：Windows 系统托盘和窗口显隐。
- `electron/src/main/worker/session-store.ts`：Claude 会话上下文持久化。
- `electron/src/renderer/App.tsx`：主 UI 状态，以及左右面板宽度持久化、拖动分隔和对话区收起/展开。
- `electron/src/renderer/components/BrowserPanel.tsx`：仓库、监视器、任务管理器和编辑器；工作台前端入口隐藏，但组件内部浏览器工作台实现保留。任务管理器负责相对工程选择、Build/Flash 控制、EventBus 诊断卡片和最近任务结果；编辑器负责多根资源树、懒加载目录、多文件标签、内置文件操作对话框、字号持久化和保存状态同步。
- `electron/src/renderer/components/CodeEditor.tsx`：基于 Monaco Editor 的代码区，按扩展名选择 C/C++、CMake、Markdown、JSON、TypeScript 等语言，使用内置 C/C++ 深色主题并接收用户字号设置。
- `electron/src/renderer/monaco.ts`：本地 Monaco editor/json/css/html/typescript Worker 注册，保证开发版和打包版不依赖在线 CDN。

## Worker 层

位置：`electron/src/main/worker/`

职责：

- 接收用户任务。
- 优先处理本地快捷任务。
- 对搜索/整理/排行类任务做平台 URL 预处理。
- 读取 Agent 规则和 skills，构造 prompt。
- 拉起或停止 Agent 进程。
- 解析 Agent stream-json 输出并推送给 UI。
- 对 HTML 游戏类任务做页面验收和自动返工。

关键文件：

- `orchestrator.ts`：任务主流程。
- `context.ts`：根据任务选择 `agent/skills/*.md` 并生成 prompt。
- `search-preflight.ts`：平台搜索预处理。
- `quick-tasks.ts`：本地快捷能力。
- `chat-buffer.ts`：Agent stream-json 输出解析。
- `task-state.ts`：任务进度状态机。
- `page-validator.ts`：HTML 页面/游戏验收。

## Agent 层

位置：`agent/`

职责：

- 作为 Claude Code 工作区运行。
- 根据 `agent/CLAUDE.md` 和选中的 skills 执行任务。
- 通过 MCP tools 操作浏览器和存储结果。
- 维护平台知识与纯辅助脚本。

硬性约束：

- 不直接用 Playwright、Puppeteer、curl、wget 或系统浏览器。
- 所有浏览器动作必须走 Runtime MCP tools。
- 只有纯 URL 构造、文本处理、文件辅助脚本才允许放 `agent/tools/`。
- 录制/回放/流程复用优先用 `browser.recording_*` 和 `browser.workflow_*`。

关键文件：

- `agent/CLAUDE.md`：Agent 运行铁律。
- `agent/skills/browser_guide.md`：浏览器操作规则。
- `agent/skills/search_workflow.md`：搜索类任务规则。
- `agent/skills/recording_workflow.md`：录制/回放规则。
- `agent/skills/replay_workflow_tooling.md`：workflow 封装规则。
- `agent/tools/build_platform_search_url.mjs`：跨平台搜索 URL 构造。

## Runtime 层

位置：`runtime/`

职责：

- 通过 Playwright `connectOverCDP` 连接 Electron 暴露的 CDP。
- 注册 MCP tools。
- 执行浏览器动作、截图、提取、录制、回放。
- 保存 workspace 数据和 workflow 定义。
- 通过 `hardboard/` 封装 ESP-IDF 环境、工程文件、Build/Flash runner 和输出解析。
- 通过 `eventbus/` 持久化并消费 Runtime 事件，为 Electron 任务管理器提供状态来源。
- 通过 `process/` 管理子进程、PID 注册、进程树终止和 stdout/stderr 生命周期。
- 通过 `task/` 管理 Runtime 任务注册、状态转换和结果摘要。

关键文件：

- `runtime/src/mcp/server.ts`：MCP 服务入口。
- `runtime/src/mcp/hardboard.tool.ts`：Hardboard MCP tools 注册。
- `runtime/src/mcp/tool-events.ts`：MCP 工具事件写入 EventBus。
- `runtime/src/hardboard/runner.ts`：ESP-IDF Build/Flash 进程执行。
- `runtime/src/eventbus/event-store.ts`：EventBus JSONL 和最近状态持久化。
- `runtime/src/process/process-runner.ts`：受管子进程生命周期。
- `runtime/src/task/task-manager.ts`：Runtime 任务状态机。

关键文件：

- `runtime/src/index.ts`：CLI 入口，支持 `health / mcp / connect`。
- `runtime/src/browser.ts`：CDP 连接、页面选择。
- `runtime/src/actions.ts`：navigate / click / fill / scroll / wait / screenshot。
- `runtime/src/extract.ts`：text / cards / table 提取。
- `runtime/src/record.ts`：Runtime 侧页面事件录制。
- `runtime/src/replay.ts`：Runtime 侧动作回放。
- `runtime/src/workflows.ts`：workflow 保存、读取、摘要。
- `runtime/src/mcp/browser.tool.ts`：`browser.*` tools 注册。
- `runtime/src/mcp/storage.tool.ts`：`storage.*` tools 注册。

## 数据和运行态

不进 Git：

- `runtime/chrome_profile/`
- `runtime/recordings/`
- `runtime/workflows/`
- `runtime/logs/`
- `workplaces/`
- `agent/logs/`
- `agent/screenshots/`
- `electron/dist/`
- `node_modules/`

默认可进 Git：

- `electron/src/`
- `runtime/src/`
- `agent/CLAUDE.md`
- `agent/skills/`
- `agent/tools/*.mjs`
- `config/`
- `scripts/`
- `docs/`
- `tests/test_project.py`

## 当前架构风险

1. 用户可见正式名已是奥德赛0.4.0-7171，但内部仓库、npm 包和部分运行态目录仍沿用 `vibeide` 作为工程代号；后续如要彻底迁移需单独设计兼容策略。
2. `tests/test_scaffold.py` 依赖旧 `src/coddecat`，与当前主线不一致。
3. 历史文档仍保留部分 `coffecat/coddecat` 迁移记录；这些只作为历史，不应作为当前实现依据。
4. Electron 侧和 Runtime 侧都有录制/回放实现，需要明确长期边界。
5. `runtime/workflows/` 默认忽略，若未来要内置示例 workflow，需要单独设计 `examples/workflows/`。
6. Monaco 完整语言与 Worker 会增加 renderer 产物体积；如后续关注首屏速度，应按实际使用语言继续拆包或延迟加载。
