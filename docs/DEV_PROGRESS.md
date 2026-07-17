# 开发进度

> 以当前代码为准。

---

## 当前版本

奥德赛0.4.0-7171；当前发布版本 `0.4.0-7171`，Windows PE 四段版本映射为 `0.4.0.7171`

---

## 当前已落地

- [x] GitHub 仓库 `https://github.com/NeilBaumanMax/vibeide_Neil.git` 已作为当前接力源码仓库接入本机
- [x] 已同步源码到 Windows `C:\vibeide` 和 `E:\vibeide`，排除依赖、构建产物、运行态和密钥
- [x] README 已重写为奥德赛0.4.0-7171 当前 Electron + Runtime + Agent 主线，`vibeide` 保留为仓库和内部工程代号
- [x] 新文档体系已建立：INDEX / ARCHITECTURE / DEVELOPMENT / GITHUB_SYNC / REFACTOR_PLAN / SECURITY / HANDOFF
- [x] Claude CLI 已接入软件级持续会话上下文，最近轮次持久化到 `runtime/claude-session/`
- [x] Claude CLI 启动增加 `--continue` 续接策略，并用 prompt 注入作为兜底
- [x] Electron 前端已重构为 NES.css / 蓝白机视觉
- [x] 右侧工作台文件 / 目录现在可点击，会在右侧浏览页层打开 `file://` 地址
- [x] 新增 Electron 工作台点击烟测：`cd electron && npm run smoke:workbench`
- [x] 新增 Claude 软件会话记忆烟测：`cd electron && npm run verify:session`
- [x] Windows `E:\vibeide` 已同步到 0.1 接力版本；`E:\vibeide-0.1-win-unpacked` 已通过 exe 版本、编译和烧录验证
- [x] 应用图标已新增像素风 `electron/assets/icon.svg/png/ico`
- [x] 产品名、Windows PE 版本和 npm SemVer 已统一映射到奥德赛0.4.0-7171，并停止把真实 `apikey.txt` 打进安装包
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
- [x] hardboard runtime 打包版已使用短路径 `%LOCALAPPDATA%\vibeide-hardboard-runtime\hardboard`，支持相对项目路径
- [x] `hardboard.idf_build` / `hardboard.idf_flash` 已改为 compact 输出，完整 stdout/stderr 写入 `runtime/hardboard/logs/*.log`
- [x] `agent/skills/espidf_hardboard.md` 已补齐 docsDir/projectsDir、排除 build、先读 `main/CMakeLists.txt` 的文件定位规则
- [x] Runtime task / pid / eventbus / heartbeat / hardboard build-flash events 已接入任务管理器
- [x] 编辑器页支持多文件标签，仓库页支持导入和移除文件夹
- [x] Electron 左右栏默认比例调整为 34%，支持拖动、键盘微调、宽度持久化和对话区收起/展开
- [x] Electron 中文正文、日志、按钮和标签完成可读性与控件尺寸修正，代码/串口/日志统一使用等宽字体
- [x] 任务管理器改为“先选相对工程，再 Build/Flash”，工程列表来自 `runtime/hardboard/projects`，两行控件、状态和进度统一对齐
- [x] 任务管理器删除旧文件选择器、源码预览和进程摘要块；实时日志、完整日志、事件卡片改为按需诊断卡片
- [x] 最近任务结果按 `taskId` 聚合并区分成功/失败颜色，支持滚动、独立清除、查看对应日志和按状态高亮定位
- [x] 实时日志、完整日志、事件卡片和最近任务结果均支持独立前端清除，不删除后端 EventBus 数据
- [x] 文档路径漂移已修正：当前 Windows 工作区统一为 `E:\Agent\vibeide\vibeide`，旧 Linux、`C:\vibeide`、`D:\vibeide` 和 `E:\vibeide` 路径仅作为历史迁移记录保留
- [x] `ARCHITECTURE.md` 已补齐 Runtime hardboard/eventbus/process/task/MCP 子系统和 Electron hardboard/paths/agent/first-run/tray/session-store 模块
- [x] 删除已被 Electron 动态 MCP 配置取代的 `runtime/mcp-config.json`、孤立根 `package-lock.json`，并清理活动脚本中的旧 `coffecat` 名称和绝对路径
- [ ] `hardboard:serial` 在历史 Windows v0.1.0 包中能打开端口但未抓到应用层输出，需要后续修复 reset/open 时序

---

## 当前架构现状

```text
Electron Window
├── Agent 对话与任务输出
├── 仓库：默认分组 + 可导入/移除文件夹
├── 监视器：串口监视器
├── 任务管理器：相对工程选择、build/flash、状态进度、按需日志和最近任务结果
├── 编辑器：源码/Markdown 多文件标签
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
2. Windows 正式目录 `C:\vibeide` 已作为 Git 工作目录使用，后续继续通过 GitHub pull 接力。
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
