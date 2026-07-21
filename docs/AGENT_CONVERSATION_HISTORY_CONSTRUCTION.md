# Agent 历史对话施工文档

## 目标

用户可以把不同工程放在不同对话中，关闭并重新打开 Catnip Forge 后仍能查看原消息，并从选中的历史对话继续让 Agent 工作。

## 产品行为

- Agent 对话区左侧显示历史会话，右侧保持现有消息、执行过程、运行仪表盘和输入框。
- 首条用户消息自动成为会话标题，侧栏同时显示更新时间和消息数量。
- 支持新建、切换和收起侧栏；每个标签右侧的“⋯”编辑菜单提供重命名、置顶/取消置顶和带二次确认的删除，删除最后一段对话时会自动创建空白新对话。
- 置顶状态与名称随会话持久化；置顶项始终排在普通对话之前，同组内按最近更新时间排序。
- 编辑菜单锚定“⋯”按钮：首项固定向下展开，只有非首项的末两项向上避让列表底边，避免唯一会话的菜单被历史栏标题遮挡。
- Agent 工作期间锁定新建、切换、重命名、置顶和删除，避免流式输出写入错误工程。
- 切换对话时重置底层常驻 Agent 进程，再用所选会话的历史摘要启动，防止两个工程的隐式模型上下文串线。

## 持久化与迁移

开发版存储在 `runtime/claude-session/session.json`；Windows 成品存储在 `%APPDATA%/@vibeide/electron/runtime-data/claude-session/session.json`。

v2 数据包含：

- 当前活动会话 ID；
- 最多 50 个会话；
- 每个会话最多 500 条 UI 消息；
- 每个会话最多 24 轮用于 Agent 上下文的精简问答；
- 标题、置顶状态、创建/更新时间、任务 ID、消息类别、错误状态和工具名。

旧版单会话 `session.json` 首次加载时自动迁移为一个历史会话，并把已有问答恢复为可见消息。API key、进程环境和完整构建日志不写入会话文件。

## 上下文连续性

`Orchestrator` 不再只记录 session ID。每次新任务开始时调用 `buildClaudeSessionContext(conversationId)`，把用户主动选择的会话最近 10 轮放入 Agent 提示词，然后再附加当前任务和相关 Skills。

UI 可见消息与模型上下文使用同一个 `conversationId`，但工具细节仍不进入长期问答摘要，避免日志污染后续推理。

## 关键实现

- `electron/src/main/worker/session-store.ts`：v2 多会话数据、旧格式迁移、消息/轮次限制、重命名、置顶和增删查切换。
- `electron/src/main/worker/orchestrator.ts`：任务绑定会话、历史上下文注入和切换时 Agent 重置。
- `electron/src/main/gateway.ts` / `preload/index.ts`：会话 IPC 与流式 Agent 消息持久化。
- `electron/src/renderer/App.tsx`：启动恢复、活动会话状态和操作编排。
- `electron/src/renderer/components/ChatPanel.tsx`：历史侧栏、新建、切换、锚定编辑菜单、原位重命名和删除确认。
- `electron/src/renderer/styles/apple.less`：可收起侧栏、主题材质、焦点和按压反馈。

## 验收

```powershell
npm.cmd --prefix electron run typecheck
npm.cmd --prefix electron run build:main
npm.cmd --prefix electron run build:renderer
npm.cmd --prefix electron run verify:session
npm.cmd --prefix electron run verify:task-queue
npm.cmd --prefix electron run smoke:chat-ui
git diff --check
```

成品验收至少确认：旧单会话完成 v2 迁移；新建后侧栏增加一项；切换后右侧消息同步变化；“⋯”菜单可重命名和置顶且首项向下展开不被遮挡；删除需要二次确认；关闭并重启后会话数量、名称、置顶状态、活动项和消息仍恢复；从历史会话发起任务时 Agent 提示词只包含该会话上下文。
