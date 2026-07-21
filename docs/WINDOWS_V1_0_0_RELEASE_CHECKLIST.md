# Windows v1.0.0 便携版发布检查

## 版本口径

- 产品名：`Catnip Forge`
- 中文全称：`Catnip 硬件智能开发平台`
- 英文定位：`Autonomous Hardware Development Agent`
- 对外发布版本：`v1.0.0`
- 内部构建号：`7201`
- npm/应用包版本：`1.0.0-7201`
- Windows PE 文件版本：`1.0.0.7201`
- 成品目录：`electron/dist-package/win-unpacked`
- 可执行文件：`Catnip Forge.exe`

构建号用于区分 v1.0.0 的内部迭代，不改变对外发布主版本。

## 分发方式

可以压缩并分发整个 `win-unpacked` 文件夹。接收方必须完整解压，不能只复制 exe，也不能直接在压缩软件预览窗口中运行。

建议解压到普通用户可写目录，例如 `D:\Odyssey-v1.0.0`。如果放进 `Program Files` 等受保护目录，首次保存 API Key、编辑随包 Skills 时可能因权限不足失败。

发布目录根部包含 `README-FIRST.txt`，接收方按其中步骤操作。

## 首次启动与 API Key

发布包必须满足：

- 不包含 `resources/apikey.txt`，避免泄露发布者密钥。
- 包含 `resources/apikey.txt.example`，内容只有占位符。
- 无 Key 首次启动时显示应用内配置窗口。
- 用户粘贴 DeepSeek API Key 后写入当前解压目录的 `resources/apikey.txt`。
- Agent 启动时从该文件设置 `ANTHROPIC_AUTH_TOKEN`、`https://api.deepseek.com/anthropic` 和 `deepseek-v4-pro`。

DeepSeek 的 Anthropic 兼容地址和 `deepseek-v4-pro` 模型以官方文档为准。

## 必须随包的运行资源

- Electron 主程序、locales、pak、V8 snapshot、D3D/EGL/GLES/Vulkan DLL。
- Catnip Forge 的 Windows ICO、应用 PNG 和前端左上角品牌图。
- `resources/app.asar` 及 Skill 管理、对话 UI。
- `resources/agent`、Claude Code CLI 和 12 个内置 Skills。
- `resources/runtime/nodejs`、Runtime 编译产物和 node_modules。
- `resources/runtime/python`、pyserial 及 `Scripts/python.exe`。
- Playwright Chromium。
- ESP-IDF 5.4.3、工具链、CMake、Ninja、ccache 和示例工程。

## 自动验证

```powershell
npm.cmd --prefix electron run verify:version
npm.cmd --prefix electron run typecheck
npm.cmd --prefix electron run verify:skills
npm.cmd --prefix electron run verify:hardboard
npm.cmd --prefix electron run pack:win
npm.cmd --prefix electron run verify:release
npm.cmd --prefix electron run verify:first-run
git diff --check
```

`verify:release` 会检查版本元数据、关键目录、真实 Key 缺失、Key 模板、app.asar、便携 Node/Python/Claude Code、Runtime health、开发机绝对路径和发布目录总体积。

2026-07-21 Catnip Forge 最终成品实测：目录共 `4,463,704,603` 字节；Node `v22.14.0`、Python 3.12/pyserial `3.5`、Claude Code `2.1.167` 和 Runtime health 均通过。成品实际启动后，窗口标题、左上角 26px 品牌图、首次配置窗口、英文定位、Playwright 资源和 Skills 按钮均通过 CDP 校验，占位 Key 被拒绝，测试结束后 `resources/apikey.txt` 仍不存在。

## 使用边界

- 目标系统为 Windows 10/11 x64。
- Agent 需要可访问 DeepSeek API 的网络和用户自己的有效 Key。
- 串口需要对应 USB-UART 驱动，且端口不能被其他程序占用。
- 包未配置商业代码签名证书，其他电脑可能出现 Windows SmartScreen 提示；这不等于运行资源缺失。
- 实际硬件编译/烧录仍受开发板、串口驱动和工程本身影响。
