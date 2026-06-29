# Windows 0.1 迁移施工文档

## 目标

把当前 Linux 工作区里的 runtime eventbus、任务管理器、编辑器多文件标签、仓库导入文件夹能力移植到 Windows 实机 `C:\vibeide`。Windows 目录里已有上一版本，施工前先把当前工作备份到 GitHub `git@github.com:howtion0/vibeide.git`，再在 Windows 上编译、打包 `0.1` 版本 exe，并使用插在 Windows 上的 ESP32-S3 做硬件验证。

## 施工顺序

1. 记录本文档和后续日志。
2. 备份当前 Linux 工作区到 GitHub：

```text
git@github.com:howtion0/vibeide.git
```

3. 同步源码到 Windows `C:\vibeide`，覆盖上一版本源码，但不删除 Windows 本地依赖、硬件运行态和用户文件。
4. 将 Electron 应用版本和 Windows exe 文件属性调整为 `0.1.0`。
5. 在 Windows 上运行：

```powershell
npm --prefix runtime run build
npm --prefix electron run typecheck
npm --prefix electron run build:main
npm --prefix electron run build:renderer
npm --prefix electron run pack:win
```

6. 在 Windows 上检查 `electron\dist-package\win-unpacked\奥德赛0.0.exe`。
7. 使用 Windows 上插入的 ESP32-S3 验证串口、build、flash、serial。
8. 写入 `docs/LOG.md` 和测试报告。

## 仓库导入文件夹

仓库页保留默认精选分组：

- Agent 生成
- 硬件工程
- 参考代码
- Skills

同时新增“导入文件夹”功能：

- 用户可以从本机选择额外文件夹加入仓库视图。
- 导入文件夹必须能从仓库视图移除，不能只导入不能退出。
- 导入文件夹持久化到 runtime 数据目录。
- 移除导入文件夹后，该目录从持久化列表删除，读取和写入权限随之撤销。
- 施工文档不作为仓库默认分组显示；需要查看时由用户通过“导入文件夹”导入。
- 导入分组显示常见源码、Markdown、JSON、YAML、TXT、HTML 文件。
- HTML / SVG 文件点击后在工作台浏览器运行。
- C / H / CMake / Markdown / skills 文档点击后进入多文件编辑器，可切换、保存、关闭。
- 导入文件夹内文件允许读取和写入，但只允许在用户显式导入的目录范围内。

## UI 调整

- 工作台恢复为浏览器工作台：URL、HTML 运行、浏览器 tab 管理、录制回放。
- 监视器恢复为串口监视器：串口选择、实时曲线、串口输出。
- 任务管理器承载编译/烧录页面：Build / Flash 两行、进度条、源码预览、runtime eventbus、pid、tool、port、错误流。
- 编辑器支持多文件标签，类似浏览器 tab，可打开多个源码或文档并关闭。

## Windows 验收

必须在 Windows `C:\vibeide` 验证：

```powershell
node electron\scripts\stamp_win_exe_version.cjs electron\dist-package\win-unpacked\奥德赛0.0.exe
```

exe 文件属性应为：

```text
ProductName: 奥德赛0.0
FileVersion: 0.1.0
ProductVersion: 0.1.0
```

ESP32-S3 验证：

```powershell
cd C:\vibeide\electron\dist-package\win-unpacked\resources\runtime
node dist\index.js hardboard:devices
node dist\index.js hardboard:build hardboard\projects\wifi_connect_fmai
node dist\index.js hardboard:flash hardboard\projects\wifi_connect_fmai COM3
node dist\index.js hardboard:serial COM3 10 115200
```

实际端口以 `hardboard:devices` 或 Windows 设备管理器结果为准，不强行假设 COM3。
