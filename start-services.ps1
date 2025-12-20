# ============================================
# Video Streaming Platform - Service Launcher (PowerShell)
# ============================================
# This script installs dependencies and starts all microservices

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Video Streaming Platform - Starting Services" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is installed
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Node.js is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Check Node.js version
$nodeVersion = node --version
Write-Host "Node.js version: $nodeVersion" -ForegroundColor Green
Write-Host ""

# Check MongoDB connection (optional)
Write-Host "Checking MongoDB connection..." -ForegroundColor Yellow
$mongoPort = Get-NetTCPConnection -LocalPort 27017 -ErrorAction SilentlyContinue
if (-not $mongoPort) {
    Write-Host "WARNING: MongoDB might not be running on port 27017" -ForegroundColor Yellow
    Write-Host "Make sure MongoDB is started before running services" -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Host "MongoDB appears to be running on port 27017" -ForegroundColor Green
    Write-Host ""
}

# Define services array
$services = @(
    @{Port=3001; Name="user-acc-mgmt-serv"},
    @{Port=3002; Name="storage-mgmt-serv"},
    @{Port=3003; Name="usage-mntr-serv"},
    @{Port=3004; Name="model-serv"},
    @{Port=3005; Name="controller-serv"},
    @{Port=3006; Name="logging-serv"},
    @{Port=3000; Name="view-generator-serv"}
)

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Installing Dependencies" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Install dependencies for each service
$index = 1
foreach ($service in $services) {
    $servicePath = Join-Path $scriptPath $service.Name
    Write-Host "[$index/$($services.Count)] Installing dependencies for $($service.Name)..." -ForegroundColor Yellow
    
    if (Test-Path $servicePath) {
        $packageJson = Join-Path $servicePath "package.json"
        if (Test-Path $packageJson) {
            Set-Location $servicePath
            npm install
            if ($LASTEXITCODE -ne 0) {
                Write-Host "ERROR: Failed to install dependencies for $($service.Name)" -ForegroundColor Red
                Set-Location $scriptPath
                Read-Host "Press Enter to exit"
                exit 1
            }
            Set-Location $scriptPath
        } else {
            Write-Host "WARNING: package.json not found in $($service.Name)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "WARNING: Directory $($service.Name) not found" -ForegroundColor Yellow
    }
    $index++
    Write-Host ""
}

# Install load testing dependencies (optional)
$loadTestingPath = Join-Path $scriptPath "load-testing"
if (Test-Path $loadTestingPath) {
    $requirementsTxt = Join-Path $loadTestingPath "requirements.txt"
    if (Test-Path $requirementsTxt) {
        Write-Host "Installing Python dependencies for load testing..." -ForegroundColor Yellow
        Set-Location $loadTestingPath
        pip install -r requirements.txt
        Set-Location $scriptPath
        Write-Host ""
    }
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Starting Services" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Each service will start in a new window" -ForegroundColor Yellow
Write-Host "Close individual windows to stop specific services" -ForegroundColor Yellow
Write-Host ""

Start-Sleep -Seconds 2

# Start each service in a new window
foreach ($service in $services) {
    $servicePath = Join-Path $scriptPath $service.Name
    if (Test-Path $servicePath) {
        Write-Host "Starting $($service.Name) on port $($service.Port)..." -ForegroundColor Green
        $startCommand = "cd `"$servicePath`"; npm start"
        Start-Process powershell -ArgumentList "-NoExit", "-Command", $startCommand
        Start-Sleep -Seconds 2
    } else {
        Write-Host "ERROR: Directory $($service.Name) not found" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "All Services Started" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Services running:" -ForegroundColor Green
Write-Host "  - User Account Management: http://localhost:3001"
Write-Host "  - Storage Management: http://localhost:3002"
Write-Host "  - Usage Monitoring: http://localhost:3003"
Write-Host "  - Model Service: http://localhost:3004"
Write-Host "  - Controller Service: http://localhost:3005"
Write-Host "  - Logging Service: http://localhost:3006"
Write-Host "  - View Generator (Frontend): http://localhost:3000"
Write-Host ""
Write-Host "Frontend Application: http://localhost:3000" -ForegroundColor Cyan
Write-Host "API Gateway: http://localhost:3005" -ForegroundColor Cyan
Write-Host ""
Write-Host "To stop services, close their individual windows" -ForegroundColor Yellow
Write-Host ""
Read-Host "Press Enter to exit"

