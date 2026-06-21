# 施工日志

> 当前日志只保留对现代码仍然成立的记录。

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

- 仓库：
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
  - Windows `C:\vibecodingide` 源码已同步到本机，排除依赖、构建产物、运行态和密钥

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
