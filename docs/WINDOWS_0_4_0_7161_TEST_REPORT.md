# Windows 0.4.0.7161 版本与打包测试报告

测试日期：2026-07-17  
源码目录：`E:\Agent\vibeide\vibeide`  
打包目录：`electron\dist-package\win-unpacked`  
可执行文件：`electron\dist-package\win-unpacked\奥德赛0.4.0.7161.exe`

## 结论

- 正式产品名已统一为 `奥德赛0.4.0.7161`。
- Windows `FileVersion` / `ProductVersion` 已验证为 `0.4.0.7161`。
- Electron、Runtime、Agent 的 npm package/lock 版本已统一为 SemVer 映射 `0.4.0-7161`。
- Windows unpacked 打包完成，`resources/app.asar` 和 `resources/runtime/dist/index.js` 均存在。
- 本轮只验证版本一致性、TypeScript、Renderer 和 Windows unpacked 打包；尚未重新执行 exe 启动、ESP-IDF 编译、烧录和串口实机测试。

## 已通过命令

```powershell
npm.cmd --prefix electron run verify:version
npm.cmd --prefix runtime run typecheck
npm.cmd --prefix electron run typecheck
npm.cmd --prefix runtime run build
npm.cmd --prefix electron run build:main
npm.cmd --prefix electron run build:renderer
npm.cmd --prefix electron run pack:win
git diff --check
```

## PE 元数据

```text
ProductName:      奥德赛0.4.0.7161
FileDescription:  奥德赛0.4.0.7161 Runtime Workbench
FileVersion:      0.4.0.7161
ProductVersion:   0.4.0.7161
OriginalFilename: 奥德赛0.4.0.7161.exe
```

## 未验证项

- exe 交互启动和 UI 截图验收。
- 打包版 `hardboard:env` / `hardboard:devices`。
- ESP32-S3 build / flash / serial 实机闭环。
- 安装包签名；当前没有代码签名证书，electron-builder 按现有策略跳过签名。
