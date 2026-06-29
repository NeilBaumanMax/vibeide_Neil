# 奥德赛0.0 接力开发文档

> 本文是下一次 Codex 接力的第一入口。敏感账号密码不写在本文，见本机私有文件 `.local-secrets/HANDOFF_PRIVATE.md`，该目录已被 `.gitignore` 排除。

## 当前事实

- 当前日期：2026-06-29。
- 正式产品名：奥德赛0.0。
- 内部工程代号：`vibeide`。
- 当前本机工作目录：`/home/howtion/桌面/hardvibecoding/vibeide`。
- Windows SSH：`hp@192.168.137.1`。
- Windows 机器名：`LAPTOP-JQQD9L56`。
- Windows 源码目录：
  - `C:\vibeide`
  - `E:\vibeide`
- Windows 0.1 unpacked 包：
  - `E:\vibeide-0.1-win-unpacked`
  - `E:\vibeide-0.1-win-unpacked\奥德赛0.0.exe`
- 备份 GitHub：`git@github.com:howtion0/vibeide.git`，`main` 已推到 `e3572e5`。
- 旧 GitHub/历史源：`git@github.com:howtio/vibeide.git` 仍可能出现在旧文档或 remote 里，当前接力优先以 `howtion0/vibeide` 的备份结果为准。

## 当前版本和验证

- Electron package 版本：`0.1.0`。
- Windows exe PE 版本已验证：
  - `FileVersion=0.1.0`
  - `ProductVersion=0.1.0`
- E 盘源码里已有测试报告：
  - `E:\vibeide\docs\WINDOWS_0_1_TEST_REPORT.md`
- 本机对应报告：
  - `docs/WINDOWS_0_1_TEST_REPORT.md`

已通过：

- Windows `npm --prefix runtime run build`
- Windows `npm --prefix electron run typecheck`
- Windows `npm --prefix electron run build:main`
- Windows `npm --prefix electron run build:renderer`
- Windows `npm --prefix electron run pack:win`
- 打包版 runtime `hardboard:env`
- 打包版 runtime `hardboard:devices`
- `wifi_connect_fmai` 编译通过
- `wifi_connect_fmai` 烧录 `COM7` 通过，hash verified
- `hello_world_esp32s3` 编译通过
- `hello_world_esp32s3` 烧录 `COM7` 通过，hash verified

剩余问题：

- `hardboard:serial` 可以打开 `COM7` / `COM8` 并生成日志，但当前没有抓到应用层 `Hello world!` 输出。
- `COM9` 打开失败，Windows 返回串口超时。
- 后续应给串口工具增加明确的 reset/open 时序选项，例如 `none`、`rts`、`idf-monitor`，并在 UI 上把“端口已打开但无数据”显示清楚。

## 当前 UI 状态

- 顶部页签：工作台、仓库、监视器、任务管理器、编辑器。
- 工作台：已复原为浏览器工作台。
- 监视器：已复原为串口监视器。
- 任务管理器：合并了编译/烧录控制、进度、runtime 事件、任务/进程日志。
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

```bash
cd /home/howtion/桌面/hardvibecoding/vibeide
git status --short
git branch --show-current
git remote -v
git log --oneline -5
```

不要使用 `git reset --hard` 或 `git checkout --` 回滚文件，除非用户明确要求。

## Windows SSH 模式

从本机执行 Windows 命令：

```bash
SSHPASS='<本机私有密码>' sshpass -e ssh -o StrictHostKeyChecking=no hp@192.168.137.1 "cmd /d /s /c \"cd /d E:\\vibeide && git status --short\""
```

密码只从 `.local-secrets/HANDOFF_PRIVATE.md` 读取，不写入公开文档、提交信息或最终回复。

## 本机验证

```bash
npm --prefix runtime run build
npm --prefix electron run typecheck
npm --prefix electron run build:main
npm --prefix electron run build:renderer
```

如果改了 Agent session 或 hardboard context：

```bash
npm --prefix electron run verify:session
npm --prefix electron run verify:hardboard
```

## Windows 验证

源码验证：

```bash
SSHPASS='<本机私有密码>' sshpass -e ssh -o StrictHostKeyChecking=no hp@192.168.137.1 "cmd /d /s /c \"cd /d E:\\vibeide && npm --prefix runtime run build && npm --prefix electron run typecheck && npm --prefix electron run build:main && npm --prefix electron run build:renderer\""
```

打包：

```bash
SSHPASS='<本机私有密码>' sshpass -e ssh -o StrictHostKeyChecking=no hp@192.168.137.1 "cmd /d /s /c \"cd /d E:\\vibeide && npm --prefix electron run pack:win\""
```

打包版 runtime 验证：

```cmd
cd /d E:\vibeide-0.1-win-unpacked\resources\runtime
node dist\index.js hardboard:env
node dist\index.js hardboard:devices
node dist\index.js hardboard:build hardboard\projects\hello_world_esp32s3
node dist\index.js hardboard:flash hardboard\projects\hello_world_esp32s3 COM7
node dist\index.js hardboard:serial COM7 10 115200
```

注意：当前 `hardboard:serial` 无应用输出是已知剩余问题，不要把它记录成通过。

## 同步策略

当前接力以本机源码为编辑主场：

1. 本机改代码和文档。
2. 本机验证。
3. 提交到 Git。
4. 推送到 `git@github.com:howtion0/vibeide.git`。
5. 如需 Windows 运行，使用 `git archive` / `robocopy` / `scp` 同步到 `C:\vibeide` 和 `E:\vibeide`。

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
3. 清理旧文档中仍作为历史记录出现的 `0.3.0`、`Runtime UI v2`、`howtio` 描述，保留时必须标明“历史记录”。
4. 如果继续发布 Windows 包，把版本从 `0.1.0` 递增，并同步更新 `docs/WINDOWS_0_1_TEST_REPORT.md` 或新建对应版本报告。
