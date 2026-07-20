# GitHub 同步和接力流程

## 目标

把 GitHub 仓库 `https://github.com/NeilBaumanMax/vibeide_Neil.git` 作为远端源码真相源，以 Windows 当前工作区 `E:\Agent\vibeide\vibeide` 为本地施工目录，避免旧迁移镜像继续分叉。

## 当前拓扑

```text
Windows 当前工作区
  E:\Agent\vibeide\vibeide
      ↑↓ git（HTTPS）
GitHub
  https://github.com/NeilBaumanMax/vibeide_Neil.git
```

历史迁移曾使用 Linux `/home/howtion/桌面/hardvibecoding/vibeide`、Windows `C:\vibeide`、`E:\vibeide` 和 `E:\vibeide-0.1-win-unpacked`。这些路径只用于理解旧日志和测试报告，不再作为当前开工、启动或打包目录。

## 已完成

- GitHub SSH 访问已验证。
- 当前本机记录的 `origin/main` 为 `5e6ba3b`；`electron_fix_neil` 本地基线为 `d10245d`。
- 当前施工分支为 `electron_design`；当前版本为 `1.0.0-7201`，最新本地功能提交为 `9848c33`（持久化主题与可拖动外观入口），其前一轮为 `508174a`（随包 Python 与双向串口工作流）；施工基线见 `docs/ELECTRON_APPLE_UI_CONSTRUCTION.md`。
- 本轮只维护本地 Git，不执行远端推送。需要同步时由用户明确决定并运行 `git push -u origin electron_design`。
- `electron_fix_neil` 早期推送曾因 GitHub HTTPS 连接重置失败；远端分支事实不能根据本地分支存在与否推断，必须以成功的 `git push` 或远端查询结果为准。
- Windows SSH 已连通。
- Windows 源码已同步到 `C:\vibeide` 和 `E:\vibeide`。
- Windows 0.1 unpacked 包已同步到 `E:\vibeide-0.1-win-unpacked`。
- 本机私有连接信息已写入 `.local-secrets/HANDOFF_PRIVATE.md`，该目录不会提交。

## 推荐长期流程

1. 本机从 GitHub 拉取：

```bash
git pull --ff-only origin main
```

2. 本机修改、验证、提交：

```bash
git status --short
git add <明确文件>
git commit -m "docs: refresh vibeide handoff and development docs"
git push -u origin <当前分支>
```

3. 新 Windows 工作区从 GitHub clone/pull：

```powershell
cd E:\Agent\vibeide
git clone https://github.com/NeilBaumanMax/vibeide_Neil.git vibeide
cd E:\Agent\vibeide\vibeide
npm --prefix runtime install
npm --prefix electron install
npm --prefix agent install
```

4. 日常只在 `E:\Agent\vibeide\vibeide` 修改、验证和提交。不要再把旧 C/E 盘镜像当作并行真相源。

## 历史：从 Windows 裸目录重新同步源码

以下命令只保留为 0.1 阶段的迁移记录，不用于当前 `E:\Agent\vibeide\vibeide` 工作区。当前应直接使用 Git 分支同步。

主源码包：

```bash
ssh hp@192.168.137.1 "tar -a -cf C:\Users\HP\AppData\Local\Temp\vibeide-source.zip --exclude=./electron/node_modules --exclude=./electron/dist-package --exclude=./electron/dist-package.zip --exclude=./agent/node_modules --exclude=./agent/logs --exclude=./agent/screenshots --exclude=./agent/recordings --exclude=./_bundled --exclude=./apikey.txt -C E:\vibeide ."
scp hp@192.168.137.1:/C:/Users/HP/AppData/Local/Temp/vibeide-source.zip ../vibeide-source.zip
unzip -o ../vibeide-source.zip
```

Runtime 源码包：

```bash
ssh hp@192.168.137.1 "tar -a -cf C:\Users\HP\AppData\Local\Temp\vibeide-runtime-source.zip --exclude=./node_modules --exclude=./dist --exclude=./chrome_profile --exclude=./recordings --exclude=./workflows -C E:\vibeide\runtime ."
scp hp@192.168.137.1:/C:/Users/HP/AppData/Local/Temp/vibeide-runtime-source.zip ../vibeide-runtime-source.zip
mkdir -p runtime
unzip -o ../vibeide-runtime-source.zip -d runtime
```

## 推送前排除清单

必须确认这些不进 Git：

```text
.local-secrets/
.claude/
agent/.claude/
apikey.txt
.env
node_modules/
electron/dist/
electron/dist-package/
electron/dist-package.zip
runtime/dist/
runtime/chrome_profile/
runtime/recordings/
runtime/workflows/
runtime/logs/
agent/logs/
agent/screenshots/
workplaces/
```

检查命令：

```bash
git status --short --ignored
git check-ignore -v .local-secrets/HANDOFF_PRIVATE.md .claude/settings.local.json agent/.claude/settings.json electron/dist/main/index.js || true
```

## 初次入库建议

首次入库已完成。后续提交仍建议只提交：

- 源码：`electron/src/`、`runtime/src/`、`agent/skills/`、`agent/tools/`
- 配置：`config/`、`electron/package.json`、`runtime/package.json`、`agent/package.json`
- 启动脚本：`scripts/`
- 文档：`README.md`、`CLAUDE.md`、`docs/`
- 测试：`tests/test_project.py`

不要提交：

- `electron/dist/`
- `.local-secrets/`
- `.claude/`
- `agent/.claude/`
