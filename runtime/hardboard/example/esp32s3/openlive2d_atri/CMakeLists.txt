cmake_minimum_required(VERSION 3.16)

set(OPENLIVE2D_SDK_ROOT "${CMAKE_CURRENT_LIST_DIR}/../.." CACHE PATH "OpenLive2D SDK root")

list(APPEND EXTRA_COMPONENT_DIRS
  "${OPENLIVE2D_SDK_ROOT}/ports/esp-idf/components/openlive2d_core"
  "${OPENLIVE2D_SDK_ROOT}/ports/esp-idf/components/openlive2d_renderer_lvgl"
  "${OPENLIVE2D_SDK_ROOT}/boards/esp32s3-touch-lcd-2/esp-idf/components/openlive2d_board_touch_lcd_2"
)

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(openlive2d_esp32s3_touch_lcd_2_atri)
