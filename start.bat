@echo off
setlocal EnableDelayedExpansion

REM 查找可用的 python 命令
set "PYTHON_CMD="
where python >nul 2>&1 && set "PYTHON_CMD=python"
if not defined PYTHON_CMD (
    where py >nul 2>&1 && set "PYTHON_CMD=py"
)
if not defined PYTHON_CMD (
    echo 未检测到 Python，请先安装 Python 3。
    pause
    exit /b 1
)

REM 兼容脚本放在 dist 内或 dist 同级目录的情况
set "SCRIPT_DIR=%~dp0"
if exist "%SCRIPT_DIR%index.html" (
    cd /d "%SCRIPT_DIR%"
) else (
    cd /d "%SCRIPT_DIR%dist"
)

REM 找一个空闲端口
set PORT=8080
:CHECK_PORT
netstat -an | find ":%PORT%" | find "LISTENING" >nul
if %ERRORLEVEL% EQU 0 (
    set /a PORT+=1
    goto CHECK_PORT
)

echo 正在启动预览服务器 (端口 %PORT%)...
start /b %PYTHON_CMD% -m http.server %PORT% >nul 2>&1

REM 获取刚启动的 Python 进程 PID
set "PID="
for /f "tokens=2 delims=," %%a in ('tasklist /fi "imagename eq python.exe" /fo csv /nh') do set "PID=%%~a"
if not defined PID (
    for /f "tokens=2 delims=," %%a in ('tasklist /fi "imagename eq py.exe" /fo csv /nh') do set "PID=%%~a"
)

timeout /t 1 /nobreak >nul
start http://localhost:%PORT%
echo.
echo 浏览器已打开。关闭此窗口即可停止服务器。
pause >nul

REM 停止服务器
taskkill /PID %PID% /F >nul 2>&1
