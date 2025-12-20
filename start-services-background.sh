#!/bin/bash
# ============================================
# Video Streaming Platform - Start Services in Background (macOS/Linux)
# ============================================
# Alternative version that runs services in background instead of new terminals

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Video Streaming Platform - Starting Services (Background)${NC}"
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

# Create logs directory
mkdir -p logs

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

echo -e "${CYAN}Starting services in background...${NC}"
echo -e "${YELLOW}Logs will be written to ./logs/${service_name}.log${NC}"
echo -e "${YELLOW}To view logs: tail -f logs/${service_name}.log${NC}"
echo ""

# Start each service in background
PIDS=()
for service in "${services[@]}"; do
    IFS=':' read -r port service_name <<< "$service"
    service_path="$SCRIPT_DIR/$service_name"
    
    if [ -d "$service_path" ]; then
        echo -e "${GREEN}Starting $service_name on port $port...${NC}"
        cd "$service_path"
        npm start > "$SCRIPT_DIR/logs/$service_name.log" 2>&1 &
        PIDS+=($!)
        cd "$SCRIPT_DIR"
        sleep 1
    fi
done

# Save PIDs to file for easy stopping
echo "${PIDS[@]}" > .service_pids

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${GREEN}All Services Started${NC}"
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
echo -e "${YELLOW}Service PIDs saved to .service_pids${NC}"
echo -e "${YELLOW}To stop services, run: ./stop-services.sh${NC}"
echo -e "${YELLOW}To view logs: tail -f logs/{service_name}.log${NC}"
echo ""

# Wait a moment and check if services are still running
sleep 3
for pid in "${PIDS[@]}"; do
    if ! ps -p "$pid" > /dev/null 2>&1; then
        echo -e "${RED}WARNING: Service with PID $pid may have crashed${NC}"
        echo -e "${YELLOW}Check logs for details${NC}"
    fi
done

echo ""
echo "Services are running in background. Press Ctrl+C to exit this script."
echo "(Services will continue running. Use ./stop-services.sh to stop them)"

# Keep script running until interrupted
trap "echo ''; echo 'Script exited. Services are still running.'; exit 0" INT
while true; do
    sleep 60
done

