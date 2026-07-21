# Catnip Forge 接力开发文档

> 本文是下一次 Codex 接力的第一入口。敏感账号密码不写在本文，见本机私有文件 `.local-secrets/HANDOFF_PRIVATE.md`，该目录已被 `.gitignore` 排除。

## 当前事实

- 当前日期：2026-07-21。
- 正式产品名：`Catnip Forge`；中文全称：`Catnip 硬件智能开发平台`；英文定位：`Autonomous Hardware Development Agent`。
- 内部工程代号：`vibeide`。
- 当前本机工作目录：`E:\Agent\vibeide\vibeide`（Windows 实机）。
- 当前 GitHub：`https://github.com/NeilBaumanMax/vibeide_Neil.git`；当前本机记录的 `origin/main` 位于 `5e6ba3b`。
- 当前施工分支：`electron_design`。该分支在既有任务串行化、编辑器和 Runtime EventBus 基线上完成 Apple 风格界面、Skill/工程仓库、任务清除、内置双向串口助手、随包 Python/MCP 修复、应用内持久化主题和可拖动外观入口。本轮维护本地 Git，不推送远端。
- 旧 GitHub/历史源：`git@github.com:howtion0/vibeide.git`、`git@github.com:howtio/vibeide.git` 仍可能出现在历史日志或迁移文档中，不再作为当前同步目标。

## 当前版本和验证

- 当前对外发布版本：`v1.0.0`；内部构建号 `7201`，npm 包版本 `1.0.0-7201`，Windows PE 四段版本映射为 `1.0.0.7201`。
- Windows 便携成品是完整的 `electron/dist-package/win-unpacked`，必须解压到普通可写目录后运行，不能只分发 exe。发布包不含真实 `resources/apikey.txt`，只含模板；无 Key 首启由应用内窗口完成配置。
- `electron_design` 当前源码需以 Runtime/Electron typecheck、main/renderer build、Windows unpacked 打包和 `git diff --check` 作为提交门禁。当前版本已执行 Windows 打包、MCP handshake、随包 Python、ESP-IDF 冷构建及 COM5 串口回归；真实 Agent 长时间连续对话仍需持续观察。
- 当前主题不再持续跟随 Windows/Electron 的 `prefers-color-scheme`。首次无记录时读取一次系统偏好，之后由外观菜单选择并持久化；按钮位置也独立持久化，可拖动避开编辑器字号工具条。
- Windows packaged 工作台资源不得用 `win-unpacked/<资源>` 手工拼接：Skills 通过 `getAgentDir()` 指向 `resources/agent/skills`，文档和硬件分别通过 `getResourcesDir()` / `getHardboardDir()` 解析。工作台允许范围是明确仓库，不包含整个安装根目录。
- `resources/agent/skills` 是唯一用户维护源仓库；`skill-manager.ts` 在 Agent 启动前把它标准化部署到用户数据下的 `agent-workspace/.claude/skills`。仓库页 Skill 管理器负责 CRUD/同步，不能把源路径改到 `%APPDATA%`。
- 本轮继续加固任务生命周期：turn 完成后的页面验收、恢复和异常回调均校验原 `taskId`，停止或队列切换后的旧异步回调不会再完成新任务或复活旧任务；任务队列烟测已覆盖取消竞态及停止清空两类等待项。
- Agent 对话当前采用双层呈现：用户回复直接显示并安全渲染 Markdown，PID/工具/诊断/心跳按任务折叠；“专业视图”可自动展开全部过程。工具日志不再混入持久化 Agent 回复摘要，旧版整段日志刷屏不应恢复。
- 左栏旧“任务进度”步骤面板已取消；运行状态只在 Agent 工作时以紧凑仪表盘显示于当前“执行过程”下方，暂停或完成后不保留占位。
- Agent 历史已升级为 v2 多会话：成品保存在 `%APPDATA%/@vibeide/electron/runtime-data/claude-session/session.json`，旧单会话自动迁移；侧栏可新建/切换/确认删除，关闭重启恢复完整消息，选中会话最近上下文会真正注入下一轮 Agent。
- 历史标签的管理入口统一为右侧“⋯”菜单：支持原位重命名、持久化置顶/取消置顶和二次确认删除；Agent 工作期间这些编辑操作保持锁定。
- 上一版 Windows exe PE 版本已验证（历史 v0.1.0）：
  - `FileVersion=0.1.0`
  - `ProductVersion=0.1.0`
- 本机源码目录：`E:\Agent\vibeide\vibeide`
- 目标打包 exe：`electron\dist-package\win-unpacked\Catnip Forge.exe`
- 产线 API key：`resources\apikey.txt`（DeepSeek，与应用同目录，删包即删 key）
- 仓库 remote：`https://github.com/NeilBaumanMax/vibeide_Neil.git`
- SSH key：`~/.ssh/id_ed25519`，已配置 `git config core.sshCommand` 绕过中文路径编码问题

已通过（当前源码目录 `E:\Agent\vibeide\vibeide`，2026-07-17）：

- `npm --prefix runtime run build` — runtime TypeScript 编译通过
- `npm --prefix electron run typecheck` — 类型检查通过
- `npm --prefix electron run build:main` — 主进程编译通过
- `npm --prefix electron run build:renderer` — React UI (Vite) 构建通过
- `npm --prefix electron run pack:win` — electron-builder win-unpacked 打包完成
- 上一版 `奥德赛0.0.exe` 启动验证通过（历史 v0.1.0，进程正常启动，无崩溃）
- **修复 ESP-IDF 编译三大问题**（2026-07-11）：
  - 中文路径 GCC linker 乱码 → junction 改用 `C:\vibeide-hw`
  - Python venv 绑定旧机器 HP 路径 → Windows 固定使用随包 `runtime/python/Scripts/python.exe`
  - 缺少 `espidf.constraints` → 运行时自动生成
  - 便携 Python 3.12.9 + ESP-IDF 56 依赖包已装好

已通过（上一发布版本 0.4.0.7161，2026-07-17）：

- `npm.cmd --prefix electron run verify:version`
- Runtime / Electron typecheck 与 build
- `npm.cmd --prefix electron run pack:win`
- `奥德赛0.4.0.7161.exe` PE 元数据：`ProductName=奥德赛0.4.0.7161`、`FileVersion=0.4.0.7161`、`ProductVersion=0.4.0.7161`
- 本轮尚未重新执行 exe 启动和 ESP32-S3 实机闭环，详见 `docs/WINDOWS_0_4_0_7161_TEST_REPORT.md`

下方 0.4.0-7171、0.4.0.7161、0.1.0 的记录均为历史验证事实；当前 1.0.0-7201 的验证以紧随其后的 2026-07-21 记录为准。

已通过（随包 Python、MCP、串口助手与触摸板回归，2026-07-21）：

- 动态 MCP 配置补齐 `mcp` 参数；开发模式以 `ELECTRON_RUN_AS_NODE=1` 启动，stdio initialize handshake 成功。
- 最终包只使用 `resources/runtime/python/Scripts/python.exe`，`pyserial 3.5` 可导入；旧 `idf-tools/python_env` 未进入包内。
- 打包版使用同一 Python 完成 `hello_world_esp32s3` 冷构建 1047/1047。
- `touch_hello` 面向 Waveshare ESP32-S3-Touch-AMOLED-1.8，已在 COM5 编译、烧录并验证触摸输出 `hello`。
- 内置串口助手支持完整参数、文本/HEX 双向收发、编码和行尾；COM5 枚举、打开、关闭释放均通过界面验证。
- 串口助手保持左侧收发/右侧配置布局，并按 `apple-design` 原则适配浅色/深色主题、材质、状态反馈和辅助功能媒体查询；趋势图已删除。
- `npm.cmd --prefix runtime run typecheck`、`npm.cmd --prefix runtime run build`、`npm.cmd --prefix electron run typecheck`、main/renderer build 和 `npm.cmd --prefix electron run pack:win` 通过。

已通过（应用主题与可拖动外观入口，2026-07-21）：

- `npm.cmd --prefix electron run typecheck`、renderer 生产构建和 Windows `pack:win` 通过；品牌切换后的最终验证对象改为 `Catnip Forge.exe`。
- 深色 `#131315` 与浅色 `#e9eaed` 可由应用内菜单切换；页面重载后主题仍保持，最终验收状态恢复为深色。
- 使用成品窗口真实指针事件将按钮拖至 `(100,100)`，松开后 `is-dragging` 正常清除，坐标写入 `vibeide.appearance.position`，页面重载后位置保持。
- 按钮位于左上区域时浮层自动向右下展开，实测边界完全位于视口内；最终按钮移回右侧、距底部约 86px，不遮挡字号工具条。

已通过（任务状态 UI 与 packaged Skills 路径，2026-07-21）：

- Build 行“编译工程”静态文字已替换为“刷新工程”按钮；成品点击后工程下拉保持 4 个选项。Build/Flash 标识改为透明底，等待/输入/运行/成功/失败使用 Apple 语义状态胶囊。
- 修复 Skills 卡片路径为 `win-unpacked/resources/agent/skills`；成品仓库页列出 12 个可见 Skills 文件，点击“在资源管理器中打开”成功。
- 目录打开反馈显示绿色短状态，完整路径放在悬停提示；成功后仓库标题正文宽 632px、头部高 147px，没有再被长错误挤成竖排。
- Electron typecheck、renderer build、Windows `pack:win` 和 `git diff --check` 通过。

已通过（原生 Skill 部署与仓库页管理，2026-07-21）：

- Electron typecheck、main/renderer build、Windows `pack:win`、`verify:skills`、`verify:hardboard`。
- 12 个随包 Skill 已标准化部署，普通 Electron 编译不触发 Hardboard，ESP32 任务推荐 `/espidf-hardboard`。
- `smoke:workbench` 已改用隔离临时 userData，但本机 Electron GPU 子进程仍以 `0xC0000135` 退出，未获得 UI 结果；需在具备完整图形运行依赖的桌面环境补跑。

已通过（Windows v1.0.0 便携发布，2026-07-21）：

- Catnip Forge 最终 `win-unpacked` 共 `4,463,704,603` 字节，入口为 `Catnip Forge.exe`，PE 文件版本和产品版本均为 `1.0.0.7201`。
- `verify:release` 验证便携 Node `v22.14.0`、pyserial `3.5`、Claude Code `2.1.167`、Runtime health、12 个 Skills、Playwright 与 ESP-IDF 资源。
- 成品无 Key 实际启动后首次配置窗口正常，模板占位 Key 被拒绝；验证结束后 `resources/apikey.txt` 不存在。
- 当前 exe 未做商业代码签名，换机运行可能出现 SmartScreen；正式对外分发前应配置可信代码签名证书。

已通过（Electron Apple UI 与 1.0.0-7201，2026-07-20）：

- 全面移除 NES.css 依赖与像素式控件表达，新增 `styles/apple.less` 冷色材质与无障碍覆盖。
- 仓库页显示硬件工程、参考代码和 Skills；Agent 工作区不再显示为仓库卡片，但仍作为编辑器受控根目录。
- 任务历史清除不再被残留 PID/运行状态阻止，界面即时归零，Runtime 删除 EventBus 与 `.log` 文件。
- 监视器确认使用真实 `pyserial`；2026-07-21 已升级为双向串口助手并删除数值趋势图，见下方最新验证。
- 编辑器标签等宽分配，关闭按钮有 hover/focus 反馈，右键菜单使用 Portal 贴近鼠标定位。
- 详细施工基线见 `docs/ELECTRON_APPLE_UI_CONSTRUCTION.md`。

已通过（编辑器功能 `5afcef3`、交互修复 `63992ea`，2026-07-18）：

- `npm.cmd --prefix electron run typecheck`
- `npm.cmd --prefix electron run build:main`
- `npm.cmd --prefix electron run build:renderer`
- `git diff --check`
- 开发预览已启动，Vite `5173` 与 Electron CDP `9230` 正常监听
- `pytest tests/test_project.py` 未执行：当前 PowerShell 环境没有 `pytest` 命令，不能记录为通过

已通过（Agent 任务串行化修复 `39ef92d`，2026-07-18）：

- `npm.cmd --prefix electron run typecheck`
- `npm.cmd --prefix electron run build:main`
- `npm.cmd --prefix electron run build:renderer`
- `npm.cmd --prefix electron run verify:task-queue`
- `npm.cmd --prefix electron run verify:session`
- `npm.cmd --prefix electron run verify:hardboard`
- `git diff --check`
- Renderer 大包提示和 Electron `os_crypt_win.cc` 本机凭据解密告警仍存在，但上述命令退出码均为 0；本轮未调用真实 Agent 做高成本联调

已通过（Agent 任务取消竞态加固，2026-07-20）：

- `npm.cmd --prefix electron run typecheck`
- `npm.cmd --prefix electron run build:main`
- `npm.cmd --prefix electron run build:renderer`
- `npm.cmd --prefix electron run verify:task-queue`
- `npm.cmd --prefix electron run verify:session`
- `npm.cmd --prefix electron run verify:hardboard`
- `git diff --check`
- Renderer 大包提示和 Electron `os_crypt_win.cc` 本机凭据解密告警仍存在，但命令退出码均为 0

已通过（Runtime 日志真实清理 `25065b4`，2026-07-20）：

- `npm.cmd --prefix runtime run verify:event-clear`
- `npm.cmd --prefix runtime run build`
- `npm.cmd --prefix electron run typecheck`
- `npm.cmd --prefix electron run build:main`
- `npm.cmd --prefix electron run build:renderer`
- `npm.cmd --prefix electron run verify:task-queue`
- `npm.cmd --prefix electron run verify:session`
- `npm.cmd --prefix electron run verify:hardboard`
- `git diff --check`

已通过（历史 E 盘验证）：

- 打包版 runtime `hardboard:env`
- 打包版 runtime `hardboard:devices`
- `wifi_connect_fmai` 编译通过
- `wifi_connect_fmai` 烧录 `COM7` 通过，hash verified
- `hello_world_esp32s3` 编译通过
- `hello_world_esp32s3` 烧录 `COM7` 通过，hash verified

历史 0.1 包剩余问题（当前 1.0.0-7201 已用 COM5/`touch_hello` 完成新闭环）：

- `hardboard:serial` 可以打开 `COM7` / `COM8` 并生成日志，但当前没有抓到应用层 `Hello world!` 输出。
- `COM9` 打开失败，Windows 返回串口超时。
- 后续应给串口工具增加明确的 reset/open 时序选项，例如 `none`、`rts`、`idf-monitor`，并在 UI 上把”端口已打开但无数据”显示清楚。

## 当前 UI 状态

- 顶部可见页签：仓库、监视器、任务管理器、编辑器。
- 工作台：前端入口已隐藏；React 内部逻辑、IPC、`WebContentsView` 和主进程后端暂时保留，避免贸然删除早期链路。
- 监视器：使用随包 Python 的真实双向 `pyserial` 服务；左侧为接收/发送区，右侧为串口/接收/发送配置，支持文本与 HEX；数值趋势图已删除。
- 主布局：左侧默认 34%，支持拖动、键盘微调、宽度持久化以及收起/展开对话区。
- Agent 对话：同一时间只运行一个活动任务；执行中“追加要求”会在当前任务下一执行点继续处理，“排队”才建立独立后续任务。标题显示空闲/执行中/暂停，状态条显示追加与排队数量，输入框支持 `Shift+Enter` 换行。
- 可读性：界面已放弃像素风；中文正文使用系统字体，代码和日志使用等宽字体，基础正文 15px，控件和元信息同步增大并提高对比度。
- 任务管理器：先从 `hardboard/projects/<name>` 相对路径选择工程，再执行对齐的 Build/Flash 控制；Build/Flash 第二列分别刷新工程/设备，状态为语义胶囊；旧文件选择器、源码预览和 PID/Task/Tool 摘要块已移除。
- 任务诊断：实时日志、完整日志、事件卡片按需打开；最近任务结果按 `taskId` 汇总并支持滚动。任一“清除”都会立即清空旧记录并删除 EventBus 历史和 Hardboard `.log` 文件，不再因残留运行状态拒绝或回滚界面。
- 日志定位：点击某条任务的“查看”会在完整日志中自动定位对应 `taskId`；失败使用克制红色，其余状态避免突兀高饱和强调。
- 编辑器：左侧显示 Agent 工作区、硬件工程、参考代码和 Skills 四个受控根目录，目录按需展开；右侧使用 Monaco Editor，支持语法高亮、等宽弹性多文件标签、`Ctrl+S` 保存和关闭。
- 编辑器空状态：标签栏提示、未打开路径和代码区说明使用主题文字令牌；旧版固定深蓝色不再覆盖深色主题。修复后 Electron typecheck、renderer build、Windows `pack:win` 与 `git diff --check` 已通过，并已启动成品复测。
- 编辑器字号：底部提供减小、增大和重置，范围 10–24px，使用 `localStorage` 保存用户上次字号。
- 编辑器文件管理：目录右键可新建文件/文件夹，文件和子目录可重命名或移到系统回收站，所有节点可刷新；新建、重命名和删除确认均使用软件内置对话框。主进程只允许操作工作台许可范围，禁止覆盖同名条目和修改资源管理器根目录。
- 仓库：显示硬件工程、参考代码和 Skills，不显示“Agent 生成”及“导入文件夹”。左侧对话输入区提供 Skills 按钮，选中项以标签进入输入区并在发送时自动注入命令。

## 必读顺序

```bash
sed -n '1,220p' docs/HANDOFF.md
sed -n '1,220p' docs/INDEX.md
sed -n '1,220p' docs/LOG.md
sed -n '1,240p' docs/WINDOWS_0_1_TEST_REPORT.md
sed -n '1,220p' docs/WINDOWS_0_1_MIGRATION_CONSTRUCTION.md
```

如涉及硬件：

```bash
sed -n '1,240p' docs/HARDBOARD_CONSTRUCTION.md
sed -n '1,220p' runtime/hardboard/doc/README.md
```

## 开工检查

```powershell
cd E:\Agent\vibeide\vibeide
git status --short
git branch --show-current
git remote -v
git log --oneline -5
```

不要使用 `git reset --hard` 或 `git checkout --` 回滚文件，除非用户明确要求。

## SSH 注意事项

Windows 中文用户名（刘天凯）路径导致 Git Bash 中 ssh.exe 编码异常：

```bash
# ~/.ssh/config 已配置 IdentityFile，但需额外设置：
git config --global core.sshCommand 'ssh -i /d/ssh-home/.ssh/id_ed25519 -o UserKnownHostsFile=/d/ssh-home/.ssh/known_hosts'
```

## 验证命令

```bash
npm --prefix runtime run build
npm --prefix electron run typecheck
npm --prefix electron run build:main
npm --prefix electron run build:renderer
npm --prefix electron run pack:win
npm --prefix electron run stamp:win -- "dist-package/win-unpacked/Catnip Forge.exe"
```

如果改了 Agent session 或 hardboard context：

```bash
npm --prefix electron run verify:session
npm --prefix electron run verify:hardboard
```

## 打包版 runtime 验证

```cmd
cd /d E:\Agent\vibeide\vibeide\electron\dist-package\win-unpacked\resources\runtime
node dist\index.js hardboard:env
node dist\index.js hardboard:devices
node dist\index.js hardboard:build hardboard\projects\hello_world_esp32s3
node dist\index.js hardboard:flash hardboard\projects\hello_world_esp32s3 COM7
node dist\index.js hardboard:serial COM7 10 115200
```

注意：历史 0.1 包的 `hardboard:serial` 无应用输出只作为旧测试事实保留；当前版本报告串口成功仍必须附带具体端口、工程和实际捕获内容。

## 同步策略

当前接力以 `E:\Agent\vibeide\vibeide`（Windows 实机）为唯一编辑主场：

1. 本机改代码和文档。
2. 本机验证（typecheck / build / pack）。
3. 提交到 Git。
4. 推送到 `https://github.com/NeilBaumanMax/vibeide_Neil.git`。
5. `git config core.sshCommand` 已配置解决中文路径问题。

不要提交：

- `.local-secrets/`
- `node_modules/`
- `electron/dist/`
- `electron/dist-package/`
- `runtime/dist/`
- `runtime/chrome_profile/`
- `runtime/recordings/`
- `runtime/workflows/`
- `runtime/workbench-imports.json`
- `agent/logs/`
- `agent/screenshots/`
- `apikey.txt`
- `.env`

## 架构边界

```text
Electron UI -> Gateway -> Worker -> Agent -> Runtime MCP -> Electron Chromium / ESP-IDF hardboard
```

- Gateway 是唯一 IPC 入口。
- Runtime 不调 LLM，只负责 MCP tools、CDP、硬件命令、录制回放和存储。
- Agent 不直接碰 Playwright，不写脚本操作浏览器，浏览器操作必须走 MCP。
- hardboard 工具调用优先使用相对路径：`hardboard\projects\<project>`。
- 查 hardboard 工程文件不要扫 `build/**`，先读 `main/CMakeLists.txt` 的 `SRCS`。

## 下一步建议

1. 对编辑器新建、重命名、回收站删除、字号持久化和打包版离线语法高亮执行一轮 Windows UI smoke，重点覆盖已打开标签的路径同步。
2. 根据启动和包体实测决定是否拆分 Monaco 语言资源；当前完整 Worker 已本地打包。
3. 修复 `hardboard:serial` 的 reset/open 时序和 UI 状态呈现。
4. 给任务管理器补一条 Windows packaged runtime smoke，覆盖 build/flash/serial 三个入口。
5. 发布 `1.0.0-7201` Windows 包后，新建对应版本报告；旧版本报告继续保留为历史实测。
6. 在 ESP-IDF 真实编译测试通过后，补全 `WINDOWS_0_1_TEST_REPORT.md` 的中文路径修复验证项。
