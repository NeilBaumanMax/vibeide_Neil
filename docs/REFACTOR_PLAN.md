# 重构计划

## 目标

把当前从 Windows 裸目录接出的项目整理成可持续开发的 GitHub 仓库，并为下一步功能重构建立清晰边界。

## 阶段 0：入库前整理

状态：进行中。

目标：

- README 改成奥德赛0.4.0-7171 当前真实主线。
- 新建统一 docs 体系。
- 排除敏感信息、依赖、构建产物、运行态。
- 把 GitHub 作为源码真相源。

验收：

- `README.md` 不再以旧 `coddecat` 纯 Python scaffold 为主。
- `docs/INDEX.md` 存在并能串起核心文档。
- `.local-secrets/`、`.claude/`、`agent/.claude/`、`electron/dist/` 被 ignore。
- `git status --short --ignored` 可解释。

## 阶段 1：命名统一

状态：

- 用户可见正式名：奥德赛0.4.0-7171。
- GitHub 仓库和内部工程代号：`vibeide`。
- Electron package/runtime/agent npm 包名仍为 `@vibeide/*`，这是当前兼容策略。
- 旧 `coffecat/coddecat` 只应出现在历史记录、legacy 测试或迁移说明中。

后续建议：

1. 不要把用户可见名称改回 `vibeide`。
2. 如需把内部包名也改成 odyssey/奥德赛，必须先设计 appData、API key、Chrome profile、日志目录和安装包升级兼容。
3. 历史 `coffecat/coddecat` 只保留在明确标注为 legacy 的文档或测试里。

验收：

- `grep -R "coffecat\\|coddecat" README.md docs electron runtime agent package*.json pyproject.toml` 只剩兼容说明或迁移注释。
- Electron 启动后 UI 显示 `奥德赛0.4.0-7171`。

## 阶段 2：旧 Python scaffold 决策

问题：

- `tests/test_scaffold.py` 依赖 `src/coddecat`，但当前仓库没有这个目录。
- `pyproject.toml` 与当前 Electron 主线不匹配。

选项：

1. 删除旧 Python scaffold 测试和 package 配置，只保留 Python 辅助脚本。
2. 恢复 `src/coddecat` 作为独立 scaffold 子系统。
3. 把 Python package 改成仅服务 `scripts/normalize.py` / `scripts/reporter.py` 的辅助包。

建议：

- 短期：把 `tests/test_scaffold.py` 标记为 legacy 或移入 `tests/legacy/`。
- 中期：删除 `pyproject.toml` 里的 `coddecat` package 叙事，改成工具脚本依赖说明。

验收：

- `pytest tests/test_project.py` 通过。
- 全量测试口径明确，不再把旧 scaffold 失败误判为 Electron 主线失败。

## 阶段 3：录制/回放边界统一

问题：

- Electron 侧有 `browser-recorder.ts`，直接在 WebContents 注入脚本。
- Runtime 侧也有 `record.ts` / `replay.ts`，通过 MCP 和 Playwright CDP 操作。

建议：

- UI 手动录制可以保留 Electron 侧实现。
- Agent 任务录制、回放、workflow 长期以 Runtime MCP 为准。
- 文档明确两者格式是否兼容。
- 如果不兼容，新增转换层或统一 JSON schema。

验收：

- `browser.recording_*` 和 UI Start/Stop Rec 的结果能被同一套 workflow 复用，或文档明确不可复用。

## 阶段 4：Runtime 工作流产品化

目标：

- workflow 支持版本号。
- workflow 支持 selector 校验。
- workflow 支持样本输出和失败原因。
- workflow 可展示在工作台并一键执行。

建议新增：

- `examples/workflows/`：可提交的示例 workflow。
- `runtime/src/workflow-runner.ts`：执行和校验集中管理。
- `runtime/src/workflow-schema.ts`：统一 schema。

验收：

- 可以录制一个站内搜索流程，保存为 workflow，然后重启应用后继续执行。
- workflow 失败时有明确错误：录制失败、selector 失效、登录态缺失、页面跳转异常。

## 阶段 5：Windows 开发体验

目标：

- Windows 端直接 `git pull` 后能启动。
- 不依赖手工复制大目录。
- 不把运行态带进仓库。

建议：

- 补 `scripts/bootstrap_windows.ps1`。
- 检查 Node、npm、Git、OpenSSH。
- 安装 `runtime/electron/agent` 依赖。
- 创建 `apikey.txt` 模板提醒，不写真实 key。

验收：

- 新 Windows 机器按 README 可以从 clone 到启动。
- 旧 `C:\vibecodingide` 可被 `C:\vibeide` Git 目录替代。
