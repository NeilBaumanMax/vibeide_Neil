# Agent Skill 源仓库、部署与仓库页管理

## 目标

奥德赛 Skill 只有一个用户可维护源仓库：开发版为 `agent/skills`，Windows 成品为 `win-unpacked/resources/agent/skills`。该路径不迁移，也不隐藏复制为第二份用户源数据。

Claude Code 原生技能目录位于 Agent 工作区的 `.claude/skills/<skill-id>/SKILL.md`。应用在 Agent 启动前把源仓库标准化部署到该目录，仓库页负责展示、编辑、新增、删除和手动同步。

## 数据流

```text
resources/agent/skills                  用户可编辑、产品随包源仓库
        ↓ skill-manager 标准化/同步
runtime-data/agent-workspace/.claude/skills/<id>/SKILL.md
        ↓ Claude Code 原生发现与按需加载
Agent Skill tool
        ↓ structured tool event
对话“执行过程”中的技能条目
```

开发模式中的对应路径是 `agent/skills` → `runtime/agent-workspace/.claude/skills`。

## 源格式兼容

- 新建 Skill 使用标准目录：`<skill-id>/SKILL.md`。
- 历史 `*.md` 扁平文件继续读取，文件名中的下划线部署时转换为连字符命令，例如 `espidf_hardboard.md` → `/espidf-hardboard`。
- 部署文件统一补齐 YAML frontmatter 的 `name` 和 `description`，源文件路径不改变。
- 标准目录中的支持文件随同部署；顶层隐藏文件和符号链接不复制。

## 安全边界

- Skill ID 只允许小写字母、数字和连字符，最长 64 字符。
- Skill 名称、触发描述和正文不能为空，正文限制 100KB。
- 同步清单 `.odyssey-managed.json` 只记录奥德赛管理的部署项；清理时只删除清单中的失效项，不碰用户自行放入 Agent 工作区的其他原生 Skill。
- 若目标存在非奥德赛管理的同名 Skill，同步中止并显示冲突，不覆盖。
- 仓库页删除源 Skill 时进入系统回收站，随后撤销对应部署。
- 安装目录不可写时，仓库页明确显示“源仓库只读”，禁止新增/保存；不静默改写到别的目录。

## 前端行为

仓库标签页不再显示“Agent 生成”卡片，聚焦硬件工程、参考代码与 Skills。左侧 Agent 对话输入区提供 Skills 按钮：点击后列出已部署 Skill，选择项会以标签进入输入区；发送消息时软件自动注入对应 `/skill-id`，发送后清除选择。用户不需要记忆或手工输入命令，直接描述任务时仍可由 Agent 自动选择。

Skills 区域显示固定源路径和可写状态、源 Skill 数量与已部署数量、名称/描述/原生命令/格式，以及新建、编辑、删除、打开目录和立即同步操作。

保存后自动同步。任务路由只负责显示“推荐了哪个 Skill”，不再把整份 Skill 文档塞进提示词；Claude Code 实际调用 `Skill` 工具时，在对话的“执行过程”中标为“技能”。

## 验证

```powershell
npm.cmd --prefix electron run typecheck
npm.cmd --prefix electron run build:main
npm.cmd --prefix electron run build:renderer
npm.cmd --prefix electron run verify:skills
npm.cmd --prefix electron run verify:hardboard
```

`verify:skills` 检查固定源路径、12 个随包 Skill 的原生部署/frontmatter、普通前端编译不误触发 Hardboard，以及 ESP32 任务仍能推荐 `/espidf-hardboard`。

原生 Skill 目录和发现行为依据 [Claude Code Skills 官方文档](https://code.claude.com/docs/en/slash-commands)。
