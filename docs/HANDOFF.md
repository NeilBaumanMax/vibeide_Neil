# 奥德赛0.4.0-7171 接力开发文档

> 本文是下一次 Codex 接力的第一入口。敏感账号密码不写在本文，见本机私有文件 `.local-secrets/HANDOFF_PRIVATE.md`，该目录已被 `.gitignore` 排除。

## 当前事实

- 当前日期：2026-07-17。
- 正式产品名：奥德赛0.4.0-7171。
- 内部工程代号：`vibeide`。
- 当前本机工作目录：`E:\Agent\vibeide\vibeide`（Windows 实机）。
- 当前 GitHub：`https://github.com/NeilBaumanMax/vibeide_Neil.git`；当前本机记录的 `origin/main` 位于 `5e6ba3b`。
- 当前施工分支：`electron_fix_neil`。版本/隐藏工作台提交为 `76a3683`，任务管理器 UI 与首轮文档同步提交为 `b428a0e`；远端推送曾因 GitHub HTTPS 连接重置失败，当前仍以本地 Git 日志为准。
- 旧 GitHub/历史源：`git@github.com:howtion0/vibeide.git`、`git@github.com:howtio/vibeide.git` 仍可能出现在历史日志或迁移文档中，不再作为当前同步目标。

## 当前版本和验证

- 当前发布版本：`0.4.0-7171`；Windows PE 四段版本映射为 `0.4.0.7171`。
- `electron_fix_neil` 当前源码已通过 Runtime build、Electron typecheck、main/renderer build、版本一致性和 `git diff --check`；尚未执行本版本 Windows 打包及真实硬件回归。
- 上一版 Windows exe PE 版本已验证（历史 v0.1.0）：
  - `FileVersion=0.1.0`
  - `ProductVersion=0.1.0`
- 本机源码目录：`E:\Agent\vibeide\vibeide`
- 目标打包 exe：`electron\dist-package\win-unpacked\奥德赛0.4.0-7171.exe`
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
  - Python venv 绑定旧机器 HP 路径 → 优先系统 Python
  - 缺少 `espidf.constraints` → 运行时自动生成
  - 便携 Python 3.12.9 + ESP-IDF 56 依赖包已装好

已通过（上一发布版本 0.4.0.7161，2026-07-17）：

- `npm.cmd --prefix electron run verify:version`
- Runtime / Electron typecheck 与 build
- `npm.cmd --prefix electron run pack:win`
- `奥德赛0.4.0.7161.exe` PE 元数据：`ProductName=奥德赛0.4.0.7161`、`FileVersion=0.4.0.7161`、`ProductVersion=0.4.0.7161`
- 本轮尚未重新执行 exe 启动和 ESP32-S3 实机闭环，详见 `docs/WINDOWS_0_4_0_7161_TEST_REPORT.md`

当前 `0.4.0-7171` 正在 `electron_fix_neil` 分支施工，版本一致性、编译和打包结果以本轮完成后的验证记录为准。

已通过（历史 E 盘验证）：

- 打包版 runtime `hardboard:env`
- 打包版 runtime `hardboard:devices`
- `wifi_connect_fmai` 编译通过
- `wifi_connect_fmai` 烧录 `COM7` 通过，hash verified
- `hello_world_esp32s3` 编译通过
- `hello_world_esp32s3` 烧录 `COM7` 通过，hash verified

剩余问题：

- `hardboard:serial` 可以打开 `COM7` / `COM8` 并生成日志，但当前没有抓到应用层 `Hello world!` 输出。
- `COM9` 打开失败，Windows 返回串口超时。
- 后续应给串口工具增加明确的 reset/open 时序选项，例如 `none`、`rts`、`idf-monitor`，并在 UI 上把”端口已打开但无数据”显示清楚。

## 当前 UI 状态

- 顶部可见页签：仓库、监视器、任务管理器、编辑器。
- 工作台：前端入口已隐藏；React 内部逻辑、IPC、`WebContentsView` 和主进程后端暂时保留，避免贸然删除早期链路。
- 监视器：已复原为串口监视器。
- 主布局：左侧默认 34%，支持拖动、键盘微调、宽度持久化以及收起/展开对话区。
- 可读性：中文正文改用系统字体，代码和日志使用等宽字体，按钮、下拉框和标签尺寸已与增大的字号同步。
- 任务管理器：先从 `hardboard/projects/<name>` 相对路径选择工程，再执行对齐的 Build/Flash 控制；旧文件选择器、源码预览和 PID/Task/Tool 摘要块已移除。
- 任务诊断：实时日志、完整日志、事件卡片按需打开；最近任务结果按 `taskId` 汇总，成功/失败颜色分离，支持滚动和独立清除。
- 日志定位：点击某条任务的“查看”会在完整日志中自动定位对应 `taskId`，成功段绿色高亮、失败段红色高亮。
- 编辑器：用于代码和 Markdown 阅读/编辑，支持多文件标签、切换、保存、关闭。
- 仓库：默认分组不显示施工文档；支持导入文件夹，导入分组支持移除。
- 运行态导入文件记录在 `runtime/workbench-imports.json`，该文件已被 `.gitignore` 忽略。

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
npm --prefix electron run stamp:win -- "dist-package/win-unpacked/奥德赛0.4.0-7171.exe"
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

注意：当前 `hardboard:serial` 无应用输出是已知剩余问题，不要把它记录成通过。

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

1. 修复 `hardboard:serial` 的 reset/open 时序和 UI 状态呈现。
2. 给任务管理器补一条 Windows packaged runtime smoke，覆盖 build/flash/serial 三个入口。
3. 清理旧文档中仍作为历史记录出现的 `0.3.0`、`Runtime UI v2`、`howtio` 描述，保留时必须标明”历史记录”。
4. 发布 `0.4.0-7171` Windows 包后，新建对应版本报告；旧版本报告继续保留为历史实测。
5. 在 ESP-IDF 真实编译测试通过后，补全 `WINDOWS_0_1_TEST_REPORT.md` 的中文路径修复验证项。
6. 考虑把便携 Python 打包到 `resources/runtime/python/` 作为 ESP-IDF 编译的默认 Python（当前优先系统 Python）。
