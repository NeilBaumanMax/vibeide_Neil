# Runtime Task Manager UI 施工文档

## 目标

本轮不是继续隐藏式接入 runtime eventbus，而是把编译、烧录、MCP 工具调用和进程状态真正显示到 Electron 里，让用户在 `win-unpacked/奥德赛0.0.exe` 中能直接看到 runtime 正在做什么。

## 2026-07-17 当前实现（漂移修正）

> 本节描述 `electron_fix_neil` 分支当前实现。下方“用户反馈对应要求”和 2026-06-29 打包记录保留为历史施工依据；其中“工作台可见入口”、逐文件 CMake/config/source/artifact 选择器、PID/Task/Tool 摘要块和常驻三栏日志已经被本轮交互方案取代。

- 当前右侧可见页签为“仓库、监视器、任务管理器、编辑器”；工作台前端入口隐藏，但 React、IPC、`WebContentsView` 和主进程后端链路保留。
- 左侧对话区默认占 34%，支持拖动分隔条、键盘左右调整、收起/展开，并用 `localStorage` 保存宽度。
- 正文、按钮、标签、代码和日志完成可读性调整；中文正文使用系统字体，日志和代码使用等宽字体，控件尺寸同步增大以避免文字溢出。
- 任务管理器先选择 `hardboard/projects/<project>` 相对工程路径，再执行 Build/Flash。Build 和 Flash 固定为对齐的六列控制行，分别显示状态和进度；Flash 行提供串口选择与设备刷新。
- 工程下拉项由主进程枚举 `runtime/hardboard/projects` 目录提供。主进程保留安全的 `hardboard/projects/<name>` 相对引用，交给 runtime 按开发版或 packaged 环境解析。
- 删除旧的 CMake/config/source/artifact 选择器、源码预览和 PID/Task/Tool/Port/Project/Current 摘要块，避免用户先选文件再选工作目录的倒置流程。
- 实时日志、完整日志和事件卡片改为按按钮打开的诊断卡片，给页面下半区留出任务结果空间；三个视图均可独立清除。
- “最近任务与结果”按 `taskId` 聚合 Build/Flash，显示状态、工程、端口、开始时间、耗时、退出码和日志入口；成功为绿色、失败为红色，列表固定表头并可滚动，也可独立清除。
- 点击任务“查看”会打开完整日志，按 `taskId` 定位该任务的日志段并自动滚动；失败日志红色高亮、成功日志绿色高亮，其余状态使用各自颜色。
- Renderer 最多保留最近 500 条 Runtime 事件用于完整日志和任务结果；清除只改变当前前端视图的显示游标，不删除后端 EventBus 文件，新事件仍会继续显示。

## 用户反馈对应要求

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
- 监视器除了实时曲线和串口数据，也要打印 build / flash / runtime 日志。
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

编辑器是独立页签，不挤在工作台或仓库里。用于阅读和修改 C / H / C++ / CMake / sdkconfig / Markdown / skills / JSON / YAML / TXT。

### 监视器

保留串口曲线和串口输出，同时新增 runtime 日志流：

```text
serial output
runtime stdout/stderr
hardboard build/flash progress
tool failed / process exited
```

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
