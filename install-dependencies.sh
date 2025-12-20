#!/bin/bash
# ============================================
# Video Streaming Platform - Install Dependencies Only (macOS/Linux)
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Installing All Dependencies${NC}"
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

# Array of services
declare -a services=(
    "user-acc-mgmt-serv"
    "storage-mgmt-serv"
    "usage-mntr-serv"
    "model-serv"
    "controller-serv"
    "logging-serv"
    "view-generator-serv"
)

# Install dependencies for each service
for i in "${!services[@]}"; do
    service_name="${services[$i]}"
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

# Install load testing dependencies
if [ -d "load-testing" ]; then
    echo -e "${YELLOW}Installing load testing dependencies...${NC}"
    cd load-testing
    if [ -f "requirements.txt" ]; then
        pip3 install -r requirements.txt 2>/dev/null || pip install -r requirements.txt
    fi
    cd "$SCRIPT_DIR"
    echo ""
fi

echo -e "${CYAN}========================================${NC}"
echo -e "${GREEN}All Dependencies Installed${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

