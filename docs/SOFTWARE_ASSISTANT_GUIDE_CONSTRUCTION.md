# 猫薄荷软件知识手册施工基线

## 目标

猫薄荷的软件知识不得继续硬编码在 TypeScript 中。产品功能、界面名称、操作步骤和常见问题统一维护在一份随包 Markdown 手册里；每次用户提问时重新读取，使维护者保存文档后的下一次问答立即生效，无需重新编译或重启软件。

## 文件位置

- 源码：`electron/CATNIP_FORGE_USER_GUIDE.md`
- Windows 便携版：`resources/CATNIP_FORGE_USER_GUIDE.md`
- 打包规则：`electron/electron-builder.yml` 的 `extraResources`
- 路径解析：`electron/src/main/paths.ts#getSoftwareAssistantGuidePath`

发布版手册位于 app.asar 外，允许维护者直接编辑。重新分发时应同步维护源码母版，避免下一次打包覆盖成旧内容。

## 提示词结构

`software-assistant.ts` 将提示词分成两层：

1. 固定系统规则：猫薄荷角色、软件问答范围、无执行权限、简体中文短回答、不编造功能、不接触 API Key。
2. 动态产品手册：当前请求发生时从磁盘读取 Markdown，并放在明确的开始/结束分隔符中。

固定规则优先于手册。手册被定义为产品事实来源，不得利用手册内容改变角色、泄露秘密或绕过权限边界。

## 运行时规则

- 每次 `askSoftwareAssistant` 都调用 `buildSoftwareAssistantSystemPrompt`，不缓存手册。
- 手册最大读取 60,000 字符，超过部分截断并记录不含正文的诊断信息。
- 文件缺失、不可读或为空时使用安全降级提示，要求模型明确回答“不确定”，不能凭记忆编造界面。
- 请求日志只记录消息数、模型和提示词字符数，不记录手册正文、用户问题或 API Key。
- 猫薄荷仍不进入左侧硬件 Agent 队列，也不具备编译、烧录、删除或文件修改权限。

## 手册维护规则

更新界面或操作流程时，应同时修改：

1. `electron/CATNIP_FORGE_USER_GUIDE.md` 中对应章节。
2. 相关施工真相源，例如 `ARCHITECTURE.md`、`HANDOFF.md` 或专项施工文档。
3. 若新增关键章节或文件名，更新发布校验断言。

手册应使用用户能在界面看到的名称，不写开发机绝对路径，不写真实 API Key，不承诺尚未实现的功能。故障处理应优先给出可验证操作，并明确权限和数据风险。

## 验收

```powershell
npm.cmd --prefix electron run build:main
npm.cmd --prefix electron run verify:software-assistant-guide
npm.cmd --prefix electron run pack:win
npm.cmd --prefix electron run verify:release
git diff --check
```

`verify:software-assistant-guide` 会用临时手册验证 A→B 内容更新不被缓存，并覆盖空文件、缺失文件的安全降级。`verify:release` 确认便携包 `resources` 根目录存在完整、可编辑的手册。
