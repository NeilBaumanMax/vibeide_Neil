# ESP32-S3 设备记录模板

## 基本信息

- 芯片：ESP32-S3
- 默认 ESP-IDF：5.4.3
- 默认 target：`esp32s3`
- 串口：待 `hardboard.devices_list` 检测
- 烧录命令：`idf.py -p <PORT> flash`

## Agent 开发约束

- 新工程先执行 `hardboard.idf_set_target`，target 使用 `esp32s3`。
- 编译前检查 `CMakeLists.txt`、`main/CMakeLists.txt`、`sdkconfig.defaults`。
- 烧录前必须列出设备并确认端口。
- 如果工程路径包含空格，先复制到 `runtime/hardboard/projects` 下再编译。

## 常见目录

- 示例：`runtime/hardboard/example/esp32s3`
- 工程：`runtime/hardboard/projects`
- 固件：`runtime/hardboard/firmware`
- 日志：`runtime/hardboard/logs`
