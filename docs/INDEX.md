# 奥德赛0.4.0-7171 文档索引

本文档目录是奥德赛0.4.0-7171 的主文档体系，用来支撑硬件 vibecoding IDE。后续开发优先维护这些文件。仓库名和内部工程代号仍为 `vibeide`。

## 必读顺序

1. [README](../README.md)：GitHub 首页、快速启动、项目边界。
2. [HANDOFF](HANDOFF.md)：当前接力状态、本机/Windows/GitHub 三方关系。
3. [ARCHITECTURE](ARCHITECTURE.md)：Electron、Worker、Agent、Runtime 的模块边界。
4. [DEVELOPMENT](DEVELOPMENT.md)：开发、验证、提交和推送流程。
5. [GITHUB_SYNC](GITHUB_SYNC.md)：Windows 实机、Linux 本机和 GitHub 的同步方案。
6. [REFACTOR_PLAN](REFACTOR_PLAN.md)：下一步重构路线和验收口径。
7. [SECURITY](SECURITY.md)：账号、密码、API key、运行态文件规则。
8. [HARDBOARD_CONSTRUCTION](HARDBOARD_CONSTRUCTION.md)：ESP-IDF 5.4.3、打包、烧录、串口和 log.txt 复盘出的硬件问题。
9. [RUNTIME_EVENTBUS_CONSTRUCTION](RUNTIME_EVENTBUS_CONSTRUCTION.md)：runtime task、pid、eventbus、MCP 触发、心跳监视和 Electron 编译/烧录监控施工方案。
10. [RUNTIME_TASK_MANAGER_UI_CONSTRUCTION](RUNTIME_TASK_MANAGER_UI_CONSTRUCTION.md)：把 runtime eventbus、任务进程、编译/烧录日志和工作台源码预览真正显示到 Electron。
11. [WINDOWS_0_1_MIGRATION_CONSTRUCTION](WINDOWS_0_1_MIGRATION_CONSTRUCTION.md)：迁移到 Windows `C:\vibeide`、备份 GitHub、0.1 exe 打包、ESP32-S3 测试和仓库导入文件夹施工方案。
12. [WINDOWS_0_1_TEST_REPORT](WINDOWS_0_1_TEST_REPORT.md)：Windows E 盘源码/打包迁移、0.1 exe、ESP32-S3 编译烧录和串口测试报告。
13. [WINDOWS_0_4_0_7161_TEST_REPORT](WINDOWS_0_4_0_7161_TEST_REPORT.md)：当前版本一致性、PE 元数据和 Windows unpacked 打包测试报告。
14. [Hardboard Agent 运行文档](../runtime/hardboard/doc/README.md)：Agent 在运行时可读的硬件工程、烧录和工具调用规则。

## 现有历史文档

- [DEV_PROGRESS](DEV_PROGRESS.md)：历史开发进度，仍有参考价值。
- [LOG](LOG.md)：持续施工日志，记录各阶段的关键变更、验证和 Git 边界。
- [12_Docker_Windows_Smoke](12_Docker_Windows_Smoke.md)：Docker + Wine Windows 打包 smoke 方案。
- `../runtime/hardboard/doc/`：硬件施工文档、设备记录、ESP-IDF 调用规范。

## 文档维护规则

- README 只写对外入口和最短启动路径。
- 架构和模块边界写在 `ARCHITECTURE.md`。
- 本机接力、Windows SSH、GitHub 同步写在 `HANDOFF.md` 和 `GITHUB_SYNC.md`。
- 账号密码只写 `.local-secrets/HANDOFF_PRIVATE.md`，不写进任何公开文档。
- 每次重构收尾时更新 `DEV_PROGRESS.md` 和 `LOG.md`。
