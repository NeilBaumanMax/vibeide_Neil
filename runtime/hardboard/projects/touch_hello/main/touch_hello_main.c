#include <stdio.h>
#include "esp_err.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "bsp/esp-bsp.h"
#include "lvgl.h"

static const char *TAG = "touch_hello";

static void hello_button_event_cb(lv_event_t *event)
{
    (void)event;
    // Send "hello" over USB-Serial so the host can read it
    printf("hello\n");
    ESP_LOGI(TAG, "Button pressed — sent hello");
}

void app_main(void)
{
    ESP_LOGI(TAG, "Starting Touch Hello application");

    /* Initialize AMOLED display and touch through the BSP */
    lv_display_t *display = bsp_display_start();
    if (display == NULL) {
        ESP_LOGE(TAG, "Display initialization failed");
        abort();
    }

    /* Set comfortable default brightness (10–100) */
    ESP_ERROR_CHECK(bsp_display_brightness_set(80));

    /* Build the UI under LVGL lock */
    if (bsp_display_lock(1000)) {
        lv_obj_t *screen = lv_screen_active();
        lv_obj_set_style_bg_color(screen, lv_color_hex(0x08111f), LV_PART_MAIN);

        /* ---- Title ---- */
        lv_obj_t *title = lv_label_create(screen);
        lv_label_set_text(title, "Touch Hello");
        lv_obj_set_style_text_color(title, lv_color_hex(0xffffff), LV_PART_MAIN);
        lv_obj_set_style_text_font(title, &lv_font_montserrat_28, LV_PART_MAIN);
        lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 40);

        /* ---- Subtitle / hint ---- */
        lv_obj_t *hint = lv_label_create(screen);
        lv_label_set_text(hint, "Tap the button to send \"hello\" via serial");
        lv_obj_set_style_text_color(hint, lv_color_hex(0xa9c7df), LV_PART_MAIN);
        lv_obj_align(hint, LV_ALIGN_TOP_MID, 0, 90);

        /* ---- Hello Button ---- */
        lv_obj_t *btn = lv_button_create(screen);
        lv_obj_set_size(btn, 220, 90);
        lv_obj_align(btn, LV_ALIGN_CENTER, 0, 0);
        lv_obj_set_style_bg_color(btn, lv_color_hex(0x2f9bff), LV_PART_MAIN);
        lv_obj_set_style_radius(btn, 18, LV_PART_MAIN);
        lv_obj_add_event_cb(btn, hello_button_event_cb, LV_EVENT_CLICKED, NULL);

        lv_obj_t *btn_label = lv_label_create(btn);
        lv_label_set_text(btn_label, "Say Hello");
        lv_obj_set_style_text_color(btn_label, lv_color_hex(0xffffff), LV_PART_MAIN);
        lv_obj_set_style_text_font(btn_label, &lv_font_montserrat_20, LV_PART_MAIN);
        lv_obj_center(btn_label);

        bsp_display_unlock();
    } else {
        ESP_LOGE(TAG, "Could not lock LVGL to create UI");
    }

    ESP_LOGI(TAG, "UI ready — tap the button to send \"hello\" over serial");

    while (true) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
