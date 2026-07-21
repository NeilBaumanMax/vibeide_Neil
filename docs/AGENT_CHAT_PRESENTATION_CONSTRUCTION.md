# Agent 对话呈现施工文档

## 目标

Agent 对话区默认只突出用户问题、Agent 最终说明和需要用户处理的错误。PID、工具调用、工具结果、等待心跳与 Worker 状态仍保留给专业用户，但不再逐条淹没主要对话。

## 消息分层

主进程通过 IPC 保留 Agent stream-json 的语义类型，Renderer 统一映射为四类：

- `conversation`：面向用户的答复和未分类的关键错误，直接显示。
- `progress`：执行计划、Worker 阶段提示和自动返工状态。
- `detail`：PID、工具调用、工具结果、system 数据与 stderr。
- `status`：等待心跳和任务完成状态；同一任务只保留最新一条，避免轮询刷屏。

`progress`、`detail`、`status` 按 `taskId` 合并为一张“执行过程”折叠卡。默认收起；顶部“专业视图”开启后自动展开，并持久化到 `vibeide.chat.professionalView`。错误任务保留红色边界提示，未分类的 Worker/Agent 错误仍作为主要对话直接展示。

旧版左栏底部的独立“任务进度”步骤列表已取消。活动任务的阶段状态改为紧随当前“执行过程”的紧凑运行仪表盘，只显示当前阶段、总体进度和完成计数；任务暂停或结束后立即隐藏，不占用历史对话空间。

## Markdown 与安全边界

Agent 的 `conversation` 内容通过 `MarkdownContent.tsx` 渲染，支持标题、段落、粗体、行内代码、代码块、引用、列表、表格、分隔线和链接。

- 不使用 `dangerouslySetInnerHTML`，原始 HTML 只按文本显示。
- 链接只接受 `http:`、`https:` 和 `mailto:`。
- ANSI 控制序列和不可见控制字符在进入消息状态前清理。
- 工具结果最多保留 12 行，单行最多 1200 字符；完整构建/烧录输出继续以 Runtime 日志文件为准。

## 关键实现

- `electron/src/main/worker/chat-buffer.ts`：保留 stream-json 类型，裁剪工具摘要。
- `electron/src/main/worker/orchestrator.ts`：把消息类型、工具名和任务 ID 送入 IPC；工具细节不写入长期会话摘要。
- `electron/src/renderer/App.tsx`：清理控制字符、兼容旧消息分类、合并同任务等待状态。
- `electron/src/renderer/components/ChatPanel.tsx`：主对话、执行过程折叠和专业视图。
- `electron/src/renderer/components/TaskProgress.tsx`：仅在 Agent 工作时显示的紧凑运行仪表盘。
- `electron/src/renderer/components/MarkdownContent.tsx`：安全 React Markdown 渲染。
- `electron/src/renderer/styles/apple.less`：深浅主题、材质层级、键盘焦点与按压反馈。

## 验收

```powershell
npm.cmd --prefix electron run typecheck
npm.cmd --prefix electron run build:main
npm.cmd --prefix electron run build:renderer
npm.cmd --prefix electron run verify:chat-presentation
npm.cmd --prefix electron run smoke:chat-ui
git diff --check
```

界面验收至少确认：普通回复不显示 Markdown 源字符；同一任务的 PID、工具、结果和等待消息只占一张折叠卡；专业视图可展开且重载保持；独立“任务进度”面板不存在；运行仪表盘位于当前“执行过程”下方且只在 Agent 工作时出现；关键错误在折叠卡外可见；深色和浅色主题下代码块、链接与表格可读。
