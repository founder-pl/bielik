# Detax.pl - AI Asystent - Makefile

include .env
export

# Domyślne wartości
DETAX_DOMAIN ?= localhost
API_PORT ?= 8005
BACKEND_PORT ?= 8005
FRONTEND_PORT ?= 3005
DEMO_USER_EMAIL ?= demo@detax.pl
DEMO_USER_PASSWORD ?= demo123

.PHONY: help up start stop down restart rebuild logs api-logs frontend-logs ps build clean \
	package package-upload publish publish-test test pull-model docs-api docs-api-watch \
	cli cli-health cli-chat cli-docs cli-projects cli-sources cli-test frontend-build

help:
	@echo "═══════════════════════════════════════════════════════════════"
	@echo "  Detax.pl - AI Asystent dla przedsiębiorców"
	@echo "═══════════════════════════════════════════════════════════════"
	@echo ""
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
	@echo ""
	@echo "CLI (Shell DSL):"
	@echo "  make cli          - tryb interaktywny CLI"
	@echo "  make cli-health   - sprawdź stan systemu"
	@echo "  make cli-docs     - lista dokumentów"
	@echo "  make cli-projects - lista projektów"
	@echo "  make cli-sources  - lista źródeł danych"
	@echo "  make cli-test     - uruchom testy E2E"
	@echo "  make frontend-build - zbuduj TypeScript frontend"
	@echo ""
	@echo "Dostęp:"
	@echo "  Frontend:  http://$(DETAX_DOMAIN):$(FRONTEND_PORT)"
	@echo "  API:       http://$(DETAX_DOMAIN):$(API_PORT)"
	@echo "  API Docs:  http://$(DETAX_DOMAIN):$(API_PORT)/docs"
	@echo ""
	@echo "Demo konto:"
	@echo "  Email:    $(DEMO_USER_EMAIL)"
	@echo "  Hasło:    $(DEMO_USER_PASSWORD)"

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

# --- CLI (Shell DSL for CQRS API) ---

cli:
	@./scripts/bielik-cli.sh interactive

cli-health:
	@./scripts/bielik-cli.sh health

cli-status:
	@./scripts/bielik-cli.sh status

cli-docs:
	@./scripts/bielik-cli.sh doc:list

cli-projects:
	@./scripts/bielik-cli.sh project:list

cli-sources:
	@./scripts/bielik-cli.sh sources:list

cli-legal:
	@./scripts/bielik-cli.sh sources:legal

cli-test:
	@python3 tests/e2e/test_documents_flow.py

# --- Frontend Build ---

frontend-build:
	cd modules/frontend && docker run --rm -v $$(pwd):/app -w /app node:20-alpine sh -c "npm install && npm run build:dev"

frontend-build-prod:
	cd modules/frontend && docker run --rm -v $$(pwd):/app -w /app node:20-alpine sh -c "npm install && npm run build"

