idf_component_register(
    SRCS "wifi_connect_main.c"
    INCLUDE_DIRS "."
    PRIV_REQUIRES esp_wifi nvs_flash esp_netif esp_event
)
