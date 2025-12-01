# Bielik MVP - Makefile

include .env
export

.PHONY: help up start stop down restart rebuild logs api-logs frontend-logs ps build clean \
	package package-upload publish publish-test test pull-model docs-api docs-api-watch

help:
	@echo "Dostępne komendy:"
	@echo "  make start        - uruchom wszystko (Ollama lokalna + Docker + model)"
	@echo "  make up           - tylko docker compose up -d (szybki start)"
	@echo "  make down         - zatrzymaj kontenery"
	@echo "  make stop         - alias do down"
	@echo "  make restart      - szybki restart (down + build frontendu + up --build)"
	@echo "  make rebuild      - twardy restart: usuń obrazy usług i zbuduj od zera"
	@echo "  make logs         - logi wszystkich serwisów"
	@echo "  make api-logs     - logi backendu API"
	@echo "  make frontend-logs- logi frontendu"
	@echo "  make build        - zbuduj obrazy docker"
	@echo "  make ps           - status kontenerów"
	@echo "  make pull-model   - pobierz model z .env (OLLAMA_MODEL)"
	@echo "  make clean        - usuń dane (PostgreSQL), modele Ollama zostają"
	@echo "  make docs-api     - wygeneruj OpenAPI JSON do katalogu docs/"
	@echo "  make docs-api-watch - generuj OpenAPI przy zmianach w modules/api"
	@echo "  make package      - zbuduj paczkę Pythona dla API (sdist+wheel)"
	@echo "  make package-upload - wyślij paczkę na PyPI/TestPyPI (wymaga twine)"
	@echo "  make publish      - zbuduj i wyślij paczkę na PyPI (wymaga twine)"
	@echo "  make publish-test - zbuduj i wyślij paczkę na TestPyPI (wymaga twine)"

up:
	docker compose up -d

start:
	./scripts/start.sh

down:
	docker compose down

stop: down

restart:
	docker compose down
	cd modules/frontend && npm run build:dev
	docker compose up --build

# Twardy restart: usuń stare obrazy usług i zbuduj od zera
rebuild:
	docker compose down --rmi local --remove-orphans
	docker compose up -d --build

logs:
	docker compose logs -f

api-logs:
	docker compose logs -f api

frontend-logs:
	docker compose logs -f frontend

ps:
	docker compose ps

build:
	docker compose build

clean:
	docker compose down -v || true
	rm -rf dist/ build/ *.egg-info modules/api/dist/ modules/api/build/ modules/api/*.egg-info

# Pobierz model (używa OLLAMA_MODEL z .env)
pull-model:
	ollama pull $(OLLAMA_MODEL)

# --- Python package (modules/api jako paczka) ---

package:
	cd modules/api && python -m build

package-upload:
	cd modules/api && twine upload dist/*

publish: package
	cd modules/api && twine upload dist/*

publish-test: package
	cd modules/api && twine upload --repository testpypi dist/*

docs-api:
	python scripts/generate_api_docs.py

docs-api-watch:
	python scripts/generate_api_docs.py --watch

