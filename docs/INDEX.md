# Catnip Forge 文档索引

本文档目录是 Catnip Forge（Catnip 硬件智能开发平台）的主文档体系，用来支撑 Autonomous Hardware Development Agent。后续开发优先维护这些文件。仓库名和内部工程代号仍为 `vibeide`。

## 必读顺序

1. [README](../README.md)：GitHub 首页、快速启动、项目边界。
2. [HANDOFF](HANDOFF.md)：当前接力状态、本机/Windows/GitHub 三方关系。
3. [ARCHITECTURE](ARCHITECTURE.md)：Electron、Worker、Agent、Runtime 的模块边界。
4. [DEVELOPMENT](DEVELOPMENT.md)：开发、验证、提交和推送流程。
5. [GITHUB_SYNC](GITHUB_SYNC.md)：Windows 实机、Linux 本机和 GitHub 的同步方案。
6. [REFACTOR_PLAN](REFACTOR_PLAN.md)：下一步重构路线和验收口径。
7. [SECURITY](SECURITY.md)：账号、密码、API key、运行态文件规则。
8. [ELECTRON_APPLE_UI_CONSTRUCTION](ELECTRON_APPLE_UI_CONSTRUCTION.md)：1.0.0-7201 的 Apple 风格界面、应用内持久化主题、可拖动外观入口、Skill/工程资源仓库、任务清除、内置双向串口助手和编辑器交互施工基线。
9. [HARDBOARD_CONSTRUCTION](HARDBOARD_CONSTRUCTION.md)：ESP-IDF 5.4.3、打包、烧录、串口和 log.txt 复盘出的硬件问题。
10. [RUNTIME_EVENTBUS_CONSTRUCTION](RUNTIME_EVENTBUS_CONSTRUCTION.md)：runtime task、pid、eventbus、MCP 触发、心跳监视和 Electron 编译/烧录监控施工方案。
11. [RUNTIME_TASK_MANAGER_UI_CONSTRUCTION](RUNTIME_TASK_MANAGER_UI_CONSTRUCTION.md)：把 runtime eventbus、任务进程、编译/烧录日志和任务结果真正显示到 Electron。
12. [Hardboard Agent 运行文档](../runtime/hardboard/doc/README.md)：Agent 在运行时可读的硬件工程、烧录和工具调用规则。
13. [AGENT_TASK_QUEUE_CONSTRUCTION](AGENT_TASK_QUEUE_CONSTRUCTION.md)：Agent 单活动任务、执行中追加要求、显式排队和任务状态关联的施工与验收规则。
14. [AGENT_CHAT_PRESENTATION_CONSTRUCTION](AGENT_CHAT_PRESENTATION_CONSTRUCTION.md)：Agent 主回复、执行过程折叠、专业视图与安全 Markdown 渲染的施工规则。
15. [AGENT_CONVERSATION_HISTORY_CONSTRUCTION](AGENT_CONVERSATION_HISTORY_CONSTRUCTION.md)：多历史会话、重启恢复、切换删除、旧 session 迁移和 Agent 上下文续接规则。
16. [AGENT_SKILL_RUNTIME_CONSTRUCTION](AGENT_SKILL_RUNTIME_CONSTRUCTION.md)：固定 Skill 源仓库、Claude Code 原生部署、仓库页管理和调用过程展示规则。
17. [WINDOWS_V1_0_0_RELEASE_CHECKLIST](WINDOWS_V1_0_0_RELEASE_CHECKLIST.md)：v1.0.0 便携包版本映射、API Key 首启、随包资源和分发验收清单。

## 现有历史文档

- [DEV_PROGRESS](DEV_PROGRESS.md)：历史开发进度，仍有参考价值。
- [LOG](LOG.md)：持续施工日志，记录各阶段的关键变更、验证和 Git 边界。
- [12_Docker_Windows_Smoke](12_Docker_Windows_Smoke.md)：Docker + Wine Windows 打包 smoke 方案。
- [WINDOWS_0_1_MIGRATION_CONSTRUCTION](WINDOWS_0_1_MIGRATION_CONSTRUCTION.md)：历史 Windows 0.1 迁移与仓库导入方案，不代表当前 1.0.0-7201 界面。
- [WINDOWS_0_1_TEST_REPORT](WINDOWS_0_1_TEST_REPORT.md) / [WINDOWS_0_4_0_7161_TEST_REPORT](WINDOWS_0_4_0_7161_TEST_REPORT.md)：历史版本实测报告。
- `../runtime/hardboard/doc/`：硬件施工文档、设备记录、ESP-IDF 调用规范。

## 文档维护规则

- README 只写对外入口和最短启动路径。
- 架构和模块边界写在 `ARCHITECTURE.md`。
- 本机接力、Windows SSH、GitHub 同步写在 `HANDOFF.md` 和 `GITHUB_SYNC.md`。
- 账号密码只写 `.local-secrets/HANDOFF_PRIVATE.md`，不写进任何公开文档。
- 每次重构收尾时更新 `DEV_PROGRESS.md` 和 `LOG.md`。
