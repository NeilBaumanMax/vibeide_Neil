# 施工日志

> 当前日志只保留对现代码仍然成立的记录。

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
