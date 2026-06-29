# vibeide — Codex / Claude Code 开发规则

> 本文件是仓库级开发规则。Agent 运行规则在 `agent/CLAUDE.md`，不要混用。

## 项目身份

`vibeide` 是本地桌面采集与自动化 IDE。当前主线由 Electron 桌面端、Runtime MCP 控制层和 Agent 工作区组成。

```text
Electron 桌面窗口
├── Renderer UI          ← Chat / Progress / Result / Workbench / Browser tabs
├── Gateway              ← IPC 唯一入口
├── Worker               ← 任务编排、搜索预处理、Agent 生命周期
├── Agent                ← Claude Code 推理，工作区 agent/
└── Runtime              ← CDP + MCP tools + 录制 / 回放 / workflow
```

## 架构铁律

1. Gateway 是唯一 IPC 入口，Renderer 不直接访问 Runtime 或 Agent。
2. Worker 负责任务编排，不直接实现页面采集规则。
3. Runtime 不调 LLM，不做推理决策，只提供浏览器动作、提取、录制、回放和存储。
4. Agent 不直接碰 Playwright / Puppeteer / curl / 系统浏览器，所有浏览器操作必须通过 MCP tool。
5. Agent 可读 `agent/skills/`，可写 `agent/tools/`；不要让 Agent 修改 `electron/`、`runtime/`、`scripts/`。
6. 录制和可复用任务优先落到 `runtime/workflows/*.json`，不要绕过 MCP 写临时浏览器脚本。
7. API key、cookie、Chrome profile、日志、录制运行产物和本机账号密码绝对不进 Git。

## 开工流程

```bash
git branch --show-current
git status --short
sed -n '1,220p' docs/INDEX.md
sed -n '1,260p' docs/HANDOFF.md
sed -n '1,260p' docs/ARCHITECTURE.md
sed -n '1,260p' docs/DEVELOPMENT.md
```

如果要做实质改动，先确认工作区是否干净。必要时建立备份分支：

```bash
git checkout -b backup/$(date +%Y%m%d)-before-work
git push -u origin HEAD
git checkout main
```

## 收尾流程

1. 更新相关文档，至少检查 `docs/HANDOFF.md`、`docs/DEV_PROGRESS.md`、`docs/LOG.md` 是否需要同步。
2. 运行与改动相关的验证命令。
3. 检查敏感文件不会入库：

```bash
git status --short --ignored
git check-ignore -v .local-secrets/HANDOFF_PRIVATE.md .claude/settings.local.json agent/.claude/settings.json || true
```

4. 精确 `git add`，不要用 `git add -A` 把运行态和私有文件扫进去。
5. 提交并推送到当前备份仓库 `git@github.com:howtion0/vibeide.git`。

## 验证命令

```bash
# Python 结构测试
pytest tests/test_project.py

# Runtime
cd runtime
npm install
npm run typecheck

# Electron
cd ../electron
npm install
npm run typecheck
npm run build:main
npm run build:renderer
```

`tests/test_scaffold.py` 仍指向旧 Python scaffold，不能作为当前 Electron 主线是否可用的唯一判断。

## 文档索引

- `docs/INDEX.md`：文档入口。
- `docs/ARCHITECTURE.md`：架构和模块边界。
- `docs/DEVELOPMENT.md`：开发、验证、提交流程。
- `docs/GITHUB_SYNC.md`：Windows / 本机 / GitHub 接力方式。
- `docs/REFACTOR_PLAN.md`：下一步重构路线。
- `docs/SECURITY.md`：敏感信息和账号规则。
- `docs/HANDOFF.md`：当前接力状态。
- `agent/CLAUDE.md`：Agent 执行规则。

## 安全红线

- 不提交 `apikey.txt`、`.env`、`.local-secrets/`。
- 不提交 `runtime/chrome_profile/`、cookies、日志、录制运行产物。
- 不提交 `electron/dist/`、`electron/dist-package/`、`node_modules/`。
- 不在 README、公开 docs、commit message 中写真实账号密码。
