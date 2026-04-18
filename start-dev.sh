#!/bin/bash
# PCN/EOL Platform — Development Startup Script
# Usage: bash start-dev.sh [--stop]

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# --- Stop mode ---
if [ "$1" = "--stop" ] || [ "$1" = "stop" ]; then
  echo -e "${YELLOW}Stopping all services...${NC}"
  taskkill //F //IM node.exe 2>/dev/null || true
  echo -e "${GREEN}All Node.js processes stopped.${NC}"
  echo -e "${CYAN}PostgreSQL Docker container still running (use 'docker compose down' to stop).${NC}"
  exit 0
fi

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  PCN/EOL Platform — Dev Startup${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# --- Step 1: Docker PostgreSQL ---
echo -e "${YELLOW}[1/4] Checking Docker & PostgreSQL...${NC}"
if ! docker info > /dev/null 2>&1; then
  echo -e "${RED}Docker is not running! Please start Docker Desktop first.${NC}"
  exit 1
fi

CONTAINER=$(docker ps -q -f name=pcn-eol-platform-postgres)
if [ -z "$CONTAINER" ]; then
  echo -e "${YELLOW}  Starting PostgreSQL container...${NC}"
  docker compose up postgres -d 2>/dev/null || docker-compose up postgres -d 2>/dev/null
  sleep 3
else
  echo -e "${GREEN}  PostgreSQL already running.${NC}"
fi

# Wait for PostgreSQL to be ready
echo -e "${YELLOW}  Waiting for PostgreSQL to be healthy...${NC}"
for i in $(seq 1 15); do
  if docker exec $(docker ps -q -f name=pcn-eol-platform-postgres) pg_isready -U pcndev > /dev/null 2>&1; then
    echo -e "${GREEN}  PostgreSQL is ready.${NC}"
    break
  fi
  sleep 1
  if [ "$i" = "15" ]; then
    echo -e "${RED}  PostgreSQL health check timeout!${NC}"
    exit 1
  fi
done

# --- Step 2: Prisma migrations ---
echo -e "${YELLOW}[2/4] Running Prisma migrations...${NC}"
cd apps/api
npx prisma migrate deploy --skip-generate 2>/dev/null || npx prisma migrate dev --skip-generate 2>/dev/null || true
npx prisma generate 2>/dev/null || true
cd "$SCRIPT_DIR"
echo -e "${GREEN}  Database schema up to date.${NC}"

# --- Step 3: Backend API ---
echo -e "${YELLOW}[3/4] Starting Backend API (port 3000)...${NC}"

# Kill any existing node processes on port 3000
for pid in $(netstat -ano 2>/dev/null | grep ":3000" | grep "LISTENING" | awk '{print $5}' | sort -u); do
  taskkill //F //PID "$pid" 2>/dev/null || true
done

pnpm --filter api dev > /dev/null 2>&1 &
API_PID=$!

# Wait for API to be ready
echo -e "${YELLOW}  Waiting for API to start...${NC}"
for i in $(seq 1 30); do
  if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "${GREEN}  Backend API ready at http://localhost:3000${NC}"
    break
  fi
  sleep 1
  if [ "$i" = "30" ]; then
    echo -e "${RED}  Backend API failed to start!${NC}"
    exit 1
  fi
done

# --- Step 4: Frontend Web ---
echo -e "${YELLOW}[4/4] Starting Frontend Web (port 5173)...${NC}"

# Kill any existing processes on port 5173
for pid in $(netstat -ano 2>/dev/null | grep ":5173" | grep "LISTENING" | awk '{print $5}' | sort -u); do
  taskkill //F //PID "$pid" 2>/dev/null || true
done

pnpm --filter web dev > /dev/null 2>&1 &
WEB_PID=$!

# Wait for frontend
sleep 5
if curl -s http://localhost:5173/ > /dev/null 2>&1; then
  echo -e "${GREEN}  Frontend ready at http://localhost:5173${NC}"
else
  echo -e "${YELLOW}  Frontend starting (may take a few more seconds)...${NC}"
fi

# --- Summary ---
echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${GREEN}  All services started!${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "  ${CYAN}PostgreSQL${NC}  → localhost:5432"
echo -e "  ${CYAN}Backend API${NC} → http://localhost:3000"
echo -e "  ${CYAN}Frontend${NC}    → http://localhost:5173"
echo -e "  ${CYAN}Verification${NC}→ http://localhost:5173/verification"
echo ""
echo -e "${YELLOW}To stop: bash start-dev.sh --stop${NC}"
echo ""

# Keep script running (wait for background processes)
wait
