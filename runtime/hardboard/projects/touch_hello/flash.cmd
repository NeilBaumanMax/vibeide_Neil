@echo off
set MSYSTEM=
set TERM=
set IDF_PATH=E:\Agent\vibeide\vibeide\runtime\hardboard\esptools\esp-idf-v5.4.3\esp-idf
set IDF_TOOLS_PATH=E:\Agent\vibeide\vibeide\runtime\hardboard\esptools\idf-tools
set IDF_PYTHON_ENV_PATH=E:\Agent\vibeide\vibeide\runtime\hardboard\esptools\idf-tools\python_env\idf5.4_py3.12_env
set IDF_PYTHON_CHECK_CONSTRAINTS=no
set ESP_IDF_VERSION=5.4.3
set PYTHONPATH=E:\Agent\vibeide\vibeide\runtime\hardboard\esptools\esp-idf-v5.4.3\esp-idf\tools;E:\Agent\vibeide\vibeide\runtime\hardboard\esptools\esp-idf-v5.4.3\esp-idf\components\partition_table
set PATH=E:\Agent\vibeide\vibeide\runtime\hardboard\esptools\idf-tools\python_env\idf5.4_py3.12_env\Scripts;E:\Agent\vibeide\vibeide\runtime\hardboard\esptools\idf-tools\tools\xtensa-esp-elf\esp-14.2.0_20250730\xtensa-esp-elf\bin;E:\Agent\vibeide\vibeide\runtime\hardboard\esptools\esp-idf-v5.4.3\esp-idf\tools;E:\Agent\vibeide\vibeide\runtime\hardboard\esptools\idf-tools\tools\cmake\3.30.2\bin;E:\Agent\vibeide\vibeide\runtime\hardboard\esptools\idf-tools\tools\ninja\1.12.1;%PATH%
cd /d E:\Agent\vibeide\vibeide\runtime\hardboard\projects\touch_hello
E:\Agent\vibeide\vibeide\runtime\hardboard\esptools\idf-tools\python_env\idf5.4_py3.12_env\Scripts\python.exe E:\Agent\vibeide\vibeide\runtime\hardboard\esptools\esp-idf-v5.4.3\esp-idf\tools\idf.py -p COM5 flash
