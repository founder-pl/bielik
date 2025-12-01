#!/bin/bash
# Bielik MVP - Stop Script

echo "🛑 Zatrzymuję Bielik MVP..."

docker compose down

echo "✅ Zatrzymano wszystkie serwisy"
echo ""
echo "Dane są zachowane w volumes."
echo "Aby usunąć dane: docker compose down -v"
