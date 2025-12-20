@echo off
REM ============================================
REM Video Streaming Platform - Install Dependencies Only
REM ============================================

setlocal enabledelayedexpansion

echo ========================================
echo Installing All Dependencies
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Array of services
set services[0]=user-acc-mgmt-serv
set services[1]=storage-mgmt-serv
set services[2]=usage-mntr-serv
set services[3]=model-serv
set services[4]=controller-serv
set services[5]=logging-serv
set services[6]=view-generator-serv

REM Install dependencies for each service
for /L %%i in (0,1,6) do (
    set serviceName=!services[%%i]!
    echo [%%i/7] Installing dependencies for !serviceName!...
    
    if exist "!serviceName!" (
        cd "!serviceName!"
        if exist package.json (
            call npm install
            if !ERRORLEVEL! NEQ 0 (
                echo ERROR: Failed to install dependencies for !serviceName!
                cd ..
                pause
                exit /b 1
            )
        ) else (
            echo WARNING: package.json not found in !serviceName!
        )
        cd ..
    ) else (
        echo WARNING: Directory !serviceName! not found
    )
    echo.
)

REM Install load testing dependencies
if exist "load-testing" (
    echo Installing load testing dependencies...
    cd load-testing
    if exist requirements.txt (
        pip install -r requirements.txt
    )
    cd ..
    echo.
)

echo ========================================
echo All Dependencies Installed
echo ========================================
echo.
pause

endlocal

