@echo off
REM ============================================
REM Video Streaming Platform - Service Launcher
REM ============================================
REM This script installs dependencies and starts all microservices

setlocal enabledelayedexpansion

echo ========================================
echo Video Streaming Platform - Starting Services
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

REM Check Node.js version
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo Node.js version: %NODE_VERSION%
echo.

REM Check if MongoDB is running (optional check)
echo Checking MongoDB connection...
netstat -an | findstr ":27017" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: MongoDB might not be running on port 27017
    echo Make sure MongoDB is started before running services
    echo.
) else (
    echo MongoDB appears to be running on port 27017
    echo.
)

REM Array of services (port:service-name)
set services[0]=3001:user-acc-mgmt-serv
set services[1]=3002:storage-mgmt-serv
set services[2]=3003:usage-mntr-serv
set services[3]=3004:model-serv
set services[4]=3005:controller-serv
set services[5]=3006:logging-serv
set services[6]=3000:view-generator-serv

echo ========================================
echo Installing Dependencies
echo ========================================
echo.

REM Install dependencies for each service
for /L %%i in (0,1,6) do (
    call :parseService !services[%%i]! port serviceName
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

echo ========================================
echo Installing Load Testing Dependencies (Optional)
echo ========================================
if exist "load-testing" (
    cd load-testing
    if exist requirements.txt (
        echo Installing Python dependencies for load testing...
        pip install -r requirements.txt
    )
    cd ..
)
echo.

echo ========================================
echo Starting Services
echo ========================================
echo.
echo Each service will start in a new window
echo Close individual windows to stop specific services
echo Press Ctrl+C in this window to stop all services
echo.
timeout /t 3 /nobreak >nul

REM Start each service in a new window
for /L %%i in (0,1,6) do (
    call :parseService !services[%%i]! port serviceName
    echo Starting !serviceName! on port !port!...
    
    if exist "!serviceName!" (
        start "!serviceName! - Port !port!" cmd /k "cd /d %~dp0!serviceName! && npm start"
        timeout /t 2 /nobreak >nul
    ) else (
        echo ERROR: Directory !serviceName! not found
    )
)

echo.
echo ========================================
echo All Services Started
echo ========================================
echo.
echo Services running:
echo   - User Account Management: http://localhost:3001
echo   - Storage Management: http://localhost:3002
echo   - Usage Monitoring: http://localhost:3003
echo   - Model Service: http://localhost:3004
echo   - Controller Service: http://localhost:3005
echo   - Logging Service: http://localhost:3006
echo   - View Generator (Frontend): http://localhost:3000
echo.
echo Frontend Application: http://localhost:3000
echo API Gateway: http://localhost:3005
echo.
echo To stop services, close their individual windows
echo.
pause

endlocal
exit /b 0

REM Function to parse service:port format
:parseService
set "input=%~1"
for /f "tokens=1,2 delims=:" %%a in ("!input!") do (
    set "%~2=%%a"
    set "%~3=%%b"
)
exit /b

