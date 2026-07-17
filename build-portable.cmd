@echo off
chcp 65001 >nul
title 奥德赛全量绿色版打包
echo ============================================
echo   奥德赛全量绿色版打包工具
echo ============================================
echo.

cd /d "%~dp0"

set BUNDLED_DIR=%CD%\_bundled
set RUNTIME_DIR=%CD%\runtime
set ELECTRON_DIR=%CD%\electron

REM === Step 1: 检查/下载外部依赖 ===

echo [1/4] 检查外部依赖...

REM -- Node.js Portable --
if not exist "%BUNDLED_DIR%\nodejs\node.exe" (
    echo   - 下载 Portable Node.js...
    curl -L -o "%TEMP%\node.zip" "https://nodejs.org/dist/v22.14.0/node-v22.14.0-win-x64.zip"
    echo   - 解压 Node.js...
    powershell -Command "Expand-Archive -Path '%TEMP%\node.zip' -DestinationPath '%TEMP%\node-extract' -Force; Copy-Item '%TEMP%\node-extract\node-v22.14.0-win-x64\*' '%BUNDLED_DIR%\nodejs\' -Recurse"
    echo   - 清理临时文件...
    del "%TEMP%\node.zip"
    rmdir /s /q "%TEMP%\node-extract" 2>nul
    echo   - Node.js 下载完成
) else (
    echo   - Node.js 已存在，跳过
)

REM -- Python Embedded --
if not exist "%BUNDLED_DIR%\python\python.exe" (
    echo   - 下载 Embedded Python...
    curl -L -o "%TEMP%\python.zip" "https://www.python.org/ftp/python/3.12.9/python-3.12.9-embed-amd64.zip"
    echo   - 解压 Python...
    powershell -Command "Expand-Archive -Path '%TEMP%\python.zip' -DestinationPath '%BUNDLED_DIR%\python' -Force"
    echo   - 添加 pip 支持...
    curl -L -o "%BUNDLED_DIR%\python\get-pip.py" "https://bootstrap.pypa.io/get-pip.py"
    "%BUNDLED_DIR%\python\python.exe" "%BUNDLED_DIR%\python\get-pip.py"
    echo   - Python 下载完成
) else (
    echo   - Python 已存在，跳过
)

REM -- Playwright Browsers --
set PLAYWRIGHT_SRC=%USERPROFILE%\AppData\Local\ms-playwright
if not exist "%BUNDLED_DIR%\playwright\chromium-1223" (
    if exist "%PLAYWRIGHT_SRC%\chromium-1223" (
        echo   - 复制 Playwright Chromium...
        xcopy /E /I /Y "%PLAYWRIGHT_SRC%\chromium-1223" "%BUNDLED_DIR%\playwright\chromium-1223"
        xcopy /E /I /Y "%PLAYWRIGHT_SRC%\chromium_headless_shell-1223" "%BUNDLED_DIR%\playwright\chromium_headless_shell-1223"
        xcopy /E /I /Y "%PLAYWRIGHT_SRC%\ffmpeg-1011" "%BUNDLED_DIR%\playwright\ffmpeg-1011"
        xcopy /E /I /Y "%PLAYWRIGHT_SRC%\winldd-1007" "%BUNDLED_DIR%\playwright\winldd-1007"
        echo   - Playwright 浏览器复制完成
    ) else (
        echo   [警告] 本地未找到 Playwright 浏览器，请先运行:
        echo     cd runtime ^&^& npx playwright install chromium
    )
) else (
    echo   - Playwright 浏览器已存在，跳过
)

echo.

REM === Step 2: 编译 TypeScript ===

echo [2/4] 编译 Runtime TypeScript...
cd /d "%RUNTIME_DIR%"
call npx tsc 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [错误] Runtime 编译失败
    exit /b 1
)
echo   - Runtime 编译完成

echo [2/4] 编译 Electron TypeScript...
cd /d "%ELECTRON_DIR%"
call npx tsc 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [错误] Electron 编译失败
    exit /b 1
)
echo   - Electron 编译完成

echo.

REM === Step 3: 构建 React UI ===

echo [3/4] 构建 React UI...
cd /d "%ELECTRON_DIR%"
call npx vite build 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [错误] React UI 构建失败
    exit /b 1
)
echo   - React UI 构建完成

echo.

REM === Step 4: 打包 ===

echo [4/4] 打包 Electron 安装包...
cd /d "%ELECTRON_DIR%"
call npx electron-builder --win --x64 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 打包失败
    exit /b 1
)

echo.
echo ============================================
echo  打包完成！
echo  输出目录: %ELECTRON_DIR%\dist-package\
echo ============================================
pause
