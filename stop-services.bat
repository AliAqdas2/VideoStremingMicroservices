@echo off
REM ============================================
REM Video Streaming Platform - Stop All Services
REM ============================================

echo ========================================
echo Stopping All Services
echo ========================================
echo.

echo Stopping Node.js processes on service ports...
echo.

REM Stop processes on each port
for /L %%i in (3000,1,3006) do (
    echo Checking port %%i...
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%%i" ^| findstr "LISTENING"') do (
        echo   Killing process %%a on port %%i...
        taskkill /F /PID %%a >nul 2>&1
    )
)

echo.
echo Checking for remaining Node.js processes...
taskkill /F /IM node.exe >nul 2>&1

echo.
echo All services stopped
echo.
pause

