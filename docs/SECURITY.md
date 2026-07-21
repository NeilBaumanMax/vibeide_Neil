# 安全和账号规则

## 原则

账号、密码、API key、cookie、浏览器 profile 和运行态数据只留在本机，不进入 GitHub。

## 允许写入 Git 的内容

- 源码。
- 文档。
- 示例配置。
- 不含密钥的 `.example` 文件。
- 跨平台工具脚本。

## 禁止写入 Git 的内容

```text
apikey.txt
.env
.local-secrets/
.claude/
agent/.claude/
runtime/chrome_profile/
runtime/cookies/
runtime/logs/
runtime/recordings/
runtime/workflows/
workplaces/
agent/logs/
agent/screenshots/
node_modules/
electron/dist/
electron/dist-package/
```

## 本机私有文档

私有接力信息放这里：

```text
.local-secrets/HANDOFF_PRIVATE.md
```

可记录：

- Windows SSH 主机、用户、密码。
- Windows 项目路径。
- GitHub SSH 状态。
- 本机路径。
- 网络和临时排障命令。

不可复制到公开 docs、README 或 commit message。

## API Key

API Key 文件始终位于 `resources/apikey.txt`，与应用同目录。

开发模式路径为项目根目录，生产模式路径为打包后的 `resources/` 目录。删除应用目录即删除 key。

该文件只允许本机存在，不提交。建议格式：

```text
DEEPSEEK_API_KEY=<your-key>
```

发布包只携带 `resources/apikey.txt.example` 占位模板，不携带 `resources/apikey.txt`。首次启动没有 Key 时，应用会显示阻塞式配置窗口；保存后只写入当前解压目录的 `resources/apikey.txt`。

分发前必须再次确认真实 Key 文件不存在。用户自行编辑模板或通过首次启动窗口保存都可以，但不得把保存过 Key 的目录再次压缩转发。

## 提交前检查

```bash
git status --short --ignored
git check-ignore -v .local-secrets/HANDOFF_PRIVATE.md .claude/settings.local.json agent/.claude/settings.json electron/dist/main/index.js || true
find . -path ./.git -prune -o -iname '*key*' -o -iname '*.env' -o -path './.local-secrets/*' -print
```

`find` 会打印本机私有文件是正常的，但这些文件必须被 `.gitignore` 命中。

## Windows SSH

Windows SSH 只用于本机和 Windows 实机之间的开发接力。公开文档只写连接方式，不写密码。

公开文档可写：

```bash
ssh hp@192.168.137.1
```

密码只写 `.local-secrets/HANDOFF_PRIVATE.md`。
