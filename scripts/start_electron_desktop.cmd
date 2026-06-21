@echo off
setlocal
cd /d "%~dp0\.."

echo [start] ensure runtime dirs
if not exist runtime\browser_runtime mkdir runtime\browser_runtime
if not exist runtime\chrome_profile mkdir runtime\chrome_profile
if not exist runtime\cookies mkdir runtime\cookies
if not exist runtime\pids mkdir runtime\pids
if not exist runtime\logs mkdir runtime\logs
if not exist runtime\recordings mkdir runtime\recordings
if not exist runtime\workflows mkdir runtime\workflows
if not exist runtime\claude-session mkdir runtime\claude-session
if not exist runtime\claude-config mkdir runtime\claude-config

echo [start] runtime health
call npm --prefix runtime run dev
if errorlevel 1 exit /b %errorlevel%

echo [start] launching renderer + electron
call npm --prefix electron run desktop
