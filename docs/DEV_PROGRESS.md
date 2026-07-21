# 开发进度

> 以当前代码为准。

---

## 当前版本

对外发布版 `v1.0.0`；内部构建号 `7201`，npm 包版本 `1.0.0-7201`，Windows PE 四段版本映射为 `1.0.0.7201`

---

## 当前已落地

- [x] 新增 Catnip Forge 品牌启动界面：三张透明素材完整落地，工作区、开发环境、Renderer 与主窗口 ready 节点驱动真实阶段进度，完成后自动切换主窗口
- [x] 新增启动页 CDP 烟测 `npm.cmd --prefix electron run verify:splash-ui`，覆盖素材加载、双语文案、系统字体栈、进度更新、窗口边界和截图验收
- [x] GitHub 仓库 `https://github.com/NeilBaumanMax/vibeide_Neil.git` 已作为当前接力源码仓库接入本机
- [x] 当前唯一施工源码目录已统一为 Windows `E:\Agent\vibeide\vibeide`；旧 `C:\vibeide` 和 `E:\vibeide` 仅保留在历史迁移记录中
- [x] README 已重写为 Catnip Forge 当前 Electron + Runtime + Agent 主线，`vibeide` 保留为仓库和内部工程代号
- [x] 新文档体系已建立：INDEX / ARCHITECTURE / DEVELOPMENT / GITHUB_SYNC / REFACTOR_PLAN / SECURITY / HANDOFF
- [x] Claude CLI 已接入软件级持续会话上下文，最近轮次持久化到 `runtime/claude-session/`
- [x] Claude CLI 启动增加 `--continue` 续接策略，并用 prompt 注入作为兜底
- [x] Agent 对话改为单活动任务：执行中发送默认追加到当前任务，显式“排队”才创建下一任务；状态、消息和结果使用 `taskId` 关联
- [x] 新增 Agent 任务队列烟测：`npm.cmd --prefix electron run verify:task-queue`
- [x] Agent 异步完成回调绑定活动 `taskId`：停止或切换任务后，旧 turn/页面验收/恢复回调会被忽略；烟测覆盖取消竞态和停止清空追加/排队项
- [x] Agent 对话按产品回复/执行过程分层：PID、工具、system、Worker 状态和等待心跳按 `taskId` 聚合为默认收起的“执行过程”，专业视图可持久化展开，关键错误保持直显
- [x] Agent Markdown 改为安全 React 渲染，支持标题、列表、代码、引用、表格和受限协议链接；ANSI/控制字符与超长工具摘要同步清理
- [x] 新增 Agent 对话解析与成品 CDP 界面烟测：`npm.cmd --prefix electron run verify:chat-presentation` / `smoke:chat-ui`
- [x] 删除左栏独立“任务进度”步骤列表，改为跟随当前“执行过程”的紧凑运行仪表盘；只在 Agent 工作时显示，暂停或完成后自动隐藏
- [x] Agent 对话升级为可持久化的多会话系统：左侧历史列表支持新建、切换、收起和确认删除，右侧恢复完整消息，关闭重启后保持
- [x] 历史会话标签统一使用右侧“⋯”编辑菜单，支持原位重命名、持久化置顶/取消置顶和二次确认删除；成品界面烟测覆盖三项操作
- [x] 固定 `resources/agent/skills` 为唯一用户可维护 Skill 源仓库；旧扁平 Markdown 与标准 `<id>/SKILL.md` 并存，Agent 启动前部署到工作区 `.claude/skills`
- [x] 仓库标签页新增 Skill 专用管理器，支持新增、编辑、回收站删除、打开目录、立即同步及源仓库可写/部署状态
- [x] Agent 提示词由整篇 Skill 内容注入改为原生命令推荐，对话执行过程显示推荐与实际 Skill 工具调用；普通前端编译不再误触发 Hardboard
- [x] 左侧 Agent 对话输入区新增 Skills 选择器；选中 Skill 以标签呈现，发送时自动注入 `/skill-id`，用户无需手工输入命令
- [x] 便携包无 Key 首启时显示应用内配置窗口；只随包分发 `apikey.txt.example`，真实 Key 保存到当前解压目录 `resources/apikey.txt`
- [x] 首次保存 API Key 后显示“配置完成，正在重启”，由主进程自动 relaunch；用户无需手工关闭，重启后的 Agent 直接读取新 Key
- [x] 旧单会话 `session.json` 自动迁移为 v2；选中历史会话的最近问答真实注入 Agent 提示词，切换时重置常驻进程防止工程上下文串线
- [x] Electron 前端已全面放弃 NES.css / 像素视觉，改为 Apple 风格冷色材质、系统字体、克制边框和直接反馈
- [x] 深色/浅色主题已从持续跟随系统媒体查询改为应用内显式选择；首次读取系统偏好后持久化到 `vibeide.appearance.theme`，避免运行中因系统偏好变化突然切色
- [x] 右下角外观入口升级为“猫薄荷”软件助手：使用用户提供的形象，支持 Pointer Capture 拖动、坐标持久化、窗口边界约束和四象限展开；微型聊天框通过独立 DeepSeek V4 Flash 通道回答软件操作问题，标题栏保留深色/浅色切换
- [x] 猫薄荷悬浮入口改用透明全身素材，移除圆形底板、头像裁切和局部放大；角色本体完整显示，默认贴近右下角
- [x] 助手标题栏在深浅模式旁新增缩小/放大按钮，支持 96–208px、16px 分级和尺寸持久化；默认尺寸提升为 144px
- [x] 新增软件助手 CDP 界面烟测：`npm.cmd --prefix electron run verify:software-assistant-ui`，覆盖形象加载、浮层边界、欢迎语、输入框和主题操作按钮
- [x] 内置串口助手采用左侧收发、右侧配置布局，支持完整串口参数、文本/HEX 双向收发、编码与行尾控制；无用数值趋势图已删除，并适配整体浅色/深色材质
- [x] Windows 串口设备 CIM 枚举失败时自动回退到随包 `pyserial`，COM5 中文设备名、打开和关闭释放已完成打包版验证
- [x] Windows ESP-IDF 和串口统一使用 `resources/runtime/python/Scripts/python.exe`；旧 `esptools/idf-tools/python_env` 不再进入安装包，隔离模式由 `sitecustomize.py` 恢复脚本目录导入
- [x] Agent 动态 MCP 启动参数补齐 `mcp`；开发模式使用 `ELECTRON_RUN_AS_NODE=1`，stdio handshake 已验证
- [x] 右侧工作台文件 / 目录现在可点击，会在右侧浏览页层打开 `file://` 地址
- [x] 新增 Electron 工作台点击烟测：`cd electron && npm run smoke:workbench`
- [x] 新增 Claude 软件会话记忆烟测：`cd electron && npm run verify:session`
- [x] Windows `E:\vibeide` 已同步到 0.1 接力版本；`E:\vibeide-0.1-win-unpacked` 已通过 exe 版本、编译和烧录验证
- [x] 应用图标以 `electron/assets/icon-master.png` 为母版，派生 `icon.png`、多尺寸 `icon.ico` 和 Renderer 品牌图；旧 SVG/透明托盘占位方案已移除
- [x] 用户可见产品名统一为 Catnip Forge，中文全称为 Catnip 硬件智能开发平台，英文定位为 Autonomous Hardware Development Agent；版本继续独立映射，并停止把真实 `apikey.txt` 打进安装包
- [x] 右侧“工作台”前端入口已隐藏，早期浏览器工作台 React/IPC/WebContentsView 后端链路暂时保留
- [x] API Key 路径收敛到 `resources/apikey.txt`（与应用同目录），移除 `%APPDATA%` 持久化，删包即删 key
- [x] runtime/electron/agent package 命名已从 `@coffecat/*` 迁移到 `@vibeide/*`
- [x] Electron 33 + Vite 6 + React 18
- [x] Gateway / Worker / Agent / Runtime 四层分工
- [x] CDP 端口统一 `9230`
- [x] Agent 流式输出
- [x] 右侧原生浏览器区迁移到 `WebContentsView`
- [x] 右侧浏览器区支持多 tab
- [x] `window.open` / `_blank` 收成右侧 tab
- [x] 快捷任务：B 站搜索、股票搜索、贪吃蛇
- [x] 搜索任务提示词开始强制走 URL 工具
- [x] 通用搜索工具：`agent/tools/build_platform_search_url.mjs` / `agent/tools/build_platform_search_url.sh`
- [x] Runtime CLI 入口：`health / mcp / connect`
- [x] Runtime 卡片提取、录制、回放对齐参考代码主链路
- [x] Runtime 工作流持久化：录制 + 提取规则可保存成可复用流程
- [x] Python 辅助脚本：`scripts/normalize.py`、`scripts/reporter.py`
- [x] Electron 启动脚本补齐 runtime 状态目录初始化与健康检查
- [x] Electron 右侧浏览器区登录态改为持久化保存到 `runtime/chrome_profile/electron-shell`
- [x] Electron 右侧浏览器区录制/回放按钮可直接使用，录制结果保存到 `runtime/recordings/`
- [x] Agent 可直接通过 MCP 开始录制、停止录制、列出录制、回放录制、保存工作流、执行工作流
- [x] 右侧改成固定工作台主页 + 可切换浏览页层
- [x] 原生浏览页宿主改为跟随 renderer 实际可视容器尺寸同步
- [x] 原生浏览页宿主无有效 renderer bounds 时保持隐藏，避免首轮导航贴错位置
- [x] Worker 层搜索预处理：搜索 / 整理 / 排行任务会在 Agent 启动前先导航到明确平台的搜索结果页
- [x] Electron 右侧录制工具支持命名保存、按名字/文件选择重放，工作台展示录制/工作流摘要
- [x] Agent 增加回放优化 workflow skill，明确录制 / workflow / workspace / tools 的文件位置和复用方式
- [x] `windows1.0` 支线开始 Windows 启动与打包适配
- [x] 增加 Docker + Wine Windows 打包 smoke 测试入口
- [x] `agent/tools` 长期工具补齐 Windows `.cmd` / 跨平台 `.mjs` 入口
- [x] hardboard runtime 打包版将随包目录通过 junction 映射到短路径 `C:\vibeide-hw\hardboard`，开发版继续使用工作区 `runtime/hardboard`，并支持相对项目路径
- [x] `hardboard.idf_build` / `hardboard.idf_flash` 已改为 compact 输出，完整 stdout/stderr 写入 `runtime/hardboard/logs/*.log`
- [x] `agent/skills/espidf_hardboard.md` 已补齐 docsDir/projectsDir、排除 build、先读 `main/CMakeLists.txt` 的文件定位规则
- [x] Runtime task / pid / eventbus / heartbeat / hardboard build-flash events 已接入任务管理器
- [x] 编辑器页支持 Edge 风格等宽多文件标签；仓库页固定为四个受控仓库，每个仓库可在系统资源管理器中打开
- [x] 修复 Windows packaged Skills 路径从 `win-unpacked/agent/skills` 漂移的问题，当前由 `getAgentDir()` 正确解析到 `resources/agent/skills`；成品已列出 12 个 Skills 文件并成功打开目录
- [x] 仓库目录打开反馈改为短状态与悬停详情，标题正文可收缩、操作区限制宽度，长 ENOENT 不再把仓库标题挤成竖排
- [x] 编辑器升级为 VS Code 风格两栏布局：左侧按仓库分组显示多根文件资源管理器并懒加载目录，右侧保留多文件标签、当前路径、保存状态和 Monaco 代码区
- [x] Monaco、语言定义和 Worker 已随 Electron 本地打包；C/C++、CMake、Markdown、JSON、TypeScript 等文件支持语法高亮、行号、括号配色和代码缩略图
- [x] 文件资源管理器支持右键新建文件/文件夹、重命名、刷新和移到系统回收站；文件操作使用软件内置对话框，主进程限制允许路径、拒绝覆盖同名条目并保护根目录
- [x] 编辑器底部支持 10–24px 字号减小、增大和重置，并用 `localStorage` 保存用户上次字号
- [x] Electron 左右栏默认比例调整为 34%，支持拖动、键盘微调、宽度持久化和对话区收起/展开
- [x] Electron 中文正文、日志、按钮和标签完成可读性与控件尺寸修正，代码/串口/日志统一使用等宽字体
- [x] 任务管理器改为“先选相对工程，再 Build/Flash”，工程列表来自 `runtime/hardboard/projects`；Build/Flash 第二列分别提供刷新工程/刷新设备，状态改为内容宽度的 Apple 语义胶囊
- [x] 任务管理器删除旧文件选择器、源码预览和进程摘要块；实时日志、完整日志、事件卡片改为按需诊断卡片
- [x] 最近任务结果按 `taskId` 聚合并区分成功/失败颜色，支持滚动、清除、查看对应日志和按状态高亮定位
- [x] 任务管理器“清除”已改为直接真实清理：立即移除当前历史视图，删除 EventBus `events.jsonl`、重置状态并删除 Hardboard `.log` 文件；残留 PID/运行状态不再拒绝，非日志文件保留
- [x] 监视器使用真实 `pyserial` 双向后端；原“串口数值趋势”及数字采样状态已删除，收发区获得完整可用空间
- [x] 编辑器右键菜单通过 Portal 使用视口坐标贴近指针，关闭按钮补齐 hover/focus 反馈，字号控件改为圆角冷蓝按钮组
- [x] 编辑器“从左侧资源管理器选择文件”空标签提示已从旧固定深蓝色切换为主题次级文字令牌，深色/浅色背景均保持可读
- [x] 文档路径漂移已修正：当前 Windows 工作区统一为 `E:\Agent\vibeide\vibeide`，旧 Linux、`C:\vibeide`、`D:\vibeide` 和 `E:\vibeide` 路径仅作为历史迁移记录保留
- [x] `ARCHITECTURE.md` 已补齐 Runtime hardboard/eventbus/process/task/MCP 子系统和 Electron hardboard/paths/agent/first-run/tray/session-store 模块
- [x] 删除已被 Electron 动态 MCP 配置取代的 `runtime/mcp-config.json`、孤立根 `package-lock.json`，并清理活动脚本中的旧 `coffecat` 名称和绝对路径
- [x] 当前打包版已用 `touch_hello` / COM5 完成编译、烧录和串口 `hello` 输出验证；历史 v0.1.0 无输出问题不再作为当前阻塞项

---

## 当前架构现状

```text
Electron Window
├── Agent 对话与任务输出
├── 仓库页：硬件工程 / 参考代码 / Skills；Agent 工作区只保留在编辑器受控根目录
├── 监视器：串口监视器
├── 任务管理器：相对工程选择、build/flash、状态进度、按需日志和最近任务结果
├── 编辑器：多根文件树、Monaco 高亮、多文件标签、保存、字号和右键文件管理
├── 外观：持久化深色/浅色主题和可拖动悬浮设置入口
└── 工作台后端：浏览器、录制和 WebContentsView 链路保留，前端入口隐藏
```

```text
UI -> Gateway -> Worker -> Agent -> MCP -> Runtime -> Electron Chromium
```

---

## 当前文档已同步

- [README.md](../README.md)
- [docs/INDEX.md](INDEX.md)
- [docs/ARCHITECTURE.md](ARCHITECTURE.md)
- [docs/DEVELOPMENT.md](DEVELOPMENT.md)
- [docs/GITHUB_SYNC.md](GITHUB_SYNC.md)
- [docs/REFACTOR_PLAN.md](REFACTOR_PLAN.md)
- [docs/SECURITY.md](SECURITY.md)
- [docs/HANDOFF.md](HANDOFF.md)
- [docs/12_Docker_Windows_Smoke.md](12_Docker_Windows_Smoke.md)
- [docs/LOG.md](LOG.md)
- [docs/DEV_PROGRESS.md](DEV_PROGRESS.md)

---

## 当前已知问题

1. `tests/test_scaffold.py` 仍依赖旧 Python scaffold `src/coddecat`，与当前 Electron 主线不一致。
2. Monaco 当前随 renderer 完整打包，产物体积增加；后续应按启动性能决定是否拆分语言包或延迟加载。
3. `WebContentsView` 在 Linux/X11 下已增加无有效 bounds 隐藏保护，但仍需继续实机压测位置稳定性。
4. Worker 层已接入统一搜索预处理，但平台识别仍应随新增平台继续扩展和压测。
5. 个别 agent 规则文本仍使用旧词 `BrowserView`，语义上指的是“右侧浏览页层”。
6. `pytest tests/` 当前仍因仓库缺少 `src/coddecat` 实现而在收集阶段失败，不属于本轮 runtime 改动回归。
7. Runtime 录制/回放已接进 Electron 和 Agent，Electron UI 可命名和选择重放对象，但当前回放仍以 DOM 事件重放为主，复杂跨页流程还需继续压测。
8. Claude Code CLI 的真实模型续聊效果仍需 Windows 实机上用真实 Agent 调用确认；应用级 session context 与 `verify:session` 已作为可验证兜底。

---

## 下一步

1. 明确旧 Python scaffold 是否保留，统一测试口径。
2. 在 Windows 上继续用真实 Agent 对话压测 Claude Code CLI 的模型侧续聊效果。
3. 继续压测 Worker 搜索预处理在更多平台、更多自然语言表达下的稳定性。
4. 继续验证右侧 `workbench + host + tabs` 模型的稳定性。
5. 给更多平台补统一搜索 URL 工具和专项 workflow。
6. 继续增强录制/回放在真实业务站点上的稳定性，补充跨页和异常恢复。
7. 给工作流增加版本和结果校验策略，避免复用旧选择器失效。
