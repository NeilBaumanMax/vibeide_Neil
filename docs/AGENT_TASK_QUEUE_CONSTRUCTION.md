# Agent 单活动任务与追加队列施工文档

## 目标

修复用户在 Agent 尚未完成当前回答时再次发送消息，Electron 又启动一条并发任务、覆盖当前任务状态的问题。对话体验应明确区分“继续指导当前任务”和“等待执行另一任务”。

## 用户语义

| 当前状态 | 操作 | 行为 |
| --- | --- | --- |
| 空闲 | 发送 | 立即创建活动任务并启动 Agent turn |
| 执行中 | 追加要求 | 保留当前 `taskId`，等当前 turn 或页面验收结束后继续同一任务 |
| 执行中 | 排队 | 创建新 `taskId`，进入 FIFO 独立任务队列 |
| 执行中 | 停止 | 终止活动 Agent，清空追加要求和独立任务队列 |

输入框使用 `Enter` 提交、`Shift+Enter` 换行，并避开中文输入法组合输入期间的误提交。

## 分层施工

### Renderer

- `ChatPanel.tsx` 根据 `AgentTaskStatus` 显示空闲、执行中或暂停。
- 忙碌时显示当前任务摘要、追加要求数量和排队数量。
- 普通提交在忙碌时使用 `guide`；独立按钮使用 `queue`；停止使用既有任务控制 IPC。

### Preload 与 Gateway

- `chat:send(text, mode)` 返回提交结果，包括 disposition、任务 ID、活动任务 ID和计数。
- `task:status` 支持首次查询，并通过事件持续推送状态变化。
- IPC 只负责边界与转发，调度真相保留在 Orchestrator。

### Orchestrator

- `currentTask/currentTaskId` 是唯一活动任务。
- `pendingGuidance` 保存当前任务追加要求，不能触发第二个并发 turn。
- `queuedTasks` 保存独立任务并按 FIFO 调度。
- `turnInFlight` 是 Agent 输入飞行锁；一次只能向持久 Agent 进程发送一个 prompt。
- Agent turn 完成后先处理追加要求，再执行页面验收；验收期间新到的追加要求也不能丢失。
- 活动任务完成、失败或异常退出后清理上下文，再启动下一队列项。
- 会话记录合并原始问题与本任务所有追加要求；消息、进度和完成事件带 `taskId`。

## 不变量

1. 忙碌时默认发送绝不调用第二次任务启动。
2. 追加要求不生成新的活动 `taskId`。
3. 排队任务在活动任务结束前不得启动。
4. 任务切换时不得复用上一任务的转录、重试计数或用户轮次。
5. 停止后队列必须为空，UI 必须收到空闲状态。
6. Agent 回调异常不得形成未处理 Promise rejection，也不得让 UI 永久保持忙碌。

## 验收

自动验证：

```powershell
npm.cmd --prefix electron run typecheck
npm.cmd --prefix electron run build:main
npm.cmd --prefix electron run build:renderer
npm.cmd --prefix electron run verify:task-queue
npm.cmd --prefix electron run verify:session
npm.cmd --prefix electron run verify:hardboard
git diff --check
```

手动验收建议：

1. 发送一个耗时任务，确认状态变为“执行中”。
2. Agent 输出未结束时输入补充条件并点“追加要求”，确认没有出现第二个并发活动任务，追加计数增加并在当前 turn 后被处理。
3. 再输入另一项无关工作并点“排队”，确认排队计数增加，当前任务结束后才开始。
4. 执行中点“停止”，确认当前 Agent 停止、排队清零并回到空闲。

自动烟测不发送真实 Agent 请求；发布前仍需在有效 API key 环境完成上述交互闭环。
