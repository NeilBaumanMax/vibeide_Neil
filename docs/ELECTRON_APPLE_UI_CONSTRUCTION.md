# Electron Apple 风格界面施工文档

## 当前基线

- 施工分支：`electron_design`
- 产品版本：`奥德赛1.0.0-7201`
- npm SemVer：`1.0.0-7201`
- Windows PE 四段版本：`1.0.0.7201`
- 唯一施工目录：`E:\Agent\vibeide\vibeide`
- 生效样式：`electron/src/renderer/styles/global.less` 基础布局 + `apple.less` 最终覆盖
- 近期已落地本地基线：`9848c33`（主题入口）、`5493f39`（packaged 工作台路径）和 `3c091ec`（任务页比例）；动态 HEAD 以 `git log -1` 为准，不在施工文档中长期写死

本轮完全放弃 NES.css、像素字体、硬边框和蓝白机视觉。界面采用系统字体、冷色上下文色、克制的半透明材质、弱分隔线、圆角控件、直接按压反馈和减少动态效果适配。

## 设计原则

1. 正文默认不小于 15px，常用控件不小于 14px，元信息不小于 13px。
2. 关键功能使用冷蓝或各页面的冷色上下文色；红色仅表示失败、删除等破坏性语义。
3. 不用高饱和绿色表示普通成功或强调。成功主要依靠文字、图标、位置和低饱和状态底色。
4. 主面板通过材质、明度和留白分层，避免“框中框”；仅保留必要的分隔线和焦点轮廓。
5. 动效必须短、可中断，并遵守 `prefers-reduced-motion` 与 `prefers-reduced-transparency`。
6. 反馈与触发控件保持空间邻近。清除、保存、打开目录等操作不得只在窗口底部反馈。
7. 可拖动控件使用 Pointer Capture 进行 1:1 跟随，设置移动阈值避免拖动误触点击，并把最终位置约束在可视窗口内。

## 页面现状

### 全局与 Agent 对话

- 左右栏使用可拖动分隔条和 Pointer Capture，宽度可持久化。
- 对话区和右侧工作区取消多层粗边框，改用不同表面明度区分层级。
- 深色模式使用高对比正文和低对比辅助文字，避免文字与背景粘连。
- 应用不再持续跟随 `prefers-color-scheme`。首次无用户记录时读取一次系统偏好，之后由右下角“外观”菜单显式选择深色/浅色，并通过 `vibeide.appearance.theme` 持久化。
- 外观按钮可在窗口内自由拖动，位置保存到 `vibeide.appearance.position`；默认位置位于编辑器字号工具条上方，窗口缩放时自动回到安全边界。
- 外观浮层根据按钮所在象限自动选择上下展开及左右对齐，避免拖到窗口边缘后菜单越界；拖动期间关闭浮层，普通点击才切换菜单。

### 仓库

- 固定显示 Agent 生成、硬件工程、参考代码、Skills 四个仓库，不再提供“导入文件夹”。
- 每个仓库标题区提供“在资源管理器中打开”，通过受限 IPC 校验路径后调用 Electron `shell.openPath`。
- 打包版 Skills 根目录必须通过 `getAgentDir()` 解析为 `resources/agent/skills`，不得从 `win-unpacked/agent/skills` 手工拼接；工作台允许范围只包含 Agent 工作区、硬件目录、Skills/Tools、文档、录制与工作流等明确根目录，不把整个安装根目录设为可写范围。
- 打开目录的结果只显示可收缩的成功/失败状态，完整路径或错误放在 `title` 提示中；仓库标题正文设置 `min-width: 0`，长错误不得挤压成竖排。
- 文件仍可进入浏览工作台或编辑器；刷新目录保留。

### Agent 对话

- 普通视图只突出用户输入、Agent 回复和需要用户处理的错误；PID、工具、诊断与状态按任务收进“执行过程”。
- 对话区采用 144px 历史侧栏 + 弹性主对话布局；侧栏可从标题栏收起，使用轻材质区分层级，不改变右侧仓库/监视器/任务/编辑器工作区。
- 历史项只显示标题、时间和消息数；删除按钮在 hover/选中时出现并提供行内二次确认，Agent 工作时禁用新建、切换和删除。
- 旧独立任务步骤列表不再占据左栏；当前阶段以紧凑仪表盘贴在活动“执行过程”下方，只在 Agent 工作时出现，暂停和完成后移除。
- “执行过程”使用原生 `details/summary`，点击反馈即时、支持键盘焦点；专业视图开启后自动展开并记住选择。
- Agent Markdown 使用主题排版令牌呈现标题、列表、代码、引用和表格；不执行原始 HTML，链接协议受限。
- 折叠卡、代码块和表格同时适配深色/浅色主题；执行错误只用克制的红色边界提示，不用大面积警示色。

### 监视器

- 后端固定使用随包 `runtime/python/Scripts/python.exe` 的 `pyserial`，同一个子进程负责读取与写入，字节经主进程 IPC 双向传递。
- Windows 设备枚举优先使用 UTF-8 PowerShell/CIM；权限不足或返回空时自动回退到 `serial.tools.list_ports`，避免安装后串口下拉为空。
- 页面保留传统串口助手的熟悉布局：左侧为接收区和发送区，右侧为串口配置、接收区配置、发送区配置。原数值趋势图、数字采样和跨行缓存已删除。
- 支持波特率、数据位、停止位、校验位、文本/HEX 收发、GBK/UTF-8/ASCII/Latin1，以及不追加/LF/CRLF 行尾。
- 重开端口前等待旧 Python 子进程退出，降低 COM 独占释放竞态；端口被其他程序占用时输出可读中文提示。
- 串口页不再强制 WinForms 浅色。布局保持不变，颜色、卡片材质、圆角、主次按钮、危险操作和连接状态使用 `apple.less` 主题变量，随应用内浅色/深色选择适配。
- 按钮按下即时缩放；连接状态使用带圆点的状态胶囊和 `aria-live="polite"`。同时覆盖 `prefers-reduced-motion`、`prefers-reduced-transparency` 与 `prefers-contrast`。

### 任务管理器

- Build/Flash 先选择 `hardboard/projects/<project>`，工程与串口下拉保留系统指示器；Build 第二列为“刷新工程”，Flash 第二列为“刷新设备”。
- Build/Flash 左侧英文标识使用透明底次级文字；等待、需输入、运行、完成、失败状态使用内容宽度胶囊和灰/橙/蓝/绿/红语义圆点，不再显示成浅蓝色只读输入框。
- 任务页使用舒展但不改列结构的桌面尺度：标题区至少 44px、Build/Flash 行至少 56px、主要控件 40px；诊断工具条与任务结果表头同步增加留白，窄窗口仍沿用既有响应式规则。
- 最近任务表提高字体、正文对比度和状态辨识度。
- “清除记录”会立即清空当前历史视图，并通过 Runtime 删除 EventBus 历史和 Hardboard `.log` 文件。
- 清除不再被残留 PID 或 `running` 状态拒绝；运行中的任务在清除后产生的新事件仍会继续显示。
- 清除进度和结果显示在标题栏按钮旁，不回滚用户已经清除的旧记录。

### 编辑器

- Monaco 多标签页使用类似 Edge 的等宽弹性分配，标签设最小/最大宽度。
- 未打开文件时，标签栏提示、当前路径和编辑器空状态必须使用主题文字令牌；不得继承旧版固定深色，使深色背景上的辅助说明保持可读。
- 关闭按钮具有圆形 hover/focus 高亮与按压反馈。
- 文件树右键菜单通过 React Portal 挂载到 `document.body`，使用视口坐标定位在鼠标附近并做边缘约束。
- 右下角字号控件改为圆角按钮组，蓝色按钮替代像素式方框。
- 全局外观按钮默认上移避开字号控件；如果仍与用户工作区冲突，可直接拖到其他位置，重启后保持。

## 关键实现

- `electron/src/renderer/styles/apple.less`：Apple 风格材质、排版、颜色、动效和无障碍覆盖。
- `electron/src/renderer/App.tsx`：显式主题状态、主题/悬浮坐标持久化、外观菜单、拖动手势与窗口边界约束。
- `electron/src/renderer/components/BrowserPanel.tsx`：四页面交互、任务清除、双向串口助手、编辑器标签和右键菜单。
- `electron/src/renderer/components/WorkspacePanel.tsx`：四仓库与资源管理器入口。
- `electron/src/main/gateway.ts` / `preload/index.ts`：受限文件夹打开和硬件 IPC。
- `electron/src/main/hardboard.ts`：真实双向串口服务、设备枚举回退、Runtime 历史清理与 Build/Flash 桥接。
- `runtime/src/eventbus/event-store.ts`：EventBus 与 `.log` 物理清理。

## 验收

```powershell
npm.cmd --prefix runtime run verify:event-clear
npm.cmd --prefix electron run typecheck
npm.cmd --prefix electron run build:main
npm.cmd --prefix electron run build:renderer
npm.cmd --prefix electron run verify:version
git diff --check
```

界面验收至少确认：只有一个 Electron 主窗口；四个仓库按钮存在；打包版 Skills 路径包含 `resources/agent/skills` 且可由资源管理器打开，打开结果不挤压仓库标题；Build/Flash 刷新按钮和语义状态胶囊存在；清除前后的任务行数归零；监视器没有趋势图且左侧收发/右侧配置布局不变；应用内浅色/深色切换后控件可读且重载保持；外观按钮可拖动、重载保持位置、窗口缩放不越界，浮层在四个象限均不超出视口；外观按钮不遮挡编辑器字号工具条；COM 设备可枚举、打开后可关闭释放；编辑器右键菜单贴近指针；标签关闭按钮可见且有 hover/focus 反馈。
