# Runtime Task Manager UI 施工文档

## 2026-07-20 · 1.0.0-7201 当前实现

> 本节是当前施工真相。后续 2026-07-17、2026-06-29 内容保留为历史演进记录，若与本节冲突，以本节和 `ELECTRON_APPLE_UI_CONSTRUCTION.md` 为准。

- 当前分支为 `electron_design`，可见页签为仓库、监视器、任务管理器、编辑器；浏览器工作台前端入口隐藏。
- 界面已全面放弃 NES/像素风，使用 Apple 风格冷色材质、系统字体、弱分隔和邻近反馈。
- 仓库固定为 Agent 生成、硬件工程、参考代码、Skills 四组；不再提供导入/移除，每组可以在资源管理器中打开。
- 任务管理器保持相对工程选择和 Build/Flash 两行控制；项目与串口使用带原生指示器的下拉框。
- 最近任务按 `taskId` 聚合。清除会立即从 UI 移除旧记录，并删除 EventBus `events.jsonl` 与 Hardboard `.log`；残留 PID 或 `running` 状态不再拒绝清除，运行任务之后产生的新事件继续显示。
- 监视器后端是真实双向 `pyserial` 服务，使用左侧接收/发送、右侧配置布局，支持完整串口参数及文本/HEX 收发；原数值趋势图已删除。Windows CIM 枚举失败时回退到随包 `pyserial`。
- 编辑器标签等宽弹性分配，关闭按钮有 hover/focus 反馈；右键菜单用 Portal 和视口坐标定位在指针附近。
- 当前版本：npm `1.0.0-7201`、PE `1.0.0.7201`、产品名 `奥德赛1.0.0-7201`。

## 历史目标

本节记录任务管理器最初落地时的目标；当前可执行文件为 `win-unpacked/奥德赛1.0.0-7201.exe`，当前实现以上方 2026-07-20/21 基线为准。

## 2026-07-18 编辑器历史实现

> 本节记录 1.0.0-7201 之前的编辑器基线；其中用户导入目录等描述已被当前固定四仓库方案取代。

- 左侧文件资源管理器直接复用仓库的 Agent 生成、硬件工程、参考代码、Skills 和用户导入目录作为多根工作区；目录按需通过 `workbench:listDirectory` 懒加载，并过滤 `.git`、`node_modules`、build、dist 等内容。
- 右侧上方保留多文件标签、当前绝对路径和保存按钮，下方改用 Monaco Editor；`Ctrl+S`、未保存标记、切换标签、关闭标签和保存结果提示继续生效。
- Monaco、C/C++/Markdown/JSON/TypeScript 等语言定义及 editor/json/css/html/typescript Worker 均打进 renderer，本地开发和 packaged 环境不从 CDN 下载资源。
- C/C++ 使用内置深色主题；CMake 额外注册基础 Monarch tokenizer。编辑区显示行号、括号配色、代码缩略图、选择高亮和缩进辅助线。
- 编辑器底部提供 10–24px 字号减小、增大和重置，用户上次字号保存到 `localStorage`。
- 文件或目录右键提供新建文件、新建文件夹、重命名、刷新和“移到系统回收站”；新建、重命名和删除确认使用软件内置对话框，不依赖 Electron 原生 `prompt/confirm`。
- 重命名目录时同步更新已打开标签和展开路径；删除时关闭目标范围内的标签。所有修改经 Preload/Gateway 进入主进程 `workbench.ts`。
- 主进程校验允许根目录、名称和同名冲突，禁止重命名/删除资源管理器根目录；删除调用 Electron `shell.trashItem`，不直接永久擦除。
- 功能基线：`5afcef3 feat(electron): add vscode-style project editor`；交互修复：`63992ea fix(electron): add editor controls and file dialogs`。

## 2026-07-17 历史实现（已被 1.0.0-7201 取代）

> 本节描述最初在 `electron_fix_neil` 落地、随后由 `agent_task_queue_fix` 继承的历史任务管理器实现。下方“用户反馈对应要求”和 2026-06-29 打包记录仅作为历史施工依据，不得覆盖上方 1.0.0-7201 当前实现。

- 当前右侧可见页签为“仓库、监视器、任务管理器、编辑器”；工作台前端入口隐藏，但 React、IPC、`WebContentsView` 和主进程后端链路保留。
- 左侧对话区默认占 34%，支持拖动分隔条、键盘左右调整、收起/展开，并用 `localStorage` 保存宽度。
- 正文、按钮、标签、代码和日志完成可读性调整；中文正文使用系统字体，日志和代码使用等宽字体，控件尺寸同步增大以避免文字溢出。
- 任务管理器先选择 `hardboard/projects/<project>` 相对工程路径，再执行 Build/Flash。Build 和 Flash 固定为对齐的六列控制行，分别显示状态和进度；Flash 行提供串口选择与设备刷新。
- 工程下拉项由主进程枚举 `runtime/hardboard/projects` 目录提供。主进程保留安全的 `hardboard/projects/<name>` 相对引用，交给 runtime 按开发版或 packaged 环境解析。
- 删除旧的 CMake/config/source/artifact 选择器、源码预览和 PID/Task/Tool/Port/Project/Current 摘要块，避免用户先选文件再选工作目录的倒置流程。
- 实时日志、完整日志和事件卡片改为按按钮打开的诊断卡片，给页面下半区留出任务结果空间；各视图均提供统一的运行历史清除入口。
- “最近任务与结果”按 `taskId` 聚合 Build/Flash，显示状态、工程、端口、开始时间、耗时、退出码和日志入口；成功为绿色、失败为红色，列表固定表头并可滚动，也提供同一个运行历史清除入口。
- 点击任务“查看”会打开完整日志，按 `taskId` 定位该任务的日志段并自动滚动；失败日志红色高亮、成功日志绿色高亮，其余状态使用各自颜色。
- 历史行为（已废止）：Renderer 最多保留最近 500 条 Runtime 事件用于完整日志和任务结果；清除通过 IPC 删除 `events.jsonl`、重置 `state.json` 并删除 `hardboard/logs` 下的 `.log` 文件，但当时 Build/Flash 期间会禁用。1.0.0-7201 已改为上方的直接清除语义。

## 历史用户反馈对应要求

- 编译过程数据必须实时显示，不能只在 Agent 最后回复里出现。
- runtime 消息订阅必须可见：stdout / stderr / tool event / pid / 串口 / 报错都要进入 UI。
- 右侧工作区需要四个明确入口：工作台、仓库、监视器、任务管理器。
- 工作台可点击待编译文件，底部原浏览器区域用于显示当前要烧录/编译的代码。
- build / flash 控制拆成两行：
  - build 行：选择工程、CMake 文件、sdkconfig / sdkconfig.defaults、源码文件，保留进度条。
  - flash 行：选择工程、烧录配置/产物、串口，保留进度条和错误输出。
- 仓库只显示高价值文件：
  - skills
  - Agent 生成文件
  - Agent 构建的硬件文件
  - 参考代码
  - 施工文档
- HTML 文件点击后在工作台浏览器运行。
- C / H / CMake / Markdown / skills 文档可以预览和修改。
- 当时要求监视器同时显示曲线和 runtime 日志；当前已改为独立双向串口助手，曲线删除，runtime 日志集中到任务管理器。
- 新增任务管理器，显示 runtime 消息、当前进程 pid、MCP 工具、build/flash 端口、错误和事件流。

## UI 结构

```text
BrowserPanel
  tabs:
    工作台
    仓库
    监视器
    任务管理器
    编辑器
```

### 工作台

工作台用于“当前要编译/烧录什么代码”的高密度视图：

```text
Build row:
  工程 select / input
  CMake select
  配置 select
  源码 select
  Build button
  progress bar

Flash row:
  工程 select / input
  产物 select
  串口 select
  Flash button
  progress bar

Code preview:
  当前源码 / CMake / config 摘要
```

### 仓库

仓库只保留筛选后的重要入口。点击规则：

- `.html` / `.htm`：调用现有 `openWorkbenchItem`，在 BrowserView 中打开。
- `.c` / `.h` / `.cpp` / `CMakeLists.txt` / `.md` / `.json` / `.txt`：切到独立“编辑器”页读取、预览、修改。
- 目录：打开目录或刷新列表。

### 编辑器

编辑器是独立页签，不挤在工作台或仓库里。当前实现为左侧多根文件树、右上多文件标签、右下 Monaco 代码区和底部字号/状态栏；用于阅读、创建、重命名和修改 C / H / C++ / CMake / sdkconfig / Markdown / skills / JSON / YAML / TXT 等文本文件。删除动作进入系统回收站，工作区根目录受保护。

### 监视器

当前监视器是独立串口助手，不混入任务管理器日志：

```text
左侧：接收区 / 发送区
右侧：串口配置 / 接收区配置 / 发送区配置
后端：随包 Python + pyserial 双向子进程
```

Build/Flash、MCP tool、runtime stdout/stderr 和任务结果继续由“任务管理器”页承载。下方历史章节中“串口曲线”或“监视器同时显示 runtime 日志”的描述仅代表早期需求，不是 1.0.0-7201 当前实现。

### 任务管理器

任务管理器是 eventbus consumer 的主视图：

```text
current:
  pid
  taskId
  toolName
  phase/status
  port
  project
  current file

events:
  task.created
  task.started
  tool.started
  process.started(pid)
  process.stdout/stderr
  hardboard.build.progress/file
  hardboard.flash.progress/file
  process.exited
  task.completed/failed
```

## Electron IPC

新增或完善：

```text
hardboard:runtimeEvents(sinceSeq)
hardboard:buildStart({ projectDir, cmakeFile, configFile, sourceFile })
hardboard:flashStart({ projectDir, port, artifactFile, configFile })
workbench:getOverview()
workbench:readFile(path)
workbench:writeFile(path, text)
workbench:openItem(path)
```

## 验收

必须验证：

```bash
npm --prefix runtime run build
npm --prefix electron run typecheck
npm --prefix electron run build:main
npm --prefix electron run build:renderer
```

打包给用户只以中间目录为准：

```bash
node node_modules/electron-builder/cli.js --win --x64 --dir
```

如果 Linux 上最后仍因 wine 签名失败，只要 `dist-package/win-unpacked/奥德赛0.0.exe` 已生成，就以该目录作为测试对象。

## 2026-06-29 历史打包验收记录

> 本节是 Runtime UI v2 阶段的历史记录，已被 Windows 0.1 E 盘包取代。当前可测对象见 `docs/WINDOWS_0_1_TEST_REPORT.md`：`E:\vibeide-0.1-win-unpacked\奥德赛0.0.exe`，PE 版本为 `0.1.0`。

本轮最终交付对象是用户实际测试的原始 unpacked 目录：

```text
electron/dist-package/win-unpacked/
electron/dist-package/win-unpacked/奥德赛0.0.exe
```

为避免继续混用旧目录，也曾额外生成带版本名的新 unpacked 目录：

```text
electron/dist-package/奥德赛0.0-runtime-ui-v2-win-unpacked/
electron/dist-package/奥德赛0.0-runtime-ui-v2-win-unpacked/奥德赛0.0.exe
electron/dist-package/奥德赛0.0-runtime-ui-v2-win-unpacked.zip
```

新版 UI 在窗口顶部页签区和工作台标题中显示：

```text
Runtime UI v2 · 2026-06-29 19:05
```

如果用户正在验证 0.1 包，不再用这个标识作为判断标准，应改看 exe PE 版本 `0.1.0` 和 `docs/WINDOWS_0_1_TEST_REPORT.md`。

已执行验证：

```bash
npm --prefix electron run typecheck
npm --prefix electron run build:renderer
npm --prefix runtime run build
npm --prefix electron run build:main
npm --prefix electron run pack:win
npm --prefix electron run stamp:win
npm --prefix electron run smoke:workbench
```

并解包检查 `resources/app.asar`，确认 renderer bundle 内含：

```text
Runtime UI v2 · 2026-06-29 19:05
任务管理器
编辑器
硬件编译/烧录工作台
```

备注：Linux 环境的 `electron-builder --win --x64 --dir` 仍会在最终 Windows 签名阶段因为缺少 Wine 失败，但失败前已经刷新 `dist-package/win-unpacked/resources/app.asar` 和 `resources/runtime/dist`。本轮最终交付的可测对象是原始 `electron/dist-package/win-unpacked/奥德赛0.0.exe`。

2026-06-29 19:13 追加：

- 已直接刷新 `electron/dist-package/win-unpacked` 原目录，不再只交付旁边复制目录。
- 新增 `electron/scripts/stamp_win_exe_version.cjs`，用 `resedit` 写 Windows PE 版本资源，不依赖 Wine。
- 新增 `electron/scripts/pack_win_unpacked.cjs`，让 `npm --prefix electron run pack:win` 在 Linux 上即使最后 Wine 签名失败，也会在 `win-unpacked` 已生成后继续写 exe 版本资源并返回成功。
- 已验证 `electron/dist-package/win-unpacked/奥德赛0.0.exe` 文件属性：

```text
ProductName: 奥德赛0.0
FileDescription: 奥德赛0.0 Runtime Workbench
FileVersion: 0.3.0
ProductVersion: 0.3.0
```

- 已验证原目录 `resources/runtime/dist/hardboard/runner.js` 包含早期失败事件写入逻辑，`resources/app.asar` 包含 `resolveSelectedProjectDir` 和 Runtime UI v2 前端。
- 当前 0.1 包已在 Windows 上重新打包并迁移到 `E:\vibeide-0.1-win-unpacked`，不要继续把上面的 0.3.0 历史版本当成当前交付版本。
