# 施工日志

> 当前日志只保留对现代码仍然成立的记录。

## 2026-07-21 — 历史对话标签编辑菜单

- 历史标签原直接删除按钮改为右侧“⋯”锚定菜单，集中提供重命名、置顶/取消置顶和删除。
- 修正唯一会话错误向上展开菜单的问题：首项固定向下展开，只有非首项的末两项才向上避让底边；成品烟测增加 `menuPlacementOk` 几何断言。
- 重命名使用原位输入并限制 30 字；置顶状态写入 v2 会话文件，置顶项稳定排在普通会话之前。
- 删除仍保留二次确认；菜单支持点击空白和 Esc 关闭，并适配深浅主题、减少动态与透明度偏好。
- session 烟测新增重命名/置顶排序断言，成品 CDP 烟测覆盖完整菜单交互。

## 2026-07-21 — Agent 多历史会话与重启续接

- 将单一、只供摘要记录的 `session.json` 升级为 v2 多会话存储，保存活动会话、完整 UI 消息和精简 Agent 轮次；旧格式首次加载自动迁移。
- Agent 对话内新增 144px 可收起历史侧栏，支持新建、切换和带二次确认的删除；首条用户消息生成标题，侧栏显示日期和消息数量。
- Gateway 对用户消息与流式 Agent 输出同步落盘；Renderer 启动时恢复活动会话，Agent 工作期间锁定会话操作，防止输出落入错误工程。
- Orchestrator 开始任务时真正注入所选会话最近 10 轮上下文；切换会话会重置常驻 Agent 进程，防止隐式上下文串线。
- 验证通过：类型检查、main/renderer build、session 多会话隔离/删除烟测、任务队列烟测、Windows `pack:win` 和成品侧栏新建/删除 CDP 烟测。
- 成品关闭重启实测恢复 1 个旧会话、24 条可见消息和 19 个累计轮次；新版 exe 已重新启动。

## 2026-07-21 — Agent 对话降噪与 Markdown 呈现

- 根据界面复核移除左栏底部独立“任务进度”面板；阶段状态改为当前“执行过程”下方的紧凑仪表盘，只保留当前阶段、总体进度和完成计数，并仅在 Agent 工作期间出现。
- 根据完整对话记录复盘，把 Agent stream-json 的 `text/tool_call/tool_result/system/error` 语义从主进程保留到 IPC，不再把所有输出压成同一种聊天文本。
- PID、执行计划、工具调用、工具结果、Worker 状态和等待心跳按 `taskId` 合并为一张默认收起的“执行过程”卡；专业视图可自动展开并持久化用户选择。
- 同一任务的等待状态改为原位更新，避免长任务每 15 秒新增一条“仍在执行”；未分类关键错误仍在主对话中直接显示。
- Agent 最终回复使用无 HTML 注入的 React Markdown 渲染，支持常用文档结构；ANSI/控制字符被清理，工具摘要限制 12 行且单行最多 1200 字符。
- 工具调用、工具结果和 system 内容不再写入 Claude 会话摘要，降低下一轮上下文的日志污染。
- 验证通过：Electron typecheck、main build、renderer production build、Windows `pack:win`、对话解析烟测和成品 CDP 专业视图交互烟测；新版 exe 已启动。

## 2026-07-21 — 任务状态去像素化与 packaged Skills 路径修复

- 修复编辑器未打开文件时的提示文字仍继承旧版固定深色、在深色背景上对比不足的问题；`.editor-empty-tabs`、路径/状态和代码区空状态现统一使用主题次级文字令牌，深浅主题同步适配。
- Build 行第二列由“编译工程”静态提示改为“刷新工程”按钮，复用工作台刷新链路；Flash 保持“刷新设备”。Build/Flash 左侧英文标识移除蓝色块底和阴影。
- 旧 `.compile-action-status` 的浅蓝实底与 2px 蓝边框由 Apple 主题覆盖为内容宽度胶囊，使用灰/橙/蓝/绿/红圆点区分等待、需输入、运行、完成和失败。
- 任务页纵向比例扩容：标题、Build/Flash 控制行、诊断工具条和结果表头使用统一的 40–56px 控件尺度与 8–10px 分组间距，保持六列结构不变，缓解顶部操作区拥挤。
- 修复 packaged 仓库 Skills 路径错误：不再从 `win-unpacked/agent/skills` 拼接，改用 `getAgentDir()` 指向 `resources/agent/skills`；同时移除整个安装根目录的宽泛工作台许可，只保留明确受控根目录。
- 仓库打开反馈改为短状态，完整路径/错误放入悬停提示；标题正文允许收缩、操作区限制最大宽度，长 ENOENT 不再把页面文字挤成竖排。
- 验证通过：Electron typecheck、renderer build、Windows `pack:win`；成品工程刷新保持 4 个选项，Skills 列出 12 个文件并成功打开资源管理器，成功反馈下仓库标题布局正常。

## 2026-07-21 — 应用内主题与可拖动外观入口

- 修复界面只依赖 `prefers-color-scheme` 导致运行中可能随 Windows/Electron 偏好突然由深色变浅色的问题；首次无记录时读取一次系统偏好，此后用 `data-theme="dark|light"` 和 `vibeide.appearance.theme` 固定用户选择。
- 右下角新增 Apple 风格外观浮层，支持深色/浅色预览、点击外部或 Escape 关闭，并使用应用主题令牌适配两种配色。
- 根据用户反馈解决外观按钮与编辑器字号工具条重叠：按钮默认上移，并增加 Pointer Capture 1:1 拖动、6px 防误触、可视边界约束及 `vibeide.appearance.position` 坐标持久化。
- 浮层根据悬浮按钮所在位置自动选择上下展开和左右对齐，拖动时即时关闭，避免窗口边缘越界和拖动误开菜单。
- 验证通过：Electron typecheck、renderer build、Windows `pack:win`；成品实测主题切换/重载持久化、按钮拖动/重载持久化、左上象限浮层边界和最终右侧安全位置。
- 本地功能提交：`9848c33 feat(ui): add persistent draggable theme control`；未推送远端。

## 2026-07-21 — 随包 Python、MCP、双向串口助手与 Apple 主题收口

- Windows Python 运行时统一为 `resources/runtime/python/Scripts/python.exe`；打包排除旧 `esptools/idf-tools/python_env/**`，保留 embeddable `python312._pth` 隔离，并用 `runtime/python/sitecustomize.py` 恢复当前脚本目录导入。
- Agent 动态 MCP 配置补齐 `mcp` 命令参数；开发模式增加 `ELECTRON_RUN_AS_NODE=1`，stdio initialize handshake 已验证。
- Windows 串口设备名强制 UTF-8；CIM 查询失败或为空时回退到随包 `serial.tools.list_ports`，解决中文乱码和普通权限下 COM 下拉为空。
- 串口后端由只读监视改为单一 pyserial 子进程双向收发，支持完整串口参数、文本/HEX、编码与行尾；重开前等待旧进程退出，端口占用返回中文提示。
- 前端改为左侧接收/发送、右侧配置的传统串口助手布局；按用户反馈删除数值趋势图及数字采样状态。
- 使用 `apple-design` 规则在不改变布局的前提下接入整体主题变量、卡片材质、主次/危险按钮、连接状态反馈、深色模式和 reduced-motion/reduced-transparency/prefers-contrast。
- 新增 `runtime/hardboard/projects/touch_hello`：Waveshare ESP32-S3-Touch-AMOLED-1.8 触摸按钮通过 COM5 输出 `hello`。
- 验证通过：Runtime/Electron TypeScript、main/renderer build、Windows `pack:win`、随包 Python/pyserial、打包版 ESP-IDF 冷构建、COM5 枚举/打开/关闭释放和 `touch_hello` 编译/烧录/串口输出。
- Git 边界：本轮只创建本地提交，不推送远端；`apikey.txt`、打包产物、构建目录和运行态文件继续排除。

## 2026-07-20 — electron_design Apple UI 与 1.0.0-7201 文档/Git 收口（历史基线）

- 当前施工分支切换为 `electron_design`；正式产品名为 `奥德赛1.0.0-7201`，npm 版本为 `1.0.0-7201`，Windows PE 四段版本为 `1.0.0.7201`。
- 全面移除 NES.css 依赖与像素式视觉，新增 `electron/src/renderer/styles/apple.less`，统一冷色材质、系统字体、弱边框、圆角、直接反馈和 reduced-motion/reduced-transparency。
- 仓库固定为四个受控目录并增加资源管理器入口；顶部导入功能和当前概览中的历史导入分组已删除。
- 任务管理器清除改为用户动作优先：立即清空旧记录并物理删除 EventBus/`.log`，不再因残留 PID/运行状态拒绝或回滚界面；隔离测试覆盖 running/activePid 状态。
- 当时监视器增加了“串口数值趋势”；该图表及采样逻辑已于 2026-07-21 按用户反馈删除。
- 编辑器右键菜单改用 Portal 贴近视口指针；标签等宽弹性分配，关闭按钮和字号按钮补齐 Apple 风格 hover/focus/press 反馈。
- 新增 `docs/ELECTRON_APPLE_UI_CONSTRUCTION.md`，并同步 README、INDEX、ARCHITECTURE、DEV_PROGRESS、HANDOFF、GITHUB_SYNC 与任务管理器施工文档；旧迁移和测试报告继续保留为历史事实。

## 2026-07-20 — `25065b4` 后历史文档漂移复核

- 当时以本地 `git status`、`git log`、`git branch -vv` 和现代码为真相源复核；施工分支为 `agent_task_queue_fix`，功能 HEAD 为 `25065b4`。该记录已被上方 `electron_design` 1.0.0-7201 基线取代。
- README、HANDOFF 和 GITHUB_SYNC 补齐 `443a0a6` 的旧回调隔离与 `25065b4` 的 Runtime 日志真实清理，不再把当前施工状态停留在早期 `39ef92d/86af2c8`。
- 任务管理器施工文档把“独立前端清除”修正为多个入口调用统一的后端历史清理；HANDOFF 补齐 `verify:event-clear` 和本轮完整验证事实。
- 当前打包版 Hardboard 短路径按 `runtime/src/paths.ts` 修正为 `C:\vibeide-hw\hardboard` junction；旧 `%LOCALAPPDATA%\vibeide-hardboard-runtime` 只保留在明确的历史测试记录中。
- README 的下一步移除旧 Linux/C/E 盘三方并行同步说法，继续以 `E:\Agent\vibeide\vibeide` 为唯一施工目录。

## 2026-07-20 — 任务管理器运行日志改为真实磁盘清理（历史首版）

- 用户复测发现任务管理器“清除”后重开前端旧日志再次出现；根因是 `clearRuntimeCard` / `clearTaskHistory` 只推进 Renderer 的显示游标，磁盘上的 EventBus 和构建日志从未删除。
- Runtime 新增 `hardboard:events-clear` 的首版：当时仅在任务非运行状态执行。1.0.0-7201 已移除该限制，但仍只删除 `hardboard/events/events.jsonl` 和 `hardboard/logs` 目录中的 `.log` 文件；其他文件不会删除。
- Electron 新增 `hardboard:runtimeHistoryClear` IPC，Renderer 的诊断日志和最近任务“清除”统一调用该后端接口，成功后同步归零事件、任务记录和轮询序号。
- 当时 Build/Flash 运行中禁用清除按钮并由 Runtime 二次拒绝；该行为已被 1.0.0-7201 的直接清除语义取代。
- 新增 `npm.cmd --prefix runtime run verify:event-clear`，在隔离临时目录验证 EventBus 和 `.log` 文件真实消失、状态归零且非日志文件保留。
- 验证通过：Runtime build/清理烟测、Electron typecheck、main/renderer build和 `git diff --check`。

## 2026-07-20 — Agent 停止与异步完成回调竞态加固

- 复核 `AGENT_TASK_QUEUE_CONSTRUCTION.md` 和现有实现后发现：Agent turn 返回结果、Worker 正在等待页面验收时，用户停止或切换任务，旧异步回调仍可能继续完成当前状态、启动返工，甚至污染随后开始的新任务。
- turn 完成链路现在捕获原活动 `taskId`，在追加要求检查、页面验收及失败回调恢复后重新确认任务仍然有效；过期回调只记录并忽略，不再写入新任务状态。
- Agent 进程在已经产出 turn result、进入 Worker 异步验收后关闭时，不再抢占验收链路的任务所有权；如需返工或应用追加要求，由验收链路按需重新拉起 Agent。
- 启动任务和恢复任务的异步失败也增加活动任务校验，避免迟到的 Promise rejection 结束后来任务。
- 扩展 `verify_agent_task_queue.cjs`：新增“完成回调让出执行权后任务已取消”的回归，以及停止清空追加要求和独立队列的断言。
- 验证通过：Electron typecheck、main/renderer build、任务队列烟测、Claude session 烟测、Hardboard context 烟测和 `git diff --check`。Renderer 大包提示与本机 `os_crypt_win.cc` 告警不影响退出码。

## 2026-07-18 — agent_task_queue_fix 文档漂移复核

- 以本地 `git branch -vv`、`git log`、`config/version.json` 和实际 Electron 源码为真相源复核文档；当前分支为 `agent_task_queue_fix`，父分支基线为 `d10245d`，功能提交为 `39ef92d`，首轮任务队列文档提交为 `86af2c8`。
- 修正 README 仍把 `electron_fix_neil` 写成当前施工分支的问题，并补充单活动任务、追加要求和显式排队能力边界。
- 修正 `GITHUB_SYNC.md` 仍把 `b428a0e` 写成最新功能提交的问题；明确 `electron_fix_neil=d10245d`、当前分支尚无 upstream、本轮只维护本地 Git以及用户手动推送命令。
- 修正任务管理器施工文档的分支措辞：该实现最初在 `electron_fix_neil` 落地，当前 `agent_task_queue_fix` 完整继承，而不是把父分支继续写成当前分支。
- 版本保持 `0.4.0-7171` / `0.4.0.7171`，与 `config/version.json` 一致；历史日志中的旧分支和旧提交继续作为历史事实保留，不进行全局替换。
- Git 边界：只精确暂存本轮 5 个文档文件；提交前复核未发现其他代码改动，不使用 `git add -A`，不推送远端。

## 2026-07-18 — Agent 单活动任务与追加/排队修复

- 从 `electron_fix_neil` 的 `d10245d` 单独建立 `agent_task_queue_fix`，隔离修复“上一个回答尚未结束时再次发送会并发启动另一 Agent 任务”的问题。
- 根因是 Gateway 对任务提交没有忙碌约束，Orchestrator 每次收到文本都会直接调用 Agent，同时覆盖 `currentTask`、转录和状态；原 `pendingTasks` 仅记录文本，并不负责等待调度。
- Orchestrator 改为单活动任务：空闲时立即启动；忙碌时默认把消息缓冲为当前任务的追加要求；用户显式点“排队”才创建独立 `taskId` 并按 FIFO 等待。当前 turn 或页面验收结束后优先应用追加要求，任务完成/失败后再启动下一队列项。
- Gateway、preload 和 Renderer 新增 `task:status` 状态链路，消息、进度和完成事件携带 `taskId`。对话区显示空闲/执行中/暂停、追加数和排队数，并提供“追加要求”“排队”“停止”；多行输入支持 `Shift+Enter`。
- 补齐 Agent 异常退出、turn 完成回调异常、页面验收期间追加要求、会话多轮记录和队列切换边界；停止操作会终止当前 Agent 并清空等待队列。
- 新增 `npm.cmd --prefix electron run verify:task-queue`，验证首任务立即启动、默认追加不启动第二任务、显式任务等待、追加保持当前 `taskId`、当前任务结束后才启动队列项。
- 验证通过：Electron typecheck、main/renderer build、任务队列烟测、Claude session 烟测、Hardboard context 烟测和 `git diff --check`。Renderer 大包提示与本机 `os_crypt_win.cc` 告警不影响退出码。
- Git：功能提交为 `39ef92d fix(electron): serialize agent tasks and queue follow-ups`；文档精确暂存，用户在 `runtime/hardboard/projects/hello_world_esp32s3/main/hello_world_main.c` 的未提交修改继续排除，不推送远端。

## 2026-07-18 — VS Code 风格工程编辑器与文件管理

- 编辑器从纯文本输入区升级为两栏工程编辑区：左侧按仓库分组显示 Agent 生成、硬件工程、参考代码、Skills 和用户导入目录，右侧提供多文件标签、路径、保存状态和 Monaco 代码区。
- 主进程新增受限目录枚举，文件树按需展开并过滤 `.git`、`node_modules`、build、dist 等不应显示的目录；仓库允许根目录继续作为所有读写操作的安全边界。
- Electron 内置 `monaco-editor` 与 `@monaco-editor/react`，使用本地 Worker 和内置 C/C++ 深色主题；C/C++、CMake、Markdown、JSON、TypeScript 等文本获得语法高亮、行号、括号配色和缩略图，打包后不依赖在线 CDN。
- 文件资源管理器新增右键菜单：目录可新建文件/文件夹，文件和子目录可重命名或移到系统回收站，所有节点可刷新；禁止覆盖同名条目、非法名称和修改工作区根目录。
- 文件操作改用软件内置对话框，解决 Electron 环境下原生 `prompt` 无反馈的问题；编辑器底部新增 10–24px 字号调节和重置，并持久化用户上次字号。
- 文件重命名会同步更新已打开标签、活动路径和展开目录；删除会关闭目标文件或目录范围内的标签。保留 `Ctrl+S`、未保存标记和保存结果提示。
- 验证：Electron typecheck、main build、renderer build、`git diff --check` 通过；开发预览中 Vite `5173` 和 Electron CDP `9230` 正常监听。`pytest tests/test_project.py` 因本机缺少 `pytest` 命令未执行，不记录为通过。
- Git：功能提交为 `5afcef3 feat(electron): add vscode-style project editor`，交互修复为 `63992ea fix(electron): add editor controls and file dialogs`，文档漂移修正单独提交。精确暂存 Electron 源码/依赖和本轮文档，排除 `electron/dist*`、`node_modules`、runtime 状态、硬件构建产物及用户未暂存的 `hello_world_main.c` 修改；不推送远端。

## 2026-07-17 — electron_fix_neil 前端调整与 0.4.0-7171 版本施工

- 右侧顶部隐藏“工作台”页签，当前可见入口为仓库、监视器、任务管理器和编辑器。
- 工作台 React 内部逻辑、IPC、`WebContentsView` 和主进程后端继续保留，避免删除早期链路引入回归。
- 当前发布版本更新为 `0.4.0-7171`，用户可见产品名为 `奥德赛0.4.0-7171`。
- Windows PE `FileVersion` / `ProductVersion` / `buildVersion` 使用四段映射 `0.4.0.7171`。
- Electron、Runtime、Agent 的 package/lock 文件统一使用 `0.4.0-7171`。
- 旧 `0.4.0.7161` 测试报告和日志继续作为历史事实保留。
- 主布局由固定约 42% 左栏改为默认 34%；新增可拖动分隔条、键盘左右微调、`localStorage` 宽度持久化和对话区收起/展开。
- 完成前端可读性修正：中文正文使用系统字体，代码/串口/日志使用等宽字体；正文、按钮和标签字号提升，同时增大按钮、下拉框和工具栏尺寸，修复监视器等页面文字溢出。
- 主进程工作台概览新增 `hardboardProjects`，直接枚举 `runtime/hardboard/projects`；Renderer 使用 `hardboard/projects/<name>` 相对路径，`resolveSelectedProjectDir` 保留安全相对引用供开发版和 packaged runtime 解析。
- 任务管理器改为先选工程再执行：Build/Flash 两行统一为六列，对齐操作提示、工程/串口下拉、执行按钮、状态和进度；Flash 支持刷新设备。
- 移除旧 CMake/config/source/artifact 选择器、源码预览及 PID/Task/Tool/Port/Project/Current 摘要块，避免重复信息和错误操作顺序。
- 实时日志、完整日志、事件卡片改为按钮触发的诊断卡片；页面下半区新增“最近任务与结果”，按 `taskId` 聚合 Build/Flash 的状态、工程、端口、时间、耗时和退出码。
- 状态颜色明确分离：成功绿色、失败红色、运行中蓝色、等待黄色、取消灰色；任务结果固定表头并提供纵向滚动，前端事件缓存提高到最近 500 条。
- 点击任务“查看”会在完整 EventBus 日志中按 `taskId` 定位、自动滚动并高亮对应日志段；失败为红色、成功为绿色。
- 实时日志、完整日志、事件卡片和最近任务结果均增加“清除”按钮；该阶段最初只更新前端显示游标，已在 2026-07-20 的后续修复中改为真实后端清理。
- 本轮漂移修正同步更新 `ARCHITECTURE.md`、`DEV_PROGRESS.md`、`HANDOFF.md`、`RUNTIME_TASK_MANAGER_UI_CONSTRUCTION.md` 和本日志；历史测试报告不改写。
- 收尾验证通过：`npm.cmd --prefix runtime run build`、Electron `typecheck`、`build:main`、`build:renderer`、`verify:version` 和 `git diff --check`；版本输出为 release `0.4.0.7171`、package `0.4.0-7171`、product `奥德赛0.4.0-7171`。
- Git：所有改动位于 `electron_fix_neil`，只精确暂存本轮源码和文档，不纳入 `electron/dist*`、runtime events/logs、硬件 build、密钥或其他运行态文件；按用户要求暂不推送远端。

## 2026-07-17 — 接力路径与架构文档二次漂移修正

- 当前唯一施工目录统一为 `E:\Agent\vibeide\vibeide`，修正 `HANDOFF.md` 和 `DEVELOPMENT.md` 中仍作为当前命令出现的 Linux、`D:\vibeide`、`E:\vibeide` 与 `/d/vibeide` 路径。
- `GITHUB_SYNC.md` 当前拓扑改为 Windows 当前工作区通过 Git HTTPS 对接 `vibeide_Neil`；旧 Linux、C 盘、旧 E 盘和 0.1 unpacked 目录明确降级为历史迁移记录。
- `HANDOFF.md` 明确功能提交 `b428a0e` 和 GitHub HTTPS 推送失败状态，不把早期提交 `76a3683` 误写为当前 HEAD。
- `ARCHITECTURE.md` 补齐 Runtime hardboard/eventbus/process/task/MCP Server 与 Electron hardboard/paths/agent/first-run/tray/session-store，并明确工作台只是前端入口隐藏、内部实现仍保留。
- 本次只修正文档事实，不改写历史测试报告，不清理旧代码引用；旧配置和孤立文件另行提交。

## 2026-07-17 — 旧配置、绝对路径和 coffecat 活动引用清理

- 删除 `runtime/mcp-config.json`：其中的 `D:\coffecat-windows1.0` 静态配置已经被 `electron/src/main/agent.ts` 的逐任务动态 MCP 配置取代。
- Runtime `health` 保留 `mcpConfig` 字段但改为 `generated-dynamically-by-electron`，避免继续返回不存在或不可移植的静态路径；同时删除 Electron 中未使用的 `getMcpConfigPath()`。
- 删除仓库根目录孤立的 `package-lock.json`；根目录没有对应 `package.json`，该空锁文件只残留旧包名 `coffecat`。
- `electron/bili_run.ts` 截图输出改为从当前工作目录解析 `agent/bilibili_search_result.png`，不再写死旧 Linux 用户目录。
- `README.md` 的当前分支、Windows 施工目录和启动命令统一为 `electron_fix_neil` 与 `E:\Agent\vibeide\vibeide`；旧目录只保留为历史说明。
- `build-portable.cmd`、Agent B 站工具、CDP 注释和 Docker smoke 默认镜像改用“奥德赛”或 `vibeide`；旧 `COFFECAT_WINDOWS_SMOKE_IMAGE` 仅作为环境变量兼容回退保留。
- 验证通过：Runtime build、Electron typecheck/main build、两个 Agent `.mjs` 文件的 `node --check`、Runtime `health` 和 `git diff --check`。当前 PowerShell 环境没有 `bash`，因此未执行 `bash -n scripts/docker_windows_smoke.sh`。

## 2026-07-17 — 产品和发布版本统一为 0.4.0.7161

- 产品命名规则确定为“奥德赛 + 版本号”，当前正式产品名为 `奥德赛0.4.0.7161`。
- Windows `FileVersion` / `ProductVersion` / electron-builder `buildVersion` 使用四段版本 `0.4.0.7161`。
- npm 受 SemVer 语法限制，Electron、Runtime、Agent 的 package/lock 文件使用等价映射 `0.4.0-7161`。
- 新增 `config/version.json` 作为打包和 PE stamp 的单一版本清单，并增加 `npm --prefix electron run verify:version` 一致性检查。
- 历史 Windows v0.1.0 测试报告和 Runtime UI v2 记录不改写，继续作为历史事实保留。
- Runtime/Electron typecheck、主进程/Renderer build 和 `npm.cmd --prefix electron run pack:win` 均通过。
- 已生成 `electron/dist-package/win-unpacked/奥德赛0.4.0.7161.exe`，PE 元数据中的产品名、文件版本、产品版本和原始文件名均已验证。

## 2026-07-17 — GitHub 真相源切换到 vibeide_Neil

- 当前 GitHub 切换为 `https://github.com/NeilBaumanMax/vibeide_Neil.git`。
- 切换前已验证新远端 `main` 与本地基线同为 `63820a3`，无需强推或合并无关历史。
- README、仓库级开发规则、HANDOFF、GITHUB_SYNC、DEVELOPMENT 和 DEV_PROGRESS 已统一更新；旧仓库地址只保留在明确的历史日志和迁移记录中。
- 未跟踪的本机 `日志.txt` 和运行态文件不纳入同步提交。

## 2026-07-16 — API Key 路径收敛：从 %APPDATA% 迁移到 resources/

- **问题**：用户发现删除解压目录重新解压后，旧 API key 仍然生效，原因是 key 被持久化到 `%APPDATA%\vibeide\apikey.txt`，删除应用目录不会清除它。另外，`resources\apikey.txt` 只作为首次复制源，修改它不会生效。
- **修复**（`electron/src/main/paths.ts`、`first-run.ts`、`agent.ts`）：
  - `getApiKeyPath()` 生产模式改为返回 `process.resourcesPath/apikey.txt`（与应用同目录）
  - 移除 `tryCopyKeyFromResources()` — 不再复制 key 到 `%APPDATA%`
  - `checkApiKey()` 和 `readDeepSeekApiKey()` 统一只读 `resources/apikey.txt`
  - 结果：编辑 `resources\apikey.txt` 重启即生效，删除应用目录即删除 key
- 文档同步：`HANDOFF.md`、`SECURITY.md`、`LOG.md`、`DEV_PROGRESS.md`

## 2026-07-11 — 修复打包版 exe ESP-IDF 编译三问题（中文路径 / Python venv / 约束文件）

- 发现并修复打包版 `奥德赛0.0.exe` 编译 ESP-IDF 工程的三大问题：
  1. **中文用户名路径（刘天凯）导致 GCC 链接器乱码** — CMake 调用 `xtensa-esp32s3-elf-gcc.exe` 时，路径 `C:\Users\刘天凯\...` 中的中文字符被错误编码，`ld.exe` 找不到 `crt0.o`、`-lgcc`、`-lc` 等运行时文件。
     - 修复：`runtime/src/paths.ts` 中 `resolveShortHardboardRoot()` 改用 `C:\vibeide-hw\hardboard`（无中文）作为 junction 目标，替代原来的 `%LOCALAPPDATA%\vibeide-hardboard-runtime\hardboard`。
  2. **Python venv pyvenv.cfg 绑定旧机器路径** — `idf5.4_py3.12_env/pyvenv.cfg` 中 `home` 写死为 `C:\Users\HP\...`，导致 Python 启动失败返回 exit 103。
     - 修复：`runtime/src/hardboard/env.ts` 中 `resolvePython()` 优先使用系统 `python`，跳过失效的 venv Python。
  3. **缺少 `espidf.constraints.v5.4.txt`** — `idf.py` 在 `IDF_TOOLS_PATH` 下找不到约束文件。
     - 修复：创建空约束文件 `runtime/hardboard/esptools/idf-tools/espidf.constraints.v5.4.txt`。
  4. **嵌式 Python (embed) 的 `.pth` 文件禁用 PYTHONPATH** — Python embed 发行版的 `python312._pth` 阻止 `idf.py` 自动发现 `python_version_checker`。
     - 修复：`env.ts` 中 `buildIdfEnv()` 设置 `PYTHONPATH=tools/`（嵌式 Python 移除了 .pth 后生效）。
  5. **便携 Python 恢复** — 重新下载 embed Python 3.12.9，安装 ESP-IDF 核心依赖（click、PyYAML、esptool、pyelftools 等 56 个包），作为系统 Python 不可用时的回退。
- 重新打包验证：`npm --prefix electron run pack:win` 通过，exe version `0.1.0`。

## 2026-07-11 — D:\vibeide DeepSeek API 配置、重建打包与 exe 验证

- 确认 `apikey.txt` 已配置 DeepSeek API key（密钥内容写入手记，不写日志）。
- 修复 Windows 中文用户名路径导致 SSH 连接失败的问题：
  - Git Bash `~` 展开为 `/c/Users/刘天凯/`，ssh.exe 对 UTF-8 中文路径编码异常。
  - 解决方法：配置 `git config --global core.sshCommand` 使用显式路径参数绕过。
- SSH key (`ed25519`) 已生成并配置，远程已从 `howtio/vibeide` 改为 `howtion0/vibeide`。
- 执行施工文档构建流程：
  - `npm --prefix runtime run build` — runtime TypeScript 编译通过
  - `npm --prefix electron run typecheck` — 类型检查通过
  - `npm --prefix electron run build:main` — 主进程编译通过
  - `npm --prefix electron run build:renderer` — React UI (Vite) 构建通过
  - `npm --prefix electron run pack:win` — electron-builder win-unpacked 打包完成（签名步骤因无证书跳过，stamp 成功）
- exe 文件属性已验证：`ProductName=奥德赛0.0`、`FileVersion=0.1.0`、`ProductVersion=0.1.0`。
- exe 启动测试通过：`D:\vibeide\electron\dist-package\win-unpacked\奥德赛0.0.exe` 进程正常启动，无崩溃。
- 产线 API key 已部署到 `%APPDATA%\vibeide\apikey.txt`。
- 远程仓库已从 `howtio/vibeide` 更正为 `howtion0/vibeide`，合并远程 6 个提交后推送成功。

## 2026-06-29 — Windows C:\vibeide 0.1 迁移启动

- 按用户要求先写施工文档：`docs/WINDOWS_0_1_MIGRATION_CONSTRUCTION.md`。
- 已将当前施工成果备份到 `git@github.com:howtion0/vibeide.git`，`main` 更新到本轮 runtime task manager / 仓库导入文件夹 / Windows 迁移施工方案。
- Electron 应用版本调整为 `0.1.0`，后续 Windows unpacked exe 需要写入 `FileVersion=0.1.0`、`ProductVersion=0.1.0`。
- 本轮 Windows 目标目录是 `C:\vibeide`，该目录已有上一版本，迁移时覆盖源码但保留依赖、硬件运行态和本地用户文件。
- 仓库页新增“导入文件夹”入口，默认精选分组之外允许用户把任意本机目录加入仓库视图；导入分组支持移除，移除后不再允许读写该目录；UI 默认分组不再显示施工文档。

## 2026-06-29 — Windows E:\vibeide 0.1 迁移、打包和 ESP32-S3 测试

- Windows 源码项目已镜像到 `E:\vibeide`。
- Windows unpacked 包已镜像到 `E:\vibeide-0.1-win-unpacked`。
- 打包 exe：`E:\vibeide-0.1-win-unpacked\奥德赛0.0.exe`。
- exe PE 版本已验证为 `FileVersion=0.1.0`、`ProductVersion=0.1.0`。
- Windows 打包版 runtime 环境验证通过：
  - `npm --prefix runtime run build`
  - `npm --prefix electron run typecheck`
  - `npm --prefix electron run build:main`
  - `npm --prefix electron run build:renderer`
  - `npm --prefix electron run pack:win`
- 打包版 runtime 硬件链路验证：
  - `hardboard:env` 指向 `E:\vibeide-0.1-win-unpacked\resources\runtime` 和 `%LOCALAPPDATA%\vibeide-hardboard-runtime\hardboard`。
  - `hardboard:devices` 发现 `COM7`、`COM8`、`COM9`。
  - `COM7` 经 esptool 确认为 ESP32-S3。
  - `wifi_connect_fmai` 编译通过、烧录到 `COM7` 通过、hash verified。
  - `hello_world_esp32s3` 编译通过、烧录到 `COM7` 通过、hash verified。
- 串口剩余问题：
  - `hardboard:serial` 可打开 `COM7` / `COM8` 并生成日志，但当前未抓到应用层输出。
  - `COM9` 打开失败，Windows 返回串口超时。
  - 已写入详细测试报告：`docs/WINDOWS_0_1_TEST_REPORT.md`。

## 2026-06-29 — Runtime UI v2 打包、日志与 asar 验证（历史记录，已被 0.1 E 盘包取代）

- 用户反馈 Linux 预览变化明显，但 Windows unpacked exe 观感未变化，判断风险点是继续打开了旧 `win-unpacked` 目录。
- 用户继续反馈 `dist-package` 没有变化、exe 版本仍像旧版本；因此最终改为直接刷新原始 `electron/dist-package/win-unpacked`，不再只依赖旁边复制目录。
- 重新执行并验证：
  - `npm --prefix electron run typecheck`
  - `npm --prefix electron run build:renderer`
  - `npm --prefix runtime run build`
  - `npm --prefix electron run build:main`
  - `npm --prefix electron run pack:win`
  - `npm --prefix electron run stamp:win`
  - `npm --prefix electron run smoke:workbench`
- 本轮 Windows unpacked 测试对象改为独立目录，避免与旧目录混淆：
  - `electron/dist-package/奥德赛0.0-runtime-ui-v2-win-unpacked/奥德赛0.0.exe`
  - `electron/dist-package/奥德赛0.0-runtime-ui-v2-win-unpacked.zip`
- 最终用户应测试的原目录也已刷新：
  - `electron/dist-package/win-unpacked/奥德赛0.0.exe`
- 新包内写入 `RUNTIME_UI_V2_BUILD.txt`，窗口顶部页签和工作台标题显示 `Runtime UI v2 · 2026-06-29 19:05`。
- 已解包检查原目录 `resources/app.asar`，确认 renderer bundle 内含 `Runtime UI v2`、`任务管理器`、`编辑器`、`硬件编译/烧录工作台`，main bundle 内含 `resolveSelectedProjectDir`。
- 已验证原目录 `resources/runtime/dist/hardboard/runner.js` 包含 `failBeforeProcess` 和失败 stderr 写入 `hardboard.build.completed / hardboard.flash.completed`。
- 新增 `electron/scripts/stamp_win_exe_version.cjs`，用 `resedit` 直接写 `win-unpacked/奥德赛0.0.exe` 的 PE 版本资源；当时历史包 `ProductName=奥德赛0.0`、`FileVersion=0.3.0`、`ProductVersion=0.3.0`。当前 0.1 包以 `docs/WINDOWS_0_1_TEST_REPORT.md` 为准。
- 新增 `electron/scripts/pack_win_unpacked.cjs`，`npm --prefix electron run pack:win` 在 Linux 上遇到 Wine 签名失败但 `win-unpacked` 已生成时，会继续执行版本资源 stamp 并返回成功，避免再次漏改 exe 文件属性。
- zip 打包时排除 `runtime/hardboard/events/*`，避免把本机历史运行态事件带进交付目录。

## 2026-06-22 — log.txt 复盘、Hardboard 工具输出收敛与奥德赛0.0 命名

- 正式项目名确定为：奥德赛0.0。
- GitHub 仓库和内部工程代号继续使用 `vibeide`，避免一次性迁移 appData、npm 包名、API key 路径和历史运行态。
- 修复 hardboard 工具输出过大问题：
  - `runIdfCommand` 会把 stdout/stderr 写入 `runtime/hardboard/logs/*.log`。
  - MCP `hardboard.idf_build`、`hardboard.idf_flash`、`hardboard.idf_set_target`、`hardboard.idf_clean`、`hardboard.idf_erase_flash` 返回 compact JSON。
  - Runtime CLI `hardboard:build`、`hardboard:flash` 也返回 compact JSON。
- 修复 Agent skill 文件定位规则：
  - 硬件任务必须先 `hardboard.env_status`，读取返回的 `docsDir/projectsDir`。
  - 禁止从 `runtime-data/agent-workspace` 猜 `..\runtime\hardboard\doc`。
  - 查工程文件必须排除 `build/**`。
  - 修改源码前先读 `main/CMakeLists.txt` 的 `SRCS`，不要猜源码叫 `main.c`。
- 用户可见命名已更新：
  - Electron 窗口标题：奥德赛0.0
  - 托盘 tooltip：奥德赛0.0
  - renderer `<title>`：奥德赛0.0
  - electron-builder `productName`：奥德赛0.0
- 文档更新：
  - `README.md`
  - `docs/HANDOFF.md`
  - `docs/GITHUB_SYNC.md`
  - `docs/HARDBOARD_CONSTRUCTION.md`
  - `docs/DEV_PROGRESS.md`
  - `runtime/hardboard/doc/README.md`
  - `agent/skills/espidf_hardboard.md`

## 2026-06-21 — Claude 软件会话与 NES UI 重构

- 新增：
  - `docs/PLAN_2026-06-21_CLAUDE_SESSION_NES_UI.md`
  - `electron/src/main/worker/session-store.ts`
  - `electron/scripts/run_workbench_smoke.cjs`
  - `electron/scripts/verify_claude_session.cjs`
  - `electron/assets/icon.svg`
  - `electron/assets/icon.png`
  - `electron/assets/icon.ico`
- 更新：
  - `electron/src/main/agent.ts`
  - `electron/src/main/worker/orchestrator.ts`
  - `electron/src/main/worker/logger.ts`
  - `electron/src/renderer/*`
  - `electron/electron-builder.yml`
  - `electron/package.json`
  - `runtime/package.json`
  - `agent/package.json`
  - `scripts/start_electron_desktop.*`
  - `.gitignore`
  - `docs/DEV_PROGRESS.md`
- 当前变化：
  - 增加软件级 Claude session store，最近上下文持久化到 `runtime/claude-session/session.json`
  - 每次 Agent prompt 会注入同一软件会话上下文，避免用户体验上每问一次都是新会话
  - Claude CLI 从第二轮起尝试使用 `--continue`，并固定 `CLAUDE_CONFIG_DIR` 到 `runtime/claude-config`
  - Electron 前端改为 NES.css / 蓝白机风格，覆盖 Agent 对话、任务进度、结果区、右侧工作台和浏览器外框
  - 右侧工作台条目从纯展示改为可点击按钮，点击后通过 `workbench:openItem` 打开到右侧浏览页层
  - 增加工作台点击烟测，真实启动 Electron 并触发工作台按钮 `.click()`
  - 增加 Claude 软件会话烟测，验证 `session.json` 能跨轮保存并生成后续上下文
  - 应用标题、package、MCP server、日志前缀、浏览器 partition 从旧 `coffecat` 迁到 `vibeide`
  - 打包规则改为 `com.vibeide.app` / `vibeide`，新增 Windows icon，移除真实 `apikey.txt` extraResource
  - npm scripts 改成直接调用 `node_modules/<pkg>/...`，降低 `.bin` symlink 依赖
- 验证：
  - `pytest tests/test_project.py` 通过
  - `node --check agent/tools/build_platform_search_url.mjs` 通过
  - `node --check agent/tools/bilibili_search.mjs` 通过
  - `node --check agent/tools/cdp_navigate.mjs` 通过
  - `cd runtime && npm run typecheck && npm run build` 通过
  - `cd electron && npm run typecheck && npm run build:main && npm run build:renderer` 通过
  - `cd electron && npm run verify:session` 通过
  - `cd electron && npm run smoke:workbench` 通过，打开目标：`README.md`
  - 本机 Electron 构建产物可启动并截图确认 NES UI，截图：`/tmp/vibeide-nes-ui.png`
  - Windows `C:\vibeide` 从 GitHub clone 到 `8746cca`
  - Windows `npm --prefix runtime run typecheck && npm --prefix runtime run build` 通过
  - Windows `npm --prefix electron run typecheck && npm --prefix electron run build:main && npm --prefix electron run build:renderer` 通过
  - Windows `npm --prefix electron run verify:session` 通过
  - Windows `npm --prefix electron run smoke:workbench` 通过，打开目标：`C:\vibeide\README.md`
  - Windows `scripts\start_electron_desktop.ps1` 短时启动通过：runtime health OK、Vite 5173 ready、Electron 进程启动

## 2026-06-21 — GitHub 接力与文档重构

- 历史仓库：
  - `git@github.com:howtio/vibeide.git`
- 新增：
  - `docs/INDEX.md`
  - `docs/ARCHITECTURE.md`
  - `docs/DEVELOPMENT.md`
  - `docs/GITHUB_SYNC.md`
  - `docs/REFACTOR_PLAN.md`
  - `docs/SECURITY.md`
  - `docs/HANDOFF.md`
  - `.local-secrets/HANDOFF_PRIVATE.md`（本机私有，已忽略，不入库）
- 更新：
  - `README.md`
  - `CLAUDE.md`
  - `.gitignore`
  - `docs/DEV_PROGRESS.md`
- 当前变化：
  - README 从旧 `coddecat` Docker/Python scaffold 叙事重写为 `vibeide` Electron + Runtime + Agent 主线
  - 仓库级规则从旧 `coffecat` 重写为当前模块边界和安全红线
  - 新增 GitHub / Windows / 本机三方接力流程
  - 新增下一步重构计划，明确命名统一、旧 Python scaffold、录制回放边界和 Windows 开发体验
  - `.gitignore` 明确排除 `.local-secrets/`、根 `.claude/`、`agent/.claude/`、`electron/dist/`
- 验证：
  - GitHub SSH 已验证可访问
  - Windows SSH 已验证可访问
  - Windows `C:\vibeide` 源码已同步到本机，排除依赖、构建产物、运行态和密钥

## 2026-06-10 — windows1.0 支线 Windows 适配启动

- 分支：
  - `windows1.0`
- 新增：
  - `electron/electron-builder.yml`
  - `scripts/start_electron_desktop.ps1`
  - `scripts/start_electron_desktop.cmd`
  - `agent/tools/build_platform_search_url.mjs`
  - `docs/11_Windows适配说明.md`
  - `docs/12_Docker_Windows_Smoke.md`
  - `docker/windows-smoke.Dockerfile`
  - `scripts/docker_windows_smoke.sh`
- 更新：
  - `electron/package.json`
  - `runtime/package.json`
  - `agent/CLAUDE.md`
  - `agent/skills/browser_guide.md`
  - `agent/skills/search_workflow.md`
  - `agent/skills/bilibili_search_workflow.md`
  - `docs/00_总体施工文档.md`
  - `docs/03_打包说明.md`
  - `docs/10_当前文件结构总览.md`
  - `docs/DEV_PROGRESS.md`
- 当前变化：
  - Electron dev 脚本改用 `cross-env`，兼容 Windows CMD / PowerShell
  - 增加 Windows PowerShell / CMD 启动入口
  - 增加 electron-builder Windows NSIS 配置
  - 增加跨平台 Node 版平台搜索 URL 工具，Windows 不依赖 `.sh`
  - Worker 注入给 Agent 的搜索规则改为 `.mjs` 优先，避免 Windows 下继续按 `.sh` 执行
  - 增加 Docker + Wine Windows 打包 smoke 测试入口
  - `agent/tools` 长期工具补齐 Windows `.cmd` / 跨平台 `.mjs` 入口，旧 `.sh` 仅保留 Linux/macOS 兼容
- 验证：
  - `cd electron && npm run build:runtime && npm run build:main && npm run build:renderer` 通过
  - `node agent/tools/build_platform_search_url.mjs taobao 猫粮` 通过
  - `node agent/tools/build_platform_search_url.mjs bilibili 何同学` 通过
  - `node agent/tools/build_platform_search_url.mjs google windows electron 打包` 通过
  - `cd electron && npm run pack:win` 已进入 electron-builder，但当前 Linux 环境下载 Windows Electron 运行时速度过慢，停在 `app-builder unpack-electron`
  - `pytest tests/` 仍因缺少 `src/coddecat` 在收集阶段失败，属于既有 scaffold 测试问题
  - `git diff --check` 通过
  - 已安装并启动 Docker；`scripts/docker_windows_smoke.sh pack` 已开始拉取 `electronuserland/builder:wine`
  - Docker smoke 因基础镜像下载过慢由用户中止，后续改到 Windows 实机调试
  - `node --check agent/tools/bilibili_search.mjs` 通过
  - `node --check agent/tools/build_platform_search_url.mjs` 通过
  - `node --check agent/tools/cdp_navigate.mjs` 通过
  - `cd electron && npm run typecheck` 通过

## 2026-06-10 — 录制命名与重放对象选择

- 更新：
  - `electron/src/main/browser-recorder.ts`
  - `electron/src/main/workbench.ts`
  - `electron/src/main/gateway.ts`
  - `electron/src/preload/index.ts`
  - `electron/src/renderer/App.tsx`
  - `electron/src/renderer/components/BrowserPanel.tsx`
  - `electron/src/renderer/components/WorkspacePanel.tsx`
  - `electron/src/renderer/types/index.ts`
  - `electron/src/renderer/styles/global.less`
  - `docs/DEV_PROGRESS.md`
- 当前变化：
  - 右侧浏览工具栏增加录制名输入，停止录制时按指定名字保存
  - 重放从 `Replay Last` 扩展为选择 / 输入录制名或文件名后执行 `Play`
  - 主进程新增按指定目标重放录制文件的 IPC
  - 工作台录制区展示 label、动作数、来源标题 / URL、文件更新时间，便于识别管理
  - 工作流区展示工作流名称、提取类型和来源信息
- 验证：
  - `cd electron && npx tsc --noEmit` 通过
  - `cd runtime && npx tsc --noEmit` 通过
  - `pytest tests/` 仍因缺少 `src/coddecat` 在收集阶段失败，属于既有 scaffold 测试问题

## 2026-06-10 — 回放优化 Skill 与 Workflow 摘要

- 新增：
  - `agent/skills/replay_workflow_tooling.md`
- 更新：
  - `agent/CLAUDE.md`
  - `agent/skills/recording_workflow.md`
  - `electron/src/main/worker/context.ts`
  - `runtime/src/workflows.ts`
  - `runtime/src/mcp/browser.tool.ts`
  - `docs/10_当前文件结构总览.md`
  - `docs/DEV_PROGRESS.md`
- 当前变化：
  - 明确“封装成脚本”默认落为 `runtime/workflows/*.json`，不写绕过 MCP 的浏览器脚本
  - Skill 写清楚录制文件、workflow、workspace、skills、tools 的位置和用途
  - Agent 在优化重放、加信息捕获、下次自动调用等任务中会自动加载回放优化 skill
  - `browser.workflows_list()` 返回 workflow 摘要 JSON，便于 Agent 直接匹配并 `browser.workflow_run`
- 验证：
  - `cd runtime && npx tsc --noEmit` 通过
  - `cd electron && npx tsc --noEmit` 通过
  - context 自测确认“优化重放 / 封装成脚本”任务会加载 `replay_workflow_tooling.md`
  - `pytest tests/` 仍因缺少 `src/coddecat` 在收集阶段失败，属于既有 scaffold 测试问题

## 2026-06-10 — Worker 搜索预处理下沉

- 新增：
  - `electron/src/main/worker/search-preflight.ts`
- 更新：
  - `runtime/src/browser.ts`
  - `electron/src/main/index.ts`
  - `electron/src/main/browser-view.ts`
  - `electron/src/main/worker/orchestrator.ts`
  - `electron/src/main/worker/quick-tasks.ts`
  - `electron/src/main/worker/logger.ts`
  - `docs/00_总体施工文档.md`
  - `docs/01_架构说明.md`
  - `docs/10_当前文件结构总览.md`
  - `docs/DEV_PROGRESS.md`
- 当前变化：
  - Worker 在 Agent 启动前识别搜索 / 查找 / 整理 / 排行类任务
  - 平台选择顺序改为：用户明确平台 → 当前页面平台 → 视频榜单默认 B 站 → 普通中文搜索默认百度
  - 预处理会先把右侧浏览页导航到平台搜索结果页，再把预处理结果注入 Agent prompt
  - 明确需要整理 / 抽取的数据任务不再被 B 站快捷任务提前判定完成
  - 解决首轮直接要求“何同学最火十个视频数据整理”时 Agent 自行跑去 Google 的问题
  - 原生浏览页在未收到有效 renderer bounds 前保持隐藏，避免出现截图里网页贴到左侧 / 覆盖 UI 的错误位置
  - Runtime CDP 页面选择明确排除 Electron shell 页，避免 MCP `browser.navigate` 选中主窗口 renderer
  - Electron shell 增加外部导航拦截，若误导航到网页则转成右侧 tab，保护 React UI 不被覆盖
- 验证：
  - `cd electron && npx tsc --noEmit` 通过
  - `cd runtime && npx tsc --noEmit` 通过
  - 搜索预处理规则自测通过：B 站 / Google / 百度 / 淘宝 / 抖音 / 普通中文搜索
  - `pytest tests/` 仍因缺少 `src/coddecat` 在收集阶段失败，属于既有 scaffold 测试问题

---

## 2026-06-07 — 右侧改成固定工作台 + 浏览页层

- 新增：
  - `electron/src/main/workbench.ts`
  - `electron/src/renderer/components/WorkspacePanel.tsx`
- 更新：
  - `electron/src/main/browser-view.ts`
  - `electron/src/main/gateway.ts`
  - `electron/src/preload/index.ts`
  - `electron/src/renderer/App.tsx`
  - `electron/src/renderer/components/BrowserPanel.tsx`
  - `electron/src/renderer/types/index.ts`
  - `electron/src/renderer/styles/global.less`
- 当前变化：
  - 右侧默认不再直接显示浏览器，而是固定工作台主页
  - 工作台展示文件 / 工具 / 录制 / 重放（工作流）目录
  - 新开的浏览页仍在同一窗口内，但作为右侧可切换页面层显示
  - 上方增加 tabs + 页面 selector，可切回工作台
  - 原生浏览页宿主尺寸改为跟随 renderer 实际容器同步，不再靠主进程写死比例
  - 浏览页在右侧内容区全尺寸显示，避免被旧布局遮挡

## 2026-06-07 — 文档全面去漂移

- 重写核心文档：
  - `docs/00_总体施工文档.md`
  - `docs/01_架构说明.md`
  - `docs/05_前端设计_Phase1.md`
  - `docs/09_Electron客户端方案.md`
  - `docs/10_当前文件结构总览.md`
  - `docs/DEV_PROGRESS.md`
  - `docs/LOG.md`
- 删除旧叙事：
  - 单 `BrowserView` 最终模型
  - 右下角 popup 是当前产品方案
  - 搜索任务主要靠 agent 首页点击
- 统一为当前事实：
  - 右侧是 `WebContentsView host + tabs`
  - 新页请求统一回收到右侧 tab
  - 搜索任务优先 URL 工具

## 2026-06-07 — Runtime 对齐参考代码主链路

- `runtime/src/index.ts`
  - 补成 runtime CLI 入口，支持 `health / mcp / connect`
- `runtime/src/paths.ts`
  - 新增运行目录与 `state.json` / `ports.json` 初始化
- `runtime/src/extract.ts`
  - 按参考代码补齐 cards 提取、详情抽取、分页翻页主流程
- `runtime/src/record.ts`
  - 按参考代码补齐页面事件录制与选择器采样
- `runtime/src/replay.ts`
  - 按参考代码补齐录制动作回放基础链路
- `scripts/normalize.py`
  - 保留参考代码里的 OpenAI 兼容结构化清洗能力
- `scripts/reporter.py`
  - 保留参考代码里的 HTML 报告生成能力
- `scripts/start_electron_desktop.sh`
  - 启动前补齐 runtime 目录和状态文件
  - 启动前执行 runtime health 检查
  - 保持 Electron renderer / main 统一拉起

## 2026-06-07 — Electron 登录态持久化

- `electron/src/main/browser-view.ts`
  - 右侧 `WebContentsView` 统一切到持久分区 `persist:coffecat-browser`
  - 新增浏览器存储刷盘逻辑，退出前主动 `flushStorageData + cookies.flushStore`
- `electron/src/main/index.ts`
  - Electron `userData` 固定到 `runtime/chrome_profile/electron-shell`
  - 退出前先刷盘，再关闭应用
  - 补 `SIGTERM / SIGINT` 优雅退出，避免启动脚本重启时 cookie 丢失
- 当前效果：
  - cookie / localStorage / 登录态会跟随 Electron 浏览器区保留
  - 实测重启后 cookie 与 localStorage 都能保留

## 2026-06-07 — 录制/回放接到 Electron 可用状态

- `electron/src/main/browser-recorder.ts`
  - 新增主进程录制/回放桥接
  - 对当前 `WebContentsView` 注入录制脚本
  - 录制结果落盘到 `runtime/recordings/`
- `electron/src/main/gateway.ts`
  - 新增 `browser:startRecording`
  - 新增 `browser:stopRecording`
  - 新增 `browser:replayLatestRecording`
  - 新增 `browser:listRecordings`
- `electron/src/preload/index.ts`
  - 暴露录制/回放 IPC API
- `electron/src/renderer/App.tsx`
  - 增加录制状态与消息提示
- `electron/src/renderer/components/BrowserPanel.tsx`
  - 增加 `Start Rec / Stop Rec / Replay Last` 按钮
- 实测：
  - 通过 renderer 按钮开始录制
  - 在右侧浏览器页输入并点击
  - 停止录制后生成 JSON 文件
  - 回放最新录制后页面结果恢复正确

## 2026-06-07 — 右侧浏览器区改成 host + 多 tab

- `electron/src/main/browser-view.ts`
  - 引入 `host view`
  - 每个页面一个 `WebContentsView`
  - `window.open` / 新页请求转成右侧新 tab
- Renderer 保持固定右侧区域，不新增 popup 结构

## 2026-06-07 — 搜索任务改成工具优先

- 新增：
  - `agent/tools/build_platform_search_url.sh`
  - `agent/skills/search_workflow.md`
  - `agent/skills/bilibili_search_workflow.md`
- 更新：
  - `agent/CLAUDE.md`
  - `agent/skills/browser_guide.md`
  - `electron/src/main/worker/context.ts`
- 当前规则：
  - 搜索 / 查找 / 整理结果 类任务，必须先生成平台搜索 URL
  - 再 `browser.navigate`
  - 不支持的平台直接报错，不允许 agent 自由发挥

## 2026-06-07 — 录制 / 回放 / 抽取工作流接入 Agent

- 新增：
  - `runtime/src/workflows.ts`
  - `agent/skills/recording_workflow.md`
- 更新：
  - `runtime/src/mcp/browser.tool.ts`
  - `runtime/src/index.ts`
  - `agent/CLAUDE.md`
  - `agent/skills/browser_guide.md`
  - `electron/src/main/worker/context.ts`
- 当前能力：
  - Agent 可以直接开始录制、停止录制并命名
  - Agent 可以列出录制、按名字回放录制
  - Agent 可以把“录制动作 + 当前页面提取规则”保存成一套工作流
  - Agent 下次可以直接按工作流名称回放并抽取数据
- 当前落盘：
  - 录制文件保存在 `runtime/recordings/`
  - 工作流文件保存在 `runtime/workflows/`

## 2026-06-06 — Worker 层与 MCP 链路落地

- Worker 调度层完成
- Gateway 变薄
- Agent 流式输出接入
- Runtime MCP 可稳定被 Claude Code 调用
