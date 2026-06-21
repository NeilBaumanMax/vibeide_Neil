# ESP-IDF Tools

目标内置版本：ESP-IDF 5.4.3。

期望打包布局：

```text
runtime/hardboard/esptools/
  esp-idf-v5.4.3/
    esp-idf/
      tools/idf.py
      export.bat
      export.ps1
      install.bat
```

当前开发机已发现的 ESP-IDF：

```text
/home/howtion/.esp/v5.4.3/esp-idf
```

Windows 最终免环境配置要求：

- `runtime/python/python.exe` 可用。
- `runtime/hardboard/esptools/esp-idf-v5.4.3/esp-idf/tools/idf.py` 可用。
- ESP-IDF 需要的 CMake、Ninja、toolchain 缓存在随包目录或由 `IDF_TOOLS_PATH` 指向随包目录。
- vibeide 启动后 Claude Code 通过 `hardboard.*` MCP 工具调用，不要求用户手动配置系统环境变量。
