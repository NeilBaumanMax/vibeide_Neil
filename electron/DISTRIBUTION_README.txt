Catnip Forge v1.0.0（Build 7201）Windows x64 便携版
中文全称：Catnip 硬件智能开发平台
英文定位：Autonomous Hardware Development Agent

使用方法：
1. 必须完整解压整个 win-unpacked 文件夹，不要只复制 exe，也不要直接在压缩包内运行。
2. 建议解压到路径较短的用户可写目录，例如 D:\CatnipForge；不要放进需要管理员权限的 Program Files。
3. 双击“Catnip Forge.exe”。
4. 首次启动会要求填写 DeepSeek API Key。粘贴并保存后软件会自动重启，重新打开后即可直接使用 Agent。
5. 也可以把 resources\apikey.txt.example 复制为 resources\apikey.txt，然后把占位内容替换为自己的 Key。

运行要求：
- Windows 10/11 x64。
- 使用 Agent 时需要能够访问 DeepSeek API 的网络。
- 串口功能需要开发板驱动，并确保端口没有被其他串口软件占用。
- 请始终保留 exe、resources、locales 和 DLL 文件的相对目录结构。

安全说明：
- 发布包不包含开发者或其他用户的真实 API Key。
- 你的 Key 只保存在当前解压目录的 resources\apikey.txt。
- 转发或重新压缩前，请确认已经删除 resources\apikey.txt。

版本说明：
- 对外发布版本：v1.0.0
- 内部构建号：7201
- Windows 文件版本：1.0.0.7201
