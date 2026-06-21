#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "Live2DCubismCore.h"
#include "esp_check.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "lvgl.h"
#include "openlive2d/renderers/lvgl_renderer.h"
#include "openlive2d_board_touch_lcd_2.h"

extern const uint8_t _binary_ATRI_moc3_start[] asm("_binary_ATRI_moc3_start");
extern const uint8_t _binary_ATRI_moc3_end[] asm("_binary_ATRI_moc3_end");
extern const uint8_t _binary_texture_00_rgb565_start[] asm("_binary_texture_00_rgb565_start");
extern const uint8_t _binary_texture_00_rgb565_end[] asm("_binary_texture_00_rgb565_end");
extern const uint8_t _binary_texture_00_a8_start[] asm("_binary_texture_00_a8_start");
extern const uint8_t _binary_texture_00_a8_end[] asm("_binary_texture_00_a8_end");
extern const uint8_t _binary_room_window_240x320_rgb565_start[] asm("_binary_room_window_240x320_rgb565_start");
extern const uint8_t _binary_room_window_240x320_rgb565_end[] asm("_binary_room_window_240x320_rgb565_end");

#define ATRI_TEXTURE_EDGE 512
#define ATRI_LCD_WIDTH OPENLIVE2D_BOARD_LCD_H_RES
#define ATRI_LCD_HEIGHT OPENLIVE2D_BOARD_LCD_V_RES
#define ATRI_RENDER_WIDTH ATRI_LCD_WIDTH
#define ATRI_RENDER_HEIGHT ATRI_LCD_HEIGHT
#define ATRI_RENDER_PERIOD_MS 120
#define ATRI_VIEW_SCALE 1.55f
#define ATRI_VIEW_CENTER_Y 0.68f
#define ATRI_IMU_BODY_SWAY_X_DEG 72.0f
#define ATRI_IMU_BODY_SWAY_Y_DEG 45.0f
#define ATRI_IMU_HEAD_SWAY_X_DEG 48.0f
#define ATRI_IMU_HEAD_SWAY_Y_DEG 36.0f
#define ATRI_IMU_GYRO_BODY_GAIN 0.30f
#define ATRI_IMU_TILT_FULL_SCALE_DEG 3.5f
#define ATRI_TAP_ACTION_DURATION_US 1600000ULL
#define ATRI_THINK_ACTION_DURATION_US 2400000ULL
#define ATRI_SHAKE_TRIGGER_THRESHOLD 0.34f
#define ATRI_SHAKE_RESET_THRESHOLD 0.18f
#define ATRI_SHAKE_WINDOW_US 2000000ULL
#define ATRI_SHAKE_COOLDOWN_US 2500000ULL
#define ATRI_SHAKE_REQUIRED_ALTERNATIONS 1
#define ATRI_LCD_QUEUE_LENGTH 2
#define ATRI_TAP_RANDOM_ACTION_COUNT 8
#define ATRI_HAND_RAISE_VALUE 30.0f
#define ATRI_HAND_REST_VALUE 0.0f

static const char* TAG = "openlive2d_atri";

typedef enum AtriTapAction {
    ATRI_TAP_ACTION_NONE = 0,
    ATRI_TAP_ACTION_TALK,
    ATRI_TAP_ACTION_NOD,
    ATRI_TAP_ACTION_WAVE,
    ATRI_TAP_ACTION_SHY,
    ATRI_TAP_ACTION_RAISE_LEFT_HAND,
    ATRI_TAP_ACTION_RAISE_RIGHT_HAND,
    ATRI_TAP_ACTION_RAISE_BOTH_HANDS,
    ATRI_TAP_ACTION_THINK,
} AtriTapAction;

typedef struct AtriActionKey {
    float phase;
    float value;
} AtriActionKey;

typedef struct AtriLcdSubmit {
    uint16_t* pixels;
    uint8_t canvas_index;
} AtriLcdSubmit;

typedef struct AtriRuntime {
    csmMoc* moc;
    csmModel* model;
    void* moc_memory;
    void* model_memory;
    uint16_t* render_canvas[2];
    uint16_t* scratch;
    SemaphoreHandle_t canvas_available[2];
    QueueHandle_t lcd_queue;
    uint8_t canvas_index;
    int param_angle_x;
    int param_angle_y;
    int param_angle_z;
    int param_body_angle_x;
    int param_body_angle_y;
    int param_body_angle_z;
    int param_eye_ball_x;
    int param_eye_ball_y;
    int param_eye_l_open;
    int param_eye_r_open;
    int param_brow_l_y;
    int param_brow_r_y;
    int param_mouth_form;
    int param_mouth_open_y;
    int param_cheek;
    int param_breath;
    int param_hand_left;
    int param_hand_right;
    float smoothed_x;
    float smoothed_y;
    float imu_origin_x;
    float imu_origin_y;
    float smoothed_imu_x;
    float smoothed_imu_y;
    float smoothed_gyro_z;
    uint32_t last_imu_sample_count;
    float last_body_x;
    float last_head_x;
    float last_head_y;
    uint32_t frame_count;
    uint64_t render_time_us;
    uint64_t model_time_us;
    uint64_t draw_time_us;
    uint64_t finish_time_us;
    uint64_t swap_time_us;
    uint64_t submit_queue_time_us;
    uint64_t tap_action_start_us;
    uint64_t last_shake_edge_us;
    uint64_t last_shake_action_us;
    uint32_t tap_rng;
    uint32_t tap_trigger_count;
    AtriTapAction tap_action;
    int8_t last_shake_dir;
    uint8_t shake_alternations;
    bool lcd_submit_ready;
    bool was_touched;
    bool imu_origin_ready;
    bool imu_logged;
    bool first_frame_logged;
} AtriRuntime;

static AtriRuntime s_atri;

static void* psram_aligned_alloc(size_t alignment, size_t size)
{
    void* ptr = heap_caps_aligned_alloc(alignment, size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (!ptr)
    {
        ptr = heap_caps_aligned_alloc(alignment, size, MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
    }
    return ptr;
}

static int find_param_index(csmModel* model, const char* id)
{
    const int count = csmGetParameterCount(model);
    const char** ids = csmGetParameterIds(model);
    for (int i = 0; i < count; ++i)
    {
        if (ids[i] && strcmp(ids[i], id) == 0)
        {
            return i;
        }
    }
    return -1;
}

static void set_param_if_present(csmModel* model, int index, float value)
{
    if (index < 0)
    {
        return;
    }
    float* values = csmGetParameterValues(model);
    const float* mins = csmGetParameterMinimumValues(model);
    const float* maxs = csmGetParameterMaximumValues(model);
    if (value < mins[index])
    {
        value = mins[index];
    }
    else if (value > maxs[index])
    {
        value = maxs[index];
    }
    values[index] = value;
}

static void add_param_if_present(csmModel* model, int index, float delta)
{
    if (index < 0)
    {
        return;
    }
    float* values = csmGetParameterValues(model);
    const float* mins = csmGetParameterMinimumValues(model);
    const float* maxs = csmGetParameterMaximumValues(model);
    float value = values[index] + delta;
    if (value < mins[index])
    {
        value = mins[index];
    }
    else if (value > maxs[index])
    {
        value = maxs[index];
    }
    values[index] = value;
}

static void reset_param_if_present(csmModel* model, int index)
{
    if (index < 0)
    {
        return;
    }
    float* values = csmGetParameterValues(model);
    const float* defaults = csmGetParameterDefaultValues(model);
    values[index] = defaults[index];
}

static void reset_tap_action_params(AtriRuntime* atri)
{
    reset_param_if_present(atri->model, atri->param_angle_z);
    reset_param_if_present(atri->model, atri->param_body_angle_y);
    reset_param_if_present(atri->model, atri->param_body_angle_z);
    reset_param_if_present(atri->model, atri->param_eye_l_open);
    reset_param_if_present(atri->model, atri->param_eye_r_open);
    reset_param_if_present(atri->model, atri->param_brow_l_y);
    reset_param_if_present(atri->model, atri->param_brow_r_y);
    reset_param_if_present(atri->model, atri->param_mouth_form);
    reset_param_if_present(atri->model, atri->param_mouth_open_y);
    reset_param_if_present(atri->model, atri->param_cheek);
    reset_param_if_present(atri->model, atri->param_breath);
    reset_param_if_present(atri->model, atri->param_hand_left);
    reset_param_if_present(atri->model, atri->param_hand_right);
}

static const char* tap_action_name(AtriTapAction action)
{
    switch (action)
    {
    case ATRI_TAP_ACTION_TALK:
        return "talk";
    case ATRI_TAP_ACTION_NOD:
        return "nod";
    case ATRI_TAP_ACTION_WAVE:
        return "wave";
    case ATRI_TAP_ACTION_SHY:
        return "shy";
    case ATRI_TAP_ACTION_RAISE_LEFT_HAND:
        return "raise_left_hand";
    case ATRI_TAP_ACTION_RAISE_RIGHT_HAND:
        return "raise_right_hand";
    case ATRI_TAP_ACTION_RAISE_BOTH_HANDS:
        return "raise_both_hands";
    case ATRI_TAP_ACTION_THINK:
        return "think";
    case ATRI_TAP_ACTION_NONE:
    default:
        return "none";
    }
}

static void start_random_action(AtriRuntime* atri, uint32_t seed_a, uint32_t seed_b, const char* source)
{
    uint32_t seed = (uint32_t)esp_timer_get_time();
    seed ^= (seed_a << 16) ^ seed_b ^ atri->last_imu_sample_count;
    atri->tap_rng = atri->tap_rng * 1664525u + 1013904223u + seed;
    atri->tap_action = (AtriTapAction)(1u + (atri->tap_rng % ATRI_TAP_RANDOM_ACTION_COUNT));
    atri->tap_action_start_us = (uint64_t)esp_timer_get_time();
    ESP_LOGI(TAG, "%s action %s", source, tap_action_name(atri->tap_action));
}

static void start_tap_action(AtriRuntime* atri, AtriTapAction action, const char* source)
{
    atri->tap_action = action;
    atri->tap_action_start_us = (uint64_t)esp_timer_get_time();
    ESP_LOGI(TAG, "%s action %s", source, tap_action_name(atri->tap_action));
}

static void start_random_tap_action(AtriRuntime* atri, uint16_t x, uint16_t y)
{
    atri->tap_trigger_count++;
    if (atri->tap_trigger_count == 1 || (atri->tap_trigger_count % 4u) == 0u)
    {
        start_tap_action(atri, ATRI_TAP_ACTION_THINK, "tap");
        return;
    }
    start_random_action(atri, x, y, "tap");
}

static float smoothstep(float x)
{
    if (x < 0.0f)
    {
        x = 0.0f;
    }
    else if (x > 1.0f)
    {
        x = 1.0f;
    }
    return x * x * (3.0f - 2.0f * x);
}

static float action_value_at(const AtriActionKey* keys, size_t key_count, float phase)
{
    if (key_count == 0)
    {
        return 0.0f;
    }
    if (phase <= keys[0].phase)
    {
        return keys[0].value;
    }
    if (phase >= keys[key_count - 1].phase)
    {
        return keys[key_count - 1].value;
    }
    for (size_t i = 0; i + 1 < key_count; ++i)
    {
        const AtriActionKey* a = &keys[i];
        const AtriActionKey* b = &keys[i + 1];
        if (phase >= a->phase && phase <= b->phase)
        {
            const float span = b->phase - a->phase;
            const float local = span > 0.0f ? smoothstep((phase - a->phase) / span) : 1.0f;
            return a->value + (b->value - a->value) * local;
        }
    }
    return keys[key_count - 1].value;
}

static void apply_think_action(AtriRuntime* atri, float phase)
{
    static const AtriActionKey left_hand[] = {
        {0.0f, 0.0f},
        {0.25f, 15.0f},
        {0.80f, 15.0f},
        {1.0f, 0.0f},
    };
    static const AtriActionKey right_hand[] = {
        {0.0f, 0.0f},
        {0.20f, 30.0f},
        {0.82f, 30.0f},
        {1.0f, 0.0f},
    };
    static const AtriActionKey body_z[] = {
        {0.0f, 0.0f},
        {0.30f, -8.0f},
        {0.82f, -8.0f},
        {1.0f, 0.0f},
    };
    static const AtriActionKey angle_y[] = {
        {0.0f, 0.0f},
        {0.20f, -20.0f},
        {0.55f, -12.0f},
        {0.78f, -16.0f},
        {1.0f, 0.0f},
    };
    static const AtriActionKey eye_open[] = {
        {0.0f, 0.75f},
        {0.18f, 0.38f},
        {0.78f, 0.42f},
        {1.0f, 0.75f},
    };
    static const AtriActionKey mouth_form[] = {
        {0.0f, 0.0f},
        {0.25f, -0.55f},
        {0.80f, -0.55f},
        {1.0f, 0.0f},
    };
    static const AtriActionKey cheek[] = {
        {0.0f, 0.0f},
        {0.24f, 0.72f},
        {0.78f, 0.72f},
        {1.0f, 0.0f},
    };

    set_param_if_present(atri->model, atri->param_hand_left,
        action_value_at(left_hand, sizeof(left_hand) / sizeof(left_hand[0]), phase));
    set_param_if_present(atri->model, atri->param_hand_right,
        action_value_at(right_hand, sizeof(right_hand) / sizeof(right_hand[0]), phase));
    set_param_if_present(atri->model, atri->param_body_angle_z,
        action_value_at(body_z, sizeof(body_z) / sizeof(body_z[0]), phase));
    set_param_if_present(atri->model, atri->param_angle_y,
        action_value_at(angle_y, sizeof(angle_y) / sizeof(angle_y[0]), phase));
    set_param_if_present(atri->model, atri->param_eye_l_open,
        action_value_at(eye_open, sizeof(eye_open) / sizeof(eye_open[0]), phase));
    set_param_if_present(atri->model, atri->param_eye_r_open,
        action_value_at(eye_open, sizeof(eye_open) / sizeof(eye_open[0]), phase));
    set_param_if_present(atri->model, atri->param_mouth_form,
        action_value_at(mouth_form, sizeof(mouth_form) / sizeof(mouth_form[0]), phase));
    set_param_if_present(atri->model, atri->param_cheek,
        action_value_at(cheek, sizeof(cheek) / sizeof(cheek[0]), phase));
}

static void update_shake_action(AtriRuntime* atri, float imu_y, bool touch_pressed)
{
    if (touch_pressed || !atri->imu_origin_ready || atri->tap_action != ATRI_TAP_ACTION_NONE)
    {
        return;
    }

    uint64_t now_us = (uint64_t)esp_timer_get_time();
    if (now_us - atri->last_shake_action_us < ATRI_SHAKE_COOLDOWN_US)
    {
        return;
    }

    int8_t dir = 0;
    if (imu_y >= ATRI_SHAKE_TRIGGER_THRESHOLD)
    {
        dir = 1;
    }
    else if (imu_y <= -ATRI_SHAKE_TRIGGER_THRESHOLD)
    {
        dir = -1;
    }
    else if (fabsf(imu_y) < ATRI_SHAKE_RESET_THRESHOLD)
    {
        atri->last_shake_dir = 0;
        return;
    }
    else
    {
        return;
    }

    if (dir == atri->last_shake_dir)
    {
        return;
    }

    if (atri->last_shake_edge_us == 0 || now_us - atri->last_shake_edge_us > ATRI_SHAKE_WINDOW_US)
    {
        atri->shake_alternations = 0;
    }
    else
    {
        atri->shake_alternations++;
    }

    atri->last_shake_dir = dir;
    atri->last_shake_edge_us = now_us;

    if (atri->shake_alternations >= ATRI_SHAKE_REQUIRED_ALTERNATIONS)
    {
        atri->shake_alternations = 0;
        atri->last_shake_action_us = now_us;
        atri->tap_action = ATRI_TAP_ACTION_WAVE;
        atri->tap_action_start_us = now_us;
        ESP_LOGI(TAG, "shake action %s", tap_action_name(atri->tap_action));
    }
}

static void apply_tap_action(AtriRuntime* atri, uint64_t now_us)
{
    if (atri->tap_action == ATRI_TAP_ACTION_NONE)
    {
        return;
    }
    uint64_t elapsed_us = now_us - atri->tap_action_start_us;
    const uint64_t duration_us =
        atri->tap_action == ATRI_TAP_ACTION_THINK ? ATRI_THINK_ACTION_DURATION_US : ATRI_TAP_ACTION_DURATION_US;
    if (elapsed_us >= duration_us)
    {
        atri->tap_action = ATRI_TAP_ACTION_NONE;
        return;
    }

    float t = (float)elapsed_us / 1000000.0f;
    float phase = (float)elapsed_us / (float)duration_us;
    float ease = sinf(phase * 3.1415926f);
    switch (atri->tap_action)
    {
    case ATRI_TAP_ACTION_TALK:
        set_param_if_present(atri->model, atri->param_mouth_open_y, 0.35f + 0.55f * fabsf(sinf(t * 10.0f)));
        set_param_if_present(atri->model, atri->param_mouth_form, 0.55f * sinf(t * 6.0f));
        add_param_if_present(atri->model, atri->param_brow_l_y, 0.25f * ease);
        add_param_if_present(atri->model, atri->param_brow_r_y, 0.25f * ease);
        add_param_if_present(atri->model, atri->param_angle_z, sinf(t * 4.0f) * 3.0f * ease);
        break;
    case ATRI_TAP_ACTION_NOD:
        add_param_if_present(atri->model, atri->param_angle_y, -18.0f * fabsf(sinf(t * 6.5f)) * ease);
        add_param_if_present(atri->model, atri->param_body_angle_y, -8.0f * fabsf(sinf(t * 6.5f)) * ease);
        set_param_if_present(atri->model, atri->param_eye_l_open, 0.55f + 0.35f * fabsf(sinf(t * 4.0f)));
        set_param_if_present(atri->model, atri->param_eye_r_open, 0.55f + 0.35f * fabsf(sinf(t * 4.0f)));
        break;
    case ATRI_TAP_ACTION_WAVE:
        set_param_if_present(atri->model,
            atri->param_hand_right,
            (18.0f + 12.0f * fabsf(sinf(t * 7.0f))) * ease);
        set_param_if_present(atri->model, atri->param_hand_left, 8.0f * fabsf(sinf(t * 5.0f)) * ease);
        add_param_if_present(atri->model, atri->param_body_angle_z, sinf(t * 4.5f) * 8.0f * ease);
        set_param_if_present(atri->model, atri->param_mouth_open_y, 0.18f + 0.18f * fabsf(sinf(t * 8.0f)));
        break;
    case ATRI_TAP_ACTION_RAISE_LEFT_HAND:
        set_param_if_present(atri->model, atri->param_hand_left, ATRI_HAND_RAISE_VALUE * ease);
        set_param_if_present(atri->model, atri->param_hand_right, ATRI_HAND_REST_VALUE);
        add_param_if_present(atri->model, atri->param_body_angle_z, 5.0f * ease);
        add_param_if_present(atri->model, atri->param_angle_z, 3.0f * ease);
        set_param_if_present(atri->model, atri->param_mouth_open_y, 0.16f * ease);
        break;
    case ATRI_TAP_ACTION_RAISE_RIGHT_HAND:
        set_param_if_present(atri->model, atri->param_hand_right, ATRI_HAND_RAISE_VALUE * ease);
        set_param_if_present(atri->model, atri->param_hand_left, ATRI_HAND_REST_VALUE);
        add_param_if_present(atri->model, atri->param_body_angle_z, -5.0f * ease);
        add_param_if_present(atri->model, atri->param_angle_z, -3.0f * ease);
        set_param_if_present(atri->model, atri->param_mouth_open_y, 0.16f * ease);
        break;
    case ATRI_TAP_ACTION_RAISE_BOTH_HANDS:
        set_param_if_present(atri->model, atri->param_hand_left, ATRI_HAND_RAISE_VALUE * ease);
        set_param_if_present(atri->model, atri->param_hand_right, ATRI_HAND_RAISE_VALUE * ease);
        add_param_if_present(atri->model, atri->param_body_angle_y, -5.0f * ease);
        set_param_if_present(atri->model, atri->param_mouth_open_y, 0.22f + 0.12f * fabsf(sinf(t * 8.0f)) * ease);
        add_param_if_present(atri->model, atri->param_brow_l_y, 0.20f * ease);
        add_param_if_present(atri->model, atri->param_brow_r_y, 0.20f * ease);
        break;
    case ATRI_TAP_ACTION_SHY:
        set_param_if_present(atri->model, atri->param_cheek, 0.85f * ease);
        set_param_if_present(atri->model, atri->param_eye_l_open, 0.55f);
        set_param_if_present(atri->model, atri->param_eye_r_open, 0.55f);
        set_param_if_present(atri->model, atri->param_mouth_form, -0.45f * ease);
        add_param_if_present(atri->model, atri->param_angle_z, -7.0f * ease);
        break;
    case ATRI_TAP_ACTION_THINK:
        apply_think_action(atri, phase);
        break;
    case ATRI_TAP_ACTION_NONE:
    default:
        break;
    }
}

static uint16_t byte_swap16(uint16_t value)
{
    return (uint16_t)((value >> 8) | (value << 8));
}

static uint16_t lcd_pixel_from_rgb565(uint16_t value)
{
#if LV_COLOR_16_SWAP
    return byte_swap16(value);
#else
    return value;
#endif
}

static void update_touch_parameters(AtriRuntime* atri)
{
    OpenLive2DBoardTouchState touch = openlive2d_board_touch_lcd_2_get_touch();
    OpenLive2DBoardImuState imu = openlive2d_board_touch_lcd_2_get_imu();
    float target_x = 0.0f;
    float target_y = 0.0f;
    if (touch.pressed)
    {
        float x = (float)touch.x;
        float y = (float)touch.y;
        if (!atri->was_touched)
        {
            ESP_LOGI(TAG, "touch press x=%u y=%u", touch.x, touch.y);
            start_random_tap_action(atri, touch.x, touch.y);
        }
        atri->was_touched = true;
        if (x < 0.0f) x = 0.0f;
        if (y < 0.0f) y = 0.0f;
        if (x > (float)(ATRI_LCD_WIDTH - 1)) x = (float)(ATRI_LCD_WIDTH - 1);
        if (y > (float)(ATRI_LCD_HEIGHT - 1)) y = (float)(ATRI_LCD_HEIGHT - 1);
        target_x = (x / (float)(ATRI_LCD_WIDTH - 1)) * 2.0f - 1.0f;
        target_y = (y / (float)(ATRI_LCD_HEIGHT - 1)) * 2.0f - 1.0f;
    }
    else if (atri->was_touched)
    {
        ESP_LOGI(TAG, "touch release");
        atri->was_touched = false;
    }

    atri->smoothed_x += (target_x - atri->smoothed_x) * 0.24f;
    atri->smoothed_y += (target_y - atri->smoothed_y) * 0.24f;

    float imu_x = 0.0f;
    float imu_y = 0.0f;
    float gyro_z = 0.0f;
    if (imu.available)
    {
        if (!atri->imu_origin_ready)
        {
            atri->imu_origin_x = imu.angle_y_deg;
            atri->imu_origin_y = imu.angle_x_deg;
            atri->imu_origin_ready = true;
        }
        imu_x = (imu.angle_y_deg - atri->imu_origin_x) / ATRI_IMU_TILT_FULL_SCALE_DEG;
        imu_y = -(imu.angle_x_deg - atri->imu_origin_y) / ATRI_IMU_TILT_FULL_SCALE_DEG;
        gyro_z = imu.gyro_z_dps;
        if (imu_x < -1.0f) imu_x = -1.0f;
        if (imu_x > 1.0f) imu_x = 1.0f;
        if (imu_y < -1.0f) imu_y = -1.0f;
        if (imu_y > 1.0f) imu_y = 1.0f;
        atri->last_imu_sample_count = imu.sample_count;
        if (!atri->imu_logged)
        {
            ESP_LOGI(TAG, "imu ready ax=%.2fg ay=%.2fg az=%.2fg angle_x=%.2f angle_y=%.2f",
                (double)imu.acc_x_g,
                (double)imu.acc_y_g,
                (double)imu.acc_z_g,
                (double)imu.angle_x_deg,
                (double)imu.angle_y_deg);
            atri->imu_logged = true;
        }
    }
    update_shake_action(atri, imu_y, touch.pressed);

    atri->smoothed_imu_x += (imu_x - atri->smoothed_imu_x) * 0.40f;
    atri->smoothed_imu_y += (imu_y - atri->smoothed_imu_y) * 0.40f;
    atri->smoothed_gyro_z += (gyro_z - atri->smoothed_gyro_z) * 0.28f;

    reset_tap_action_params(atri);

    const float imu_weight = touch.pressed ? 0.0f : 1.0f;
    const float imu_out_x = atri->smoothed_imu_x * imu_weight;
    const float imu_out_y = atri->smoothed_imu_y * imu_weight;
    const float gyro_out_z = atri->smoothed_gyro_z * imu_weight;

    const float head_x = atri->smoothed_x * 30.0f + imu_out_x * ATRI_IMU_HEAD_SWAY_X_DEG;
    const float head_y = -atri->smoothed_y * 24.0f - imu_out_y * ATRI_IMU_HEAD_SWAY_Y_DEG;
    const float body_x =
        atri->smoothed_x * 10.0f + imu_out_x * ATRI_IMU_BODY_SWAY_X_DEG +
        gyro_out_z * ATRI_IMU_GYRO_BODY_GAIN;
    const float body_y = -imu_out_y * ATRI_IMU_BODY_SWAY_Y_DEG;
    atri->last_head_x = head_x;
    atri->last_head_y = head_y;
    atri->last_body_x = body_x + body_y;

    set_param_if_present(atri->model, atri->param_angle_x, head_x);
    set_param_if_present(atri->model, atri->param_angle_y, head_y);
    set_param_if_present(atri->model, atri->param_body_angle_x, body_x + body_y);
    set_param_if_present(atri->model, atri->param_eye_ball_x, atri->smoothed_x + imu_out_x * 0.20f);
    set_param_if_present(atri->model, atri->param_eye_ball_y, -atri->smoothed_y - imu_out_y * 0.16f);
    apply_tap_action(atri, (uint64_t)esp_timer_get_time());
}

static void atri_lcd_submit_task(void* param)
{
    AtriRuntime* atri = (AtriRuntime*)param;
    AtriLcdSubmit submit = {0};
    while (1)
    {
        xQueueReceive(atri->lcd_queue, &submit, portMAX_DELAY);
        esp_err_t draw_err = openlive2d_board_touch_lcd_2_draw_rgb565(
            0, 0, ATRI_LCD_WIDTH, ATRI_LCD_HEIGHT, submit.pixels);
        if (draw_err != ESP_OK)
        {
            ESP_LOGW(TAG, "LCD submit failed: %s", esp_err_to_name(draw_err));
        }
        xSemaphoreGive(atri->canvas_available[submit.canvas_index]);
    }
}

static esp_err_t start_lcd_submit_task(AtriRuntime* atri)
{
    atri->lcd_queue = xQueueCreate(ATRI_LCD_QUEUE_LENGTH, sizeof(AtriLcdSubmit));
    ESP_RETURN_ON_FALSE(atri->lcd_queue, ESP_ERR_NO_MEM, TAG, "LCD queue failed");
    for (size_t i = 0; i < 2; ++i)
    {
        atri->canvas_available[i] = xSemaphoreCreateBinary();
        ESP_RETURN_ON_FALSE(atri->canvas_available[i], ESP_ERR_NO_MEM, TAG, "canvas semaphore failed");
        xSemaphoreGive(atri->canvas_available[i]);
    }

    BaseType_t ok = xTaskCreatePinnedToCore(
        atri_lcd_submit_task,
        "atri_lcd_cpu0",
        1024 * 4,
        atri,
        6,
        NULL,
        0);
    ESP_RETURN_ON_FALSE(ok == pdPASS, ESP_ERR_NO_MEM, TAG, "LCD submit task failed");
    atri->lcd_submit_ready = true;
    return ESP_OK;
}

static bool render_atri(AtriRuntime* atri)
{
    int64_t model_start_us = esp_timer_get_time();
    const uint8_t canvas_index = atri->canvas_index;
    if (atri->lcd_submit_ready)
    {
        xSemaphoreTake(atri->canvas_available[canvas_index], portMAX_DELAY);
    }
    update_touch_parameters(atri);
    csmResetDrawableDynamicFlags(atri->model);
    csmUpdateModel(atri->model);
    int64_t model_end_us = esp_timer_get_time();

    const OpenLive2DLVGLTexture texture = {
        .rgba8888 = NULL,
        .rgb565 = (const uint16_t*)_binary_texture_00_rgb565_start,
        .a8 = _binary_texture_00_a8_start,
        .width = ATRI_TEXTURE_EDGE,
        .height = ATRI_TEXTURE_EDGE,
        .format = OPENLIVE2D_LVGL_TEXTURE_RGB565_A8,
    };
    const OpenLive2DLVGLDrawOptions options = {
        .canvas_width = ATRI_RENDER_WIDTH,
        .canvas_height = ATRI_RENDER_HEIGHT,
        .background_rgb565 = 0x0000,
        .background_rgb565_pixels = (const uint16_t*)_binary_room_window_240x320_rgb565_start,
        .texture_filter = OPENLIVE2D_LVGL_TEXTURE_FILTER_BILINEAR,
        .edge_aa = OPENLIVE2D_LVGL_EDGE_AA_NONE,
        .round_mask_enabled = 0,
        .view_scale = ATRI_VIEW_SCALE,
        .view_center_y = ATRI_VIEW_CENTER_Y,
    };

    uint16_t* render_canvas = atri->render_canvas[canvas_index];
    int64_t draw_start_us = esp_timer_get_time();
    bool render_ok = false;
    int64_t draw_end_us = draw_start_us;
    int64_t finish_start_us = draw_start_us;
    int64_t finish_end_us = draw_start_us;
    render_ok = openlive2d_lvgl_renderer_draw_model_rgb565_rect(
                    atri->model, &texture, &options, render_canvas,
                    0, 0, ATRI_RENDER_WIDTH, ATRI_RENDER_HEIGHT) != 0;
    draw_end_us = esp_timer_get_time();
    finish_start_us = draw_end_us;
    const bool finish_ok =
        openlive2d_lvgl_renderer_finish_rgb565(&options, render_canvas, atri->scratch) != 0;
    finish_end_us = esp_timer_get_time();
    render_ok = render_ok && finish_ok;
    if (!render_ok)
    {
        ESP_LOGW(TAG, "render failed");
        if (atri->lcd_submit_ready)
        {
            xSemaphoreGive(atri->canvas_available[canvas_index]);
        }
        return false;
    }
    int64_t swap_start_us = esp_timer_get_time();
    for (size_t i = 0; i < (size_t)ATRI_LCD_WIDTH * (size_t)ATRI_LCD_HEIGHT; ++i)
    {
        render_canvas[i] = lcd_pixel_from_rgb565(render_canvas[i]);
    }
    int64_t swap_end_us = esp_timer_get_time();
    int64_t submit_start_us = esp_timer_get_time();
    bool submit_ok = true;
    if (atri->lcd_submit_ready)
    {
        const AtriLcdSubmit submit = {
            .pixels = render_canvas,
            .canvas_index = canvas_index,
        };
        submit_ok = xQueueSend(atri->lcd_queue, &submit, portMAX_DELAY) == pdTRUE;
    }
    else
    {
        esp_err_t draw_err = openlive2d_board_touch_lcd_2_draw_rgb565(
            0, 0, ATRI_LCD_WIDTH, ATRI_LCD_HEIGHT, render_canvas);
        submit_ok = draw_err == ESP_OK;
        if (!submit_ok)
        {
            ESP_LOGW(TAG, "LCD submit failed: %s", esp_err_to_name(draw_err));
        }
    }
    int64_t submit_end_us = esp_timer_get_time();
    if (!submit_ok)
    {
        if (atri->lcd_submit_ready)
        {
            xSemaphoreGive(atri->canvas_available[canvas_index]);
        }
        return false;
    }

    atri->canvas_index = (uint8_t)(1u - canvas_index);
    atri->frame_count++;
    atri->render_time_us += (uint64_t)(submit_end_us - model_start_us);
    atri->model_time_us += (uint64_t)(model_end_us - model_start_us);
    atri->draw_time_us += (uint64_t)(draw_end_us - draw_start_us);
    atri->finish_time_us += (uint64_t)(finish_end_us - finish_start_us);
    atri->swap_time_us += (uint64_t)(swap_end_us - swap_start_us);
    atri->submit_queue_time_us += (uint64_t)(submit_end_us - submit_start_us);
    if ((atri->frame_count % 30u) == 0u)
    {
        ESP_LOGI(TAG,
            "perf frames=%u total_avg=%llu us model_avg=%llu us draw_avg=%llu us finish_avg=%llu us swap_avg=%llu us submit_queue_avg=%llu us imu_samples=%u imu_x=%.2f imu_y=%.2f head=(%.1f,%.1f) body=%.1f",
            (unsigned int)atri->frame_count,
            (unsigned long long)(atri->render_time_us / atri->frame_count),
            (unsigned long long)(atri->model_time_us / atri->frame_count),
            (unsigned long long)(atri->draw_time_us / atri->frame_count),
            (unsigned long long)(atri->finish_time_us / atri->frame_count),
            (unsigned long long)(atri->swap_time_us / atri->frame_count),
            (unsigned long long)(atri->submit_queue_time_us / atri->frame_count),
            (unsigned int)atri->last_imu_sample_count,
            (double)atri->smoothed_imu_x,
            (double)atri->smoothed_imu_y,
            (double)atri->last_head_x,
            (double)atri->last_head_y,
            (double)atri->last_body_x);
    }

    if (!atri->first_frame_logged)
    {
        ESP_LOGI(TAG, "initial render complete");
        atri->first_frame_logged = true;
    }
    return true;
}

static void render_timer_cb(lv_timer_t* timer)
{
    AtriRuntime* atri = (AtriRuntime*)timer->user_data;
    render_atri(atri);
}

static esp_err_t atri_runtime_init(AtriRuntime* atri)
{
    memset(atri, 0, sizeof(*atri));

    const size_t moc_size = (size_t)(_binary_ATRI_moc3_end - _binary_ATRI_moc3_start);
    const size_t rgb565_size = (size_t)(_binary_texture_00_rgb565_end - _binary_texture_00_rgb565_start);
    const size_t a8_size = (size_t)(_binary_texture_00_a8_end - _binary_texture_00_a8_start);
    const size_t bg_size =
        (size_t)(_binary_room_window_240x320_rgb565_end - _binary_room_window_240x320_rgb565_start);
    ESP_LOGI(TAG, "ATRI assets: moc=%u rgb565=%u a8=%u bg=%u",
        (unsigned int)moc_size, (unsigned int)rgb565_size, (unsigned int)a8_size, (unsigned int)bg_size);
    ESP_RETURN_ON_FALSE(rgb565_size == ATRI_TEXTURE_EDGE * ATRI_TEXTURE_EDGE * sizeof(uint16_t),
        ESP_ERR_INVALID_SIZE, TAG, "unexpected rgb565 texture size");
    ESP_RETURN_ON_FALSE(a8_size == ATRI_TEXTURE_EDGE * ATRI_TEXTURE_EDGE,
        ESP_ERR_INVALID_SIZE, TAG, "unexpected alpha texture size");
    ESP_RETURN_ON_FALSE(bg_size == ATRI_RENDER_WIDTH * ATRI_RENDER_HEIGHT * sizeof(uint16_t),
        ESP_ERR_INVALID_SIZE, TAG, "unexpected background size");

    atri->moc_memory = psram_aligned_alloc(csmAlignofMoc, moc_size);
    ESP_RETURN_ON_FALSE(atri->moc_memory, ESP_ERR_NO_MEM, TAG, "MOC allocation failed");
    memcpy(atri->moc_memory, _binary_ATRI_moc3_start, moc_size);

    ESP_RETURN_ON_FALSE(csmHasMocConsistency(atri->moc_memory, (unsigned int)moc_size),
        ESP_ERR_INVALID_RESPONSE, TAG, "MOC consistency check failed");
    ESP_LOGI(TAG, "MOC consistency passed");

    atri->moc = csmReviveMocInPlace(atri->moc_memory, (unsigned int)moc_size);
    ESP_RETURN_ON_FALSE(atri->moc, ESP_ERR_INVALID_RESPONSE, TAG, "MOC revive failed");
    ESP_LOGI(TAG, "MOC revived");

    const unsigned int model_size = csmGetSizeofModel(atri->moc);
    ESP_LOGI(TAG, "model memory size=%u", model_size);
    atri->model_memory = psram_aligned_alloc(csmAlignofModel, model_size);
    ESP_RETURN_ON_FALSE(atri->model_memory, ESP_ERR_NO_MEM, TAG, "model allocation failed");
    atri->model = csmInitializeModelInPlace(atri->moc, atri->model_memory, model_size);
    ESP_RETURN_ON_FALSE(atri->model, ESP_ERR_INVALID_RESPONSE, TAG, "model init failed");
    ESP_LOGI(TAG, "model initialized");

    float* values = csmGetParameterValues(atri->model);
    const float* defaults = csmGetParameterDefaultValues(atri->model);
    memcpy(values, defaults, (size_t)csmGetParameterCount(atri->model) * sizeof(float));

    atri->render_canvas[0] = heap_caps_malloc(ATRI_RENDER_WIDTH * ATRI_RENDER_HEIGHT * sizeof(uint16_t),
        MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    atri->render_canvas[1] = heap_caps_malloc(ATRI_RENDER_WIDTH * ATRI_RENDER_HEIGHT * sizeof(uint16_t),
        MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    atri->scratch = heap_caps_malloc(ATRI_RENDER_WIDTH * ATRI_RENDER_HEIGHT * sizeof(uint16_t),
        MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    ESP_RETURN_ON_FALSE(atri->render_canvas[0] && atri->render_canvas[1] && atri->scratch,
        ESP_ERR_NO_MEM, TAG, "canvas allocation failed");
    ESP_LOGI(TAG, "canvas buffers allocated");

    ESP_RETURN_ON_ERROR(start_lcd_submit_task(atri), TAG, "LCD submit task init failed");
    ESP_LOGI(TAG, "core0 LCD submit task ready");

    ESP_LOGI(TAG, "core1 LVGL render path ready");

    atri->param_angle_x = find_param_index(atri->model, "ParamAngleX");
    atri->param_angle_y = find_param_index(atri->model, "ParamAngleY");
    atri->param_angle_z = find_param_index(atri->model, "ParamAngleZ");
    atri->param_body_angle_x = find_param_index(atri->model, "ParamBodyAngleX");
    atri->param_body_angle_y = find_param_index(atri->model, "ParamBodyAngleY");
    atri->param_body_angle_z = find_param_index(atri->model, "ParamBodyAngleZ");
    atri->param_eye_ball_x = find_param_index(atri->model, "ParamEyeBallX");
    atri->param_eye_ball_y = find_param_index(atri->model, "ParamEyeBallY");
    atri->param_eye_l_open = find_param_index(atri->model, "ParamEyeLOpen");
    atri->param_eye_r_open = find_param_index(atri->model, "ParamEyeROpen");
    atri->param_brow_l_y = find_param_index(atri->model, "ParamBrowLY");
    atri->param_brow_r_y = find_param_index(atri->model, "ParamBrowRY");
    atri->param_mouth_form = find_param_index(atri->model, "ParamMouthForm");
    atri->param_mouth_open_y = find_param_index(atri->model, "ParamMouthOpenY");
    atri->param_cheek = find_param_index(atri->model, "ParamCheek");
    atri->param_breath = find_param_index(atri->model, "ParamBreath");
    atri->param_hand_left = find_param_index(atri->model, "Param12");
    atri->param_hand_right = find_param_index(atri->model, "Param13");
    atri->tap_action = ATRI_TAP_ACTION_NONE;
    atri->tap_rng = (uint32_t)esp_timer_get_time() ^ 0xA7125EEDu;

    return ESP_OK;
}

static esp_err_t create_atri_view(AtriRuntime* atri)
{
    ESP_RETURN_ON_FALSE(render_atri(atri), ESP_FAIL, TAG, "initial render failed");
    lv_timer_create(render_timer_cb, ATRI_RENDER_PERIOD_MS, atri);
    return ESP_OK;
}

void app_main(void)
{
    ESP_ERROR_CHECK(openlive2d_board_touch_lcd_2_init());
    ESP_ERROR_CHECK(atri_runtime_init(&s_atri));
    ESP_LOGI(TAG, "ATRI runtime ready");

    if (openlive2d_board_lvgl_lock(-1))
    {
        ESP_ERROR_CHECK(create_atri_view(&s_atri));
        openlive2d_board_lvgl_unlock();
    }
}
