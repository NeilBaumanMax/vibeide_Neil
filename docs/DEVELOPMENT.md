# 开发流程

## 环境

推荐环境：

- Node.js 22+
- npm
- Python 3.11+
- Git SSH 可访问 `git@github.com:howtion0/vibeide.git`
- Windows 实机用于最终运行验证

## 开工检查

```bash
cd /home/howtion/桌面/hardvibecoding/vibeide
git branch --show-current
git status --short
git remote -v
```

读文档：

```bash
sed -n '1,220p' README.md
sed -n '1,220p' docs/HANDOFF.md
sed -n '1,260p' docs/ARCHITECTURE.md
sed -n '1,260p' docs/REFACTOR_PLAN.md
```

## 安装依赖

Runtime：

```bash
cd runtime
npm install
```

Electron：

```bash
cd electron
npm install
```

Agent：

```bash
cd agent
npm install
```

## 启动

Linux / macOS：

```bash
bash scripts/start_electron_desktop.sh
```

Windows PowerShell：

```powershell
cd E:\vibeide
powershell -ExecutionPolicy Bypass -File scripts\start_electron_desktop.ps1
```

Windows CMD：

```cmd
cd /d E:\vibeide
scripts\start_electron_desktop.cmd
```

## 验证

最小结构测试：

```bash
pytest tests/test_project.py
```

Runtime：

```bash
cd runtime
npm run dev
npm run typecheck
```

Electron：

```bash
cd electron
npm run typecheck
npm run build:main
npm run build:renderer
```

搜索 URL 工具：

```bash
node agent/tools/build_platform_search_url.mjs bilibili "何同学"
node agent/tools/build_platform_search_url.mjs taobao "猫粮"
node agent/tools/build_platform_search_url.mjs google "electron windows build"
```

## 测试说明

- `tests/test_project.py`：当前结构测试，应该作为短期 CI 基线。
- `tests/test_scaffold.py`：旧 Python scaffold 测试，当前与主线不一致。重构时需要明确保留、迁移或删除。
- `pytest tests/` 当前不一定代表 Electron 主线健康，因为会包含旧 scaffold 测试。

## 提交规则

不要使用 `git add -A`。

推荐精确添加：

```bash
git add README.md CLAUDE.md .gitignore
git add docs/INDEX.md docs/ARCHITECTURE.md docs/DEVELOPMENT.md docs/GITHUB_SYNC.md docs/REFACTOR_PLAN.md docs/SECURITY.md docs/HANDOFF.md
git add electron/src runtime/src agent/skills agent/tools config scripts tests
```

提交前检查：

```bash
git status --short --ignored
git check-ignore -v .local-secrets/HANDOFF_PRIVATE.md .claude/settings.local.json agent/.claude/settings.json electron/dist/main/index.js || true
```

## 文档收尾

每次结构性改动结束时，至少检查：

- `README.md`
- `docs/INDEX.md`
- `docs/HANDOFF.md`
- `docs/DEV_PROGRESS.md`
- `docs/LOG.md`

如果改动影响架构或边界，同时更新：

- `docs/ARCHITECTURE.md`
- `docs/REFACTOR_PLAN.md`
