# Service Management Scripts

This directory contains scripts to help manage the microservices application on macOS/Linux (and Windows).

## Available Scripts (macOS/Linux)

### 1. `start-services.sh` (Recommended)
**Purpose**: Install dependencies and start all services

**What it does**:
- Checks for Node.js installation
- Checks MongoDB connection
- Installs npm packages for all services
- Installs pip packages for load testing (optional)
- Starts each service in a new Terminal window (macOS) or new terminal (Linux)
- Shows service URLs and status

**Usage**:
```bash
./start-services.sh
```

**Features**:
- Automatically installs all dependencies
- Starts services in separate terminal windows (easy to see logs)
- Shows all service URLs
- Error checking and validation
- Color-coded output

---

### 2. `start-services-background.sh`
**Purpose**: Start all services in background (no new windows)

**What it does**:
- Same as `start-services.sh` but runs services in background
- Logs are written to `./logs/{service_name}.log`
- Saves process IDs to `.service_pids` file

**Usage**:
```bash
./start-services-background.sh
```

**View logs**:
```bash
tail -f logs/user-acc-mgmt-serv.log
tail -f logs/controller-serv.log
# etc.
```

---

### 3. `stop-services.sh`
**Purpose**: Stop all running services

**What it does**:
- Finds and kills all Node.js processes on service ports (3000-3006)
- Uses `lsof` to find processes by port

**Usage**:
```bash
./stop-services.sh
```

**Use cases**:
- Clean shutdown of all services
- Free up ports if services are stuck
- Reset before restarting

---

### 4. `install-dependencies.sh`
**Purpose**: Install dependencies only (don't start services)

**What it does**:
- Installs npm packages for all Node.js services
- Installs pip packages for load testing

**Usage**:
```bash
./install-dependencies.sh
```

---

## Windows Scripts

### 1. `start-services.bat` (Windows)
**Purpose**: Install dependencies and start all services on Windows

**Usage**:
```batch
start-services.bat
```

### 2. `start-services.ps1` (PowerShell)
**Purpose**: Same as `.bat` but for PowerShell users

**Usage**:
```powershell
.\start-services.ps1
```

**Note**: You may need to enable script execution:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### 3. `stop-services.bat`
**Purpose**: Stop all running services on Windows

**Usage**:
```batch
stop-services.bat
```

### 4. `install-dependencies.bat`
**Purpose**: Install dependencies only on Windows

**Usage**:
```batch
install-dependencies.bat
```

**Use cases**:
- First-time setup
- After pulling new code with updated dependencies
- When dependencies need to be reinstalled

---

## Quick Start Guide

### First Time Setup (macOS/Linux)

1. **Prerequisites**:
   - Install Node.js (v18+) from https://nodejs.org/
   - Install MongoDB and start it:
     ```bash
     brew services start mongodb-community  # macOS with Homebrew
     # or
     sudo systemctl start mongod            # Linux
     ```
   - Install Python (optional, for load testing)

2. **Make scripts executable**:
   ```bash
   chmod +x *.sh
   ```

3. **Configure Environment Variables**:
   - Copy `env.example` to `.env` in the project root
   - Or add `.env` files in each service directory
   - Update with your configuration (especially GCS settings)

4. **Install and Start**:
   ```bash
   ./start-services.sh
   ```

### Daily Usage (macOS/Linux)

**Start all services**:
```bash
./start-services.sh
```

**Start in background**:
```bash
./start-services-background.sh
```

**Stop all services**:
```bash
./stop-services.sh
```

**Reinstall dependencies**:
```bash
./install-dependencies.sh
```

### Windows Usage

**Start all services**:
```batch
start-services.bat
```

**Stop all services**:
```batch
stop-services.bat
```

**Reinstall dependencies**:
```batch
install-dependencies.bat
```

---

## Service Ports

The following ports are used by the services:

| Service | Port | URL |
|---------|------|-----|
| View Generator (Frontend) | 3000 | http://localhost:3000 |
| User Account Management | 3001 | http://localhost:3001 |
| Storage Management | 3002 | http://localhost:3002 |
| Usage Monitoring | 3003 | http://localhost:3003 |
| Model Service | 3004 | http://localhost:3004 |
| Controller Service | 3005 | http://localhost:3005 |
| Logging Service | 3006 | http://localhost:3006 |

**Access the application**: http://localhost:3000

---

## Troubleshooting

### "Node.js is not installed"
- Install Node.js from https://nodejs.org/
- Make sure Node.js is added to PATH
- Restart command prompt after installation

### "MongoDB might not be running"
- Start MongoDB service:
  ```batch
  net start MongoDB
  ```
- Or start MongoDB manually from installation directory

### "Port already in use" (macOS/Linux)
- Stop services first: `./stop-services.sh`
- Or manually kill process using the port:
  ```bash
  lsof -ti:3000 | xargs kill -9
  ```

### "Port already in use" (Windows)
- Stop services first: `stop-services.bat`
- Or manually kill processes using the port:
  ```batch
  netstat -ano | findstr :3000
  taskkill /PID <PID> /F
  ```

### Services not starting
- Check `.env` files exist in each service directory
- Verify MongoDB is running:
  ```bash
  # macOS/Linux
  lsof -i :27017
  
  # Windows
  netstat -ano | findstr :27017
  ```
- Check individual service windows/terminals for error messages
- Ensure all dependencies are installed: `./install-dependencies.sh` (macOS/Linux) or `install-dependencies.bat` (Windows)
- Check service logs if using background mode: `tail -f logs/{service_name}.log`

### Permission errors (macOS/Linux)
- Make scripts executable: `chmod +x *.sh`
- Check file permissions
- May need to run with `sudo` for some operations (not recommended)

### Permission errors (Windows)
- Run as Administrator if needed
- Check file permissions
- Ensure antivirus isn't blocking Node.js

---

## Manual Service Management

If you prefer to manage services manually:

### Start Individual Service (macOS/Linux/Windows)
```bash
cd user-acc-mgmt-serv
npm install
npm start
```

### Install Dependencies for One Service
```bash
cd user-acc-mgmt-serv
npm install
```

### View Service Logs (Background Mode)
```bash
tail -f logs/user-acc-mgmt-serv.log
tail -f logs/controller-serv.log
```

### Check Service Health
```batch
curl http://localhost:3001/health
curl http://localhost:3002/health
# ... etc
```

---

## Alternative: Using Docker Compose

Instead of running services individually, you can use Docker Compose:

```batch
docker-compose up
```

See `README.md` for Docker Compose setup instructions.

---

## Notes

- Services start in separate windows so you can see logs for each
- Close individual windows to stop specific services
- All services must be running for the application to work properly
- MongoDB must be running before starting services
- Ensure `.env` files are configured correctly

