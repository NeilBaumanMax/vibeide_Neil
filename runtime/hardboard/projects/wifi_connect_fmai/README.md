# Wi-Fi Connect Test

ESP32-S3 Wi-Fi station smoke project for hardboard vibecoding.

## Secrets

Create `main/wifi_secrets.h` locally. This file is ignored by git.

```c
#pragma once
#define VIBEIDE_WIFI_SSID "FMai"
#define VIBEIDE_WIFI_PASSWORD "your-password"
```

## Build / Flash

Use hardboard tools:

```text
hardboard.idf_set_target(projectDir, "esp32s3")
hardboard.idf_build(projectDir)
hardboard.idf_flash(projectDir, "COM3")
```
