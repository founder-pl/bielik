#!/bin/bash
# Bielik MVP - Start Script
# Uruchamia cały stack Docker

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════╗"
echo "║     🦅 BIELIK MVP - Uruchamianie        ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker nie jest zainstalowany!${NC}"
    echo "Zainstaluj Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo -e "${RED}❌ Docker daemon nie działa!${NC}"
    echo "Uruchom Docker Desktop lub: sudo systemctl start docker"
    exit 1
fi

echo -e "${GREEN}✓ Docker działa${NC}"

# Check docker compose
if ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ Docker Compose v2 nie jest dostępny!${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Docker Compose v2 dostępny${NC}"

# Check memory
TOTAL_MEM=$(free -g 2>/dev/null | awk '/^Mem:/{print $2}' || echo "16")
if [ "$TOTAL_MEM" -lt 8 ]; then
    echo -e "${YELLOW}⚠️  Mniej niż 8GB RAM - może być wolno${NC}"
fi

# Build and start
echo ""
echo -e "${BLUE}📦 Buduję obrazy Docker...${NC}"
docker compose build --quiet

echo ""
echo -e "${BLUE}🚀 Uruchamiam serwisy...${NC}"
docker compose up -d

echo ""
echo -e "${BLUE}⏳ Czekam na start serwisów...${NC}"
sleep 10

# Check services
echo ""
echo -e "${BLUE}🔍 Sprawdzam status...${NC}"

# PostgreSQL
if docker compose exec -T postgres pg_isready -U bielik &>/dev/null; then
    echo -e "${GREEN}✓ PostgreSQL działa${NC}"
else
    echo -e "${RED}✗ PostgreSQL nie odpowiada${NC}"
fi

# Ollama
if curl -s http://localhost:11434/ &>/dev/null; then
    echo -e "${GREEN}✓ Ollama działa${NC}"
else
    echo -e "${YELLOW}⚠ Ollama uruchamia się...${NC}"
fi

# API
if curl -s http://localhost:8000/ &>/dev/null; then
    echo -e "${GREEN}✓ API działa${NC}"
else
    echo -e "${YELLOW}⚠ API uruchamia się...${NC}"
fi

# Frontend
if curl -s http://localhost:3000/ &>/dev/null; then
    echo -e "${GREEN}✓ Frontend działa${NC}"
else
    echo -e "${YELLOW}⚠ Frontend uruchamia się...${NC}"
fi

# Check model
echo ""
echo -e "${BLUE}🤖 Sprawdzam model Bielik...${NC}"
sleep 5

MODELS=$(curl -s http://localhost:11434/api/tags 2>/dev/null | grep -o '"name":"[^"]*bielik[^"]*"' || echo "")

if [ -n "$MODELS" ]; then
    echo -e "${GREEN}✓ Model Bielik załadowany${NC}"
else
    echo -e "${YELLOW}⏳ Pobieram model Bielik (może potrwać kilka minut)...${NC}"
    docker exec bielik-ollama ollama pull mwiewior/bielik &
    echo -e "${YELLOW}   Pobieranie w tle. Sprawdź: docker logs -f bielik-ollama${NC}"
fi

# Summary
echo ""
echo -e "${GREEN}"
echo "╔══════════════════════════════════════════╗"
echo "║           ✅ GOTOWE!                     ║"
echo "╠══════════════════════════════════════════╣"
echo "║                                          ║"
echo "║  🌐 Frontend: http://localhost:3000      ║"
echo "║  📡 API:      http://localhost:8000/docs ║"
echo "║  🤖 Ollama:   http://localhost:11434     ║"
echo "║  🗄️  PostgreSQL: localhost:5432          ║"
echo "║                                          ║"
echo "╠══════════════════════════════════════════╣"
echo "║  Przydatne komendy:                      ║"
echo "║  • docker compose logs -f               ║"
echo "║  • docker compose ps                    ║"
echo "║  • docker compose down                  ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"

# Open browser (optional)
if command -v xdg-open &> /dev/null; then
    read -p "Otworzyć przeglądarkę? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        xdg-open http://localhost:3000
    fi
elif command -v open &> /dev/null; then
    read -p "Otworzyć przeglądarkę? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        open http://localhost:3000
    fi
fi
