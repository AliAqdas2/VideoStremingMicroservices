#!/bin/bash
# ============================================
# Video Streaming Platform - Service Launcher (macOS/Linux)
# ============================================
# This script installs dependencies and starts all microservices

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Video Streaming Platform - Starting Services${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}ERROR: Node.js is not installed or not in PATH${NC}"
    echo -e "${YELLOW}Please install Node.js from https://nodejs.org/${NC}"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version)
echo -e "${GREEN}Node.js version: $NODE_VERSION${NC}"
echo ""

# Check if MongoDB is running (optional check)
echo -e "${YELLOW}Checking MongoDB connection...${NC}"
if lsof -Pi :27017 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${GREEN}MongoDB appears to be running on port 27017${NC}"
else
    echo -e "${YELLOW}WARNING: MongoDB might not be running on port 27017${NC}"
    echo -e "${YELLOW}Make sure MongoDB is started before running services${NC}"
fi
echo ""

# Array of services (port:service-name)
declare -a services=(
    "3001:user-acc-mgmt-serv"
    "3002:storage-mgmt-serv"
    "3003:usage-mntr-serv"
    "3004:model-serv"
    "3005:controller-serv"
    "3006:logging-serv"
    "3000:view-generator-serv"
)

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Installing Dependencies${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Install dependencies for each service
for i in "${!services[@]}"; do
    IFS=':' read -r port service_name <<< "${services[$i]}"
    echo -e "${YELLOW}[$((i+1))/${#services[@]}] Installing dependencies for $service_name...${NC}"
    
    if [ -d "$service_name" ]; then
        cd "$service_name"
        if [ -f "package.json" ]; then
            npm install
            if [ $? -ne 0 ]; then
                echo -e "${RED}ERROR: Failed to install dependencies for $service_name${NC}"
                exit 1
            fi
        else
            echo -e "${YELLOW}WARNING: package.json not found in $service_name${NC}"
        fi
        cd "$SCRIPT_DIR"
    else
        echo -e "${YELLOW}WARNING: Directory $service_name not found${NC}"
    fi
    echo ""
done

# Install load testing dependencies (optional)
if [ -d "load-testing" ]; then
    echo -e "${YELLOW}Installing Python dependencies for load testing...${NC}"
    cd load-testing
    if [ -f "requirements.txt" ]; then
        pip3 install -r requirements.txt 2>/dev/null || pip install -r requirements.txt
    fi
    cd "$SCRIPT_DIR"
    echo ""
fi

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Starting Services${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "${YELLOW}Each service will start in a new terminal window${NC}"
echo -e "${YELLOW}Close individual windows to stop specific services${NC}"
echo -e "${YELLOW}Press Ctrl+C in this window to stop all services${NC}"
echo ""
sleep 2

# Function to start service in new terminal
start_service() {
    local service_name=$1
    local port=$2
    local service_path="$SCRIPT_DIR/$service_name"
    
    if [ -d "$service_path" ]; then
        echo -e "${GREEN}Starting $service_name on port $port...${NC}"
        
        # Detect OS and use appropriate terminal command
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            osascript -e "tell application \"Terminal\" to do script \"cd '$service_path' && npm start\""
        elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
            # Linux (tested on Ubuntu/Debian)
            if command -v gnome-terminal &> /dev/null; then
                gnome-terminal -- bash -c "cd '$service_path' && npm start; exec bash"
            elif command -v xterm &> /dev/null; then
                xterm -e "cd '$service_path' && npm start" &
            else
                # Fallback: run in background
                cd "$service_path"
                npm start > "/tmp/$service_name.log" 2>&1 &
                cd "$SCRIPT_DIR"
                echo -e "${YELLOW}  Running in background. Logs: /tmp/$service_name.log${NC}"
            fi
        else
            # Fallback: run in background
            cd "$service_path"
            npm start > "/tmp/$service_name.log" 2>&1 &
            cd "$SCRIPT_DIR"
            echo -e "${YELLOW}  Running in background. Logs: /tmp/$service_name.log${NC}"
        fi
        
        sleep 1
    else
        echo -e "${RED}ERROR: Directory $service_name not found${NC}"
    fi
}

# Start each service
for service in "${services[@]}"; do
    IFS=':' read -r port service_name <<< "$service"
    start_service "$service_name" "$port"
done

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}All Services Started${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "${GREEN}Services running:${NC}"
echo "  - User Account Management: http://localhost:3001"
echo "  - Storage Management: http://localhost:3002"
echo "  - Usage Monitoring: http://localhost:3003"
echo "  - Model Service: http://localhost:3004"
echo "  - Controller Service: http://localhost:3005"
echo "  - Logging Service: http://localhost:3006"
echo "  - View Generator (Frontend): http://localhost:3000"
echo ""
echo -e "${CYAN}Frontend Application: http://localhost:3000${NC}"
echo -e "${CYAN}API Gateway: http://localhost:3005${NC}"
echo ""
echo -e "${YELLOW}To stop services, close their individual terminal windows${NC}"
echo -e "${YELLOW}Or run: ./stop-services.sh${NC}"
echo ""
echo "Press Ctrl+C to exit this script (services will continue running)"
echo ""

# Keep script running (optional)
read -p "Press Enter to exit (services will continue running)..."
