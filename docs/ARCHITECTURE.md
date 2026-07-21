# 架构说明

## 一句话

`Catnip Forge`（中文全称：Catnip 硬件智能开发平台；英文定位：Autonomous Hardware Development Agent）是一个 Electron 桌面硬件开发 IDE：用户在左侧对话，右侧提供 Skill/工程资源仓库、串口监视器、任务管理器和编辑器；浏览器工作台后端暂时保留。任务由 Worker 编排，Agent 通过 Runtime MCP tools 控制同一个 Electron Chromium。

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

- 创建品牌启动窗口和隐藏的主窗口；真实加载节点驱动启动进度，主窗口 `ready-to-show` 后完成双窗口切换。
- 暴露 CDP 端口 `9230`。
- 管理右侧 `WebContentsView` 浏览页和 tabs。
- 提供 Renderer 到 Worker 的 IPC。
- 通过 `task:status` 向 Renderer 暴露当前活动任务、暂停状态、追加要求数和独立排队数。
- 桥接浏览器录制、回放、编辑器目录读取和受限文件操作。

关键文件：

- `electron/src/main/index.ts`：应用启动、Splash/主窗口切换、CDP、生命周期。
- `electron/assets/splash.html`：不依赖 Renderer bundle 的品牌启动页，使用随包 `splash-*.png` 素材并响应主进程进度更新。
- `electron/src/main/gateway.ts`：IPC 注册，唯一入口。
- `electron/src/main/browser-view.ts`：右侧 WebContentsView tabs、持久 session、bounds 同步。
- `electron/src/main/browser-recorder.ts`：Electron 侧录制和回放。
- `electron/src/main/workbench.ts`：提供 Agent 工作区、硬件工程、参考代码和 Skills 四个受控根目录及编辑器文件系统边界；仓库概览前端不展示 Agent 工作区卡片。打包资源通过 `getAgentDir()`、`getResourcesDir()`、`getHardboardDir()` 解析，Skills 位于 `resources/agent/skills`。
- `electron/src/main/skill-manager.ts`：把固定 `resources/agent/skills` 源仓库中的标准目录和历史扁平 Markdown 统一部署到 Agent 工作区 `.claude/skills`；提供校验、清单式安全清理、同名冲突保护和仓库页 CRUD。
- `electron/src/main/hardboard.ts`：硬件设备枚举、真实 `pyserial` 双向串口服务、Runtime EventBus、日志历史清理、Build/Flash 的 IPC 桥接。
- `electron/src/main/paths.ts`：开发版与 packaged 环境的资源、Runtime、Agent 和 API key 路径解析。
- `electron/src/main/first-run.ts`：校验并保存 DeepSeek API Key；无 Key 时通过 Preload/IPC 向 Renderer 提供首次启动状态，Renderer 显示阻塞式配置窗口。保存成功后主进程调度一次 `app.relaunch()`，先走统一退出清理再自动重启，使 Agent 从新进程读取 Key。
- `electron/src/main/agent.ts`：Claude Agent 进程、动态 MCP 配置和生命周期管理。
- `electron/src/main/software-assistant.ts`：独立的软件使用问答通道；复用本地 DeepSeek Key，通过 OpenAI Chat Completions 接口调用 `deepseek-v4-flash`。每次请求重新读取 `CATNIP_FORGE_USER_GUIDE.md` 并与固定安全规则组合为系统提示词，限制上下文长度和回答边界，不进入硬件 Agent 队列。
- `electron/CATNIP_FORGE_USER_GUIDE.md`：猫薄荷的可维护产品知识母版；发布后位于 `resources` 根目录、app.asar 外，修改后下一次提问立即生效。
- `electron/src/main/tray.ts`：Windows 系统托盘和窗口显隐。
- `electron/src/main/worker/session-store.ts`：v2 多会话索引、完整 UI 消息、精简 Agent 轮次、旧单会话迁移和重启恢复；成品数据位于用户目录，不写入安装资源。
- `electron/src/renderer/App.tsx`：主 UI 状态、左右面板宽度持久化、拖动分隔和对话区收起/展开；同时管理独立于系统实时偏好的深色/浅色主题、可拖动“猫薄荷”助手坐标、微型帮助会话，以及 Agent 消息清理、分类和等待状态聚合。
- `electron/src/renderer/components/ChatPanel.tsx`：左侧历史会话栏与右侧 Agent 对话；支持新建、切换、收起，以及“⋯”菜单中的重命名、置顶和带确认删除，同时负责主要回复、执行过程和专业视图。
- `electron/src/renderer/components/TaskProgress.tsx`：当前任务的紧凑运行仪表盘，挂在活动“执行过程”下方且只在 Agent 工作期间呈现，不再作为左栏独立面板。
- `electron/src/renderer/components/MarkdownContent.tsx`：把 Agent Markdown 安全渲染为 React 节点，不执行原始 HTML，并限制外部链接协议。
- `electron/src/renderer/components/BrowserPanel.tsx`：仓库、监视器、任务管理器和编辑器；工作台前端入口隐藏，但组件内部浏览器工作台实现保留。任务管理器负责工程/设备刷新、相对工程选择、Build/Flash 控制、语义状态胶囊、可直接清除的 EventBus 历史和最近任务结果；监视器提供文本/HEX 双向收发及完整串口参数；编辑器负责多根资源树、懒加载目录、等宽标签、Portal 右键菜单、字号持久化和保存状态同步。
- `electron/src/renderer/components/WorkspacePanel.tsx`：显示硬件工程、参考代码和 Skills 三类资源，不显示 Agent 生成卡片；Skills 卡片可新增、编辑、回收站删除、同步并查看源仓库可写/部署状态。
- `electron/src/renderer/components/ChatPanel.tsx`：对话输入区提供 Skills 按钮和选择弹层；选中项以标签进入输入区，发送时自动注入对应 `/skill-id`，无需用户记忆或手工输入命令。
- `electron/src/renderer/styles/apple.less`：1.0.0-7201 最终视觉覆盖，使用 `data-theme="dark|light"` 定义显式主题令牌，并提供冷色材质、排版层级、圆角、可拖动助手浮层、反馈动效和 reduced-motion/reduced-transparency 适配。
- `electron/src/renderer/components/CodeEditor.tsx`：基于 Monaco Editor 的代码区，按扩展名选择 C/C++、CMake、Markdown、JSON、TypeScript 等语言，使用内置 C/C++ 深色主题并接收用户字号设置。
- `electron/src/renderer/monaco.ts`：本地 Monaco editor/json/css/html/typescript Worker 注册，保证开发版和打包版不依赖在线 CDN。

## Worker 层

位置：`electron/src/main/worker/`

职责：

- 接收用户任务。
- 同一时间只允许一个活动 Agent turn；执行中的普通发送作为当前任务追加要求，只有显式选择“排队”才创建下一项独立任务。
- 优先处理本地快捷任务。
- 对搜索/整理/排行类任务做平台 URL 预处理。
- 根据任务推荐已部署的原生 Skill，构造简短调用提示，不再注入整篇 Skill 文档。
- 拉起或停止 Agent 进程。
- 解析 Agent stream-json 输出并推送给 UI。
- 对 HTML 游戏类任务做页面验收和自动返工。

关键文件：

- `orchestrator.ts`：任务主流程、单活动任务约束、追加要求缓冲、独立任务 FIFO 队列和 `taskId` 关联。
- `context.ts`：根据任务推荐 `agent/skills` 中的原生 Skill 命令并生成 prompt；硬件规则要求明确硬件上下文，避免普通“编译”误触发。
- `search-preflight.ts`：平台搜索预处理。
- `quick-tasks.ts`：本地快捷能力。
- `chat-buffer.ts`：Agent stream-json 输出解析、消息语义类型保留和工具结果摘要裁剪。
- `task-state.ts`：任务进度状态机。
- `page-validator.ts`：HTML 页面/游戏验收。

### Agent 任务提交与调度

- Gateway 通过 `task:status` 向 Renderer 暴露当前活动任务、暂停状态、追加要求数和独立排队数。
- Orchestrator 同一时间只允许一个活动 Agent turn，并用 `currentTaskId` 关联消息、进度与完成事件。
- 空闲时发送会立即启动任务；执行中“追加要求”保留在当前任务下，等当前 turn 或页面验收结束后继续执行。
- 执行中“排队”会创建新的 `taskId`，等待当前任务完成或失败后按 FIFO 顺序启动。
- 停止会终止当前 Agent 并清空等待队列，避免旧任务状态泄漏到后续任务。

对应实现集中在 `orchestrator.ts`，Renderer 状态与操作位于 `App.tsx` 和 `ChatPanel.tsx`。详细施工和验收见 `AGENT_TASK_QUEUE_CONSTRUCTION.md`。

### Agent 对话呈现

- `conversation` 作为产品主对话直接显示；`progress`、`detail`、`status` 按任务合并为“执行过程”。
- 同一任务的等待心跳只更新原状态，不持续追加消息。
- 专业视图保留工具和诊断可见性，默认视图减少过程噪声。
- 工具调用和 system 输出不再写入持久化的 Agent 回复摘要，避免下一轮上下文继续携带日志。

详细规则见 `AGENT_CHAT_PRESENTATION_CONSTRUCTION.md`。

### Agent 历史会话

- Gateway 持久化用户消息和每条流式 Agent 消息，并把 `conversationId` 返回 Renderer。
- Agent 工作期间禁止切换会话；切换后终止旧常驻 Agent，下一任务只注入所选会话最近上下文。
- 旧版单 `session.json` 自动迁移为 v2 会话集合，UI 消息和用于推理的精简轮次分别限量。

详细规则见 `AGENT_CONVERSATION_HISTORY_CONSTRUCTION.md`。

## Agent 层

位置：`agent/`

职责：

- 作为 Claude Code 工作区运行。
- 根据 `agent/CLAUDE.md` 和工作区 `.claude/skills` 中按需加载的原生 Skill 执行任务。
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
- `runtime/src/hardboard/env.ts`：ESP-IDF 环境和随包 Python 解析；Windows 只选择 `runtime/python/Scripts/python.exe`（开发版对应 `_bundled/python/Scripts/python.exe`），不使用旧机器 venv。
- `runtime/src/eventbus/event-store.ts`：EventBus JSONL 和最近状态持久化；删除历史事件与 Hardboard `.log` 文件，不再因残留运行状态拒绝用户清除。
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

1. 用户可见正式名已是 Catnip Forge，但内部仓库、npm 包和部分运行态目录仍沿用 `vibeide` 作为工程代号与数据兼容键；不应直接改名，否则可能导致历史会话和设置迁移中断。
2. `tests/test_scaffold.py` 依赖旧 `src/coddecat`，与当前主线不一致。
3. 历史文档仍保留部分 `coffecat/coddecat` 迁移记录；这些只作为历史，不应作为当前实现依据。
4. Electron 侧和 Runtime 侧都有录制/回放实现，需要明确长期边界。
5. `runtime/workflows/` 默认忽略，若未来要内置示例 workflow，需要单独设计 `examples/workflows/`。
6. Monaco 完整语言与 Worker 会增加 renderer 产物体积；如后续关注首屏速度，应按实际使用语言继续拆包或延迟加载。
