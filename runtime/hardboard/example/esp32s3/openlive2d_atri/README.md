# ESP32-S3 Touch LCD 2 ATRI

ESP-IDF bring-up app for the Waveshare ESP32-S3-Touch-LCD-2 board.

This is the current `1.4` hardware reference app for the SDK.

This example keeps the SDK layers separate:

```text
common/core/purism                         Live2D-compatible core
common/renderers/lvgl                      RGB565 software renderer
boards/esp32s3-touch-lcd-2/esp-idf         ST7789T3, CST816D/CST816S touch, QMI8658, backlight, LVGL port
examples/esp32s3_touch_lcd_2_atri          ATRI app wiring and embedded 512 RGB565+A8 assets
```

Build:

```bash
cd openlive2dsdk
. scripts/esp-idf/export.sh
cd examples/esp32s3_touch_lcd_2_atri
idf.py set-target esp32s3
idf.py build
```

Flash and monitor:

```bash
idf.py -p /dev/ttyACM0 build flash
idf.py -p /dev/ttyACM0 monitor
```

The app embeds `ATRI_lvgl_512` resources as flash binary data:

```text
ATRI.moc3             492928 bytes
texture_00.rgb565     524288 bytes
texture_00.a8         262144 bytes
room_window_240x320.rgb565 153600 bytes
runtime texture total 786432 bytes
```

The embedded MOC is copied to a `csmAlignofMoc`-aligned PSRAM-capable buffer
before consistency checking and revive. Model memory, full 240x320 RGB565
canvas buffers, and the scratch buffer also use PSRAM-capable allocators.
The default composition is an upper-body framing profile:

```text
ATRI_VIEW_SCALE=1.55
ATRI_VIEW_CENTER_Y=0.68
```

The accepted hardware quality profile, inherited from the 1.2 visual baseline, is:

```text
ATRI_TEXTURE_EDGE=512
canvas=240x320 RGB565
background=room_window_240x320.rgb565
texture_filter=bilinear
edge_aa=none for bitmap background
ESP32-S3 CPU=240MHz
LCD submit=queued core0 esp_lcd_panel_draw_bitmap()
SPI DMA=enabled through SPI_DMA_CH_AUTO
IMU=QMI8658 cached 20ms samples, amplified body/head/eye sway
task split=core0 peripherals/LCD submit, core1 LVGL/action/software render
render period=300ms, matched to current software raster throughput
IMU tilt full scale=about 3.5 degrees from neutral
shake trigger threshold=0.34 normalized imu_y
```

The background is a static embedded RGB565 bitmap. It is copied into the
render canvas by row before the Live2D model is blended over it. This costs
memory bandwidth, but does not add Live2D triangle rasterization work.

The current app intentionally does not split model rendering across both CPU
cores. Hardware testing showed that the visible bottleneck is the software
raster path, while splitting CPU render work did not help enough to justify
stealing core0 from peripherals. The current task split is:

```text
core0: qmi8658 IMU sampling, touch_poll CST816 sampling, atri_lcd_cpu0 queued LCD submit
core1: openlive2d_lvgl timer, model parameter/action updates, RGB565 software render, byte-swap
```

The board component also samples the QMI8658 IMU on a background task. The
render loop reads the cached IMU snapshot, so it does not block the frame on
I2C. The first available IMU pose is treated as neutral; relative tilt and
z-axis gyro are blended into body sway and small head/eye offsets.
Touch input has interaction priority: while the screen is pressed, the app
drives the model from touch and masks IMU contribution from the final Live2D
parameters. IMU state still updates in the background, so body/head/eye sway
resumes immediately after release.
Each new touch press also triggers one random lightweight built-in action:
`talk`, `nod`, `wave`, `shy`, `raise_left_hand`, `raise_right_hand`, or
`raise_both_hands`. These actions animate existing model parameters such as
mouth, brows, cheek, body rotation, and hand raise; no `motion3.json` files are
embedded in this example yet.
The `wave` action can also be triggered by deliberate up/down IMU shake: the
detector requires alternating vertical tilt, ignores active touch, waits for the
current action to finish, and has a cooldown to reduce accidental triggers.

```text
QMI8658 sample period=20ms
CPU0 tasks=qmi8658, touch_poll, atri_lcd_cpu0
I2C access=mutex shared with CST816 touch
Live2D body mapping=ParamBodyAngleX plus stronger ParamAngleX/Y and eye offsets
tilt scale=about 3.5 degrees from neutral reaches the clamped input range
vertical mapping=board up/down direction corrected
shake action trigger=1 up/down alternation within about 2.0s, then 2.5s cooldown
```

Current core use:

```text
core0 / PRO CPU                         core1 / APP CPU
-------------------------------         ---------------------------------
main_task startup                       openlive2d_lvgl task
qmi8658 IMU sampler                     touch/IMU/action parameter mapping
touch_poll CST816 sampler               csmUpdateModel
atri_lcd_cpu0 LCD submit queue          RGB565+A8 software render
SPI DMA transaction owner               RGB565 byte-swap
```

Touch is registered as an LVGL pointer device through `esp_lcd_touch_cst816s`.
The board component polls CST816 on core0 and caches the latest state; LVGL and
the app read that cached state instead of doing I2C work on the core1 LVGL
task. The app maps touch to common Live2D look parameters such as
`ParamAngleX`, `ParamAngleY`, and `ParamEyeBallX/Y` when those parameters are
present in the model.

When a touch is detected, the example logs one press coordinate and a release
line. The board component reads touch points through `esp_lcd_touch_get_data()`.

```text
openlive2d_atri: touch press x=... y=...
openlive2d_atri: touch release
```

Latest real-board monitor sample:

```text
cpu_start: cpu freq: 240000000 Hz
esp_psram: Found 8MB PSRAM device
openlive2d_board: initialize SPI LCD bus
openlive2d_board: initialize CST816D/CST816S touch over I2C
CST816S: IC id: 182
openlive2d_board: QMI8658 ready
openlive2d_atri: ATRI assets: moc=492928 rgb565=524288 a8=262144 bg=153600
openlive2d_atri: core0 LCD submit task ready
openlive2d_atri: core1 LVGL render path ready
openlive2d_atri: imu ready ax=... ay=... az=... angle_x=... angle_y=...
openlive2d_atri: initial render complete
openlive2d_atri: perf frames=30 total_avg=258264 us model_avg=17358 us draw_avg=229402 us finish_avg=8 us swap_avg=11358 us submit_queue_avg=120 us imu_samples=439 ...
```

The measured core1 queue overhead for LCD submit is about `0.12 ms/frame`;
the visible speed limit in this version is still the CPU software renderer and
full-frame byte-swap, not the ST7789T3 DMA transfer. A 300ms render timer is
used because the current software raster path is around 258ms/frame on this
profile; chasing a 66ms timer starves core1 idle time and triggers the task
watchdog.

Measured frame cost is dominated by software rasterization:

```text
model update       about  17.4 ms
software raster    about 229.4 ms
byte-swap          about  11.4 ms
core1 queue submit about   0.12 ms
```
