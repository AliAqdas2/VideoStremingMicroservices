#!/bin/bash
# ============================================
# Video Streaming Platform - Stop All Services (macOS/Linux)
# ============================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Stopping All Services${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Array of ports
ports=(3000 3001 3002 3003 3004 3005 3006)

echo -e "${YELLOW}Stopping Node.js processes on service ports...${NC}"
echo ""

# Stop processes on each port
for port in "${ports[@]}"; do
    echo -e "Checking port $port..."
    
    # Find process ID using lsof (works on macOS and Linux)
    pid=$(lsof -ti:$port 2>/dev/null)
    
    if [ -n "$pid" ]; then
        echo -e "  ${GREEN}Found process $pid on port $port, stopping...${NC}"
        kill -9 "$pid" 2>/dev/null || true
        sleep 1
    else
        echo -e "  No process found on port $port"
    fi
done

echo ""
echo -e "${YELLOW}Checking for remaining Node.js processes...${NC}"

# Optional: Kill all node processes (use with caution)
# Uncomment the following lines if you want to kill ALL node processes
# pkill -9 node 2>/dev/null || true

echo ""
echo -e "${GREEN}All services stopped${NC}"
echo ""

