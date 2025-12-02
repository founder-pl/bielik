<img width="701" height="455" alt="obraz" src="https://github.com/user-attachments/assets/899ab904-2298-465a-bef5-74a684739308" />

# detax is powered by Bielik 🦅 

**Minimalny asystent AI dla polskich przedsiębiorców** oparty na polskim modelu LLM Bielik.

## ✨ Funkcje

- 💬 **Czat z AI** - pytania o prawo podatkowe, ZUS, umowy
- 📄 **Moduł KSeF** - Krajowy System e-Faktur (terminy 2026, wymagania)
- 💼 **Moduł B2B** - ocena ryzyka umów B2B, kryteria PIP
- 🏥 **Moduł ZUS** - składki społeczne i zdrowotne 2025/2026
- 💰 **Moduł VAT** - JPK, VAT OSS, rozliczenia

## 🚀 Szybki start

### Wymagania

- Docker 24+ z Docker Compose v2
- 16GB RAM (24GB+ rekomendowane)
- 50GB wolnego miejsca na dysku

### Uruchomienie

```bash
# 1. Sklonuj repozytorium
git clone https://github.com/founder-pl/bielik-mvp.git
cd bielik-mvp

# 2. Uruchom (pierwsze uruchomienie pobiera ~7GB modelu)
chmod +x scripts/start.sh
./scripts/start.sh

# Lub ręcznie:
docker compose up -d
docker exec bielik-ollama ollama pull mwiewior/bielik
```

### Dostęp

| Serwis | URL |
|--------|-----|
| 🌐 Frontend | http://localhost:3000 |
| 📡 API Docs | http://localhost:8000/docs |
| 🤖 Ollama | http://localhost:11434 |
| 🗄️ PostgreSQL | localhost:5432 |

## 📁 Struktura projektu

```
bielik-mvp/
├── docker-compose.yml      # Główna konfiguracja Docker
├── docker/
│   └── postgres/
│       └── init.sql        # Schemat bazy + dane początkowe
├── modules/
│   ├── api/                # FastAPI backend (CQRS + event sourcing)
│   │   ├── main.py
│   │   ├── routers/        # Endpointy API (chat, documents, projects, context, events, layout)
│   │   ├── services/       # Logika biznesowa (RAG, event store)
│   │   └── Dockerfile
│   └── frontend/           # Frontend (HTML/CSS + TypeScript bundlowany do js/app.js)
│       ├── index.html      # Dashboard: chat + kontakty/projekty/pliki/dokumenty
│       ├── css/
│       ├── js/             # Zbudowany bundle (esbuild) – nie edytuj ręcznie
│       ├── src/            # Kod TypeScript (main.ts, ui/*)
│       └── Dockerfile
├── scripts/
│   ├── start.sh            # Skrypt startowy
│   └── stop.sh             # Skrypt stop
└── TODO.md                 # Szczegółowa lista zadań
```

## 🔧 Architektura

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   FastAPI   │────▶│   Ollama    │
│   (Nginx)   │     │   (RAG)     │     │  (Bielik)   │
│  :3000      │     │  :8000      │     │  :11434     │
└─────────────┘     └──────┬──────┘     └─────────────┘
                          │
                   ┌──────▼──────┐
                   │ PostgreSQL  │
                   │ + pgvector  │
                   │  :5432      │
                   └─────────────┘
```

## 📖 API

### POST /api/v1/chat

```bash
curl -X POST http://localhost:8000/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Kiedy KSeF będzie obowiązkowy?",
    "module": "ksef"
  }'
```

**Moduły:** `default`, `ksef`, `b2b`, `zus`, `vat`

### GET /api/v1/documents/stats

Statystyki bazy wiedzy.

### CQRS / Event sourcing / Kontekst

- `POST /api/v1/commands/documents/create|update|delete` – polecenia na dokumentach
- `POST /api/v1/commands/projects/create|update|delete|add-file|remove-file` – polecenia na projektach/plikach
- `GET  /api/v1/events/documents/{id}` – historia zdarzeń dla dokumentu
- `GET  /api/v1/events/projects/{id}` – historia zdarzeń dla projektu
- `GET  /api/v1/projects` – lista projektów (opcjonalnie filtrowana po kontakcie)
- `GET  /api/v1/projects/{id}` – szczegóły projektu
- `GET  /api/v1/projects/{id}/files` – pliki projektu
- `GET  /api/v1/context/channels` – rekomendowane kanały czatu na podstawie kontaktu/projektu/pliku
- `GET  /api/v1/context/hierarchy` – pełna hierarchia kontakt → projekty → pliki

### GET /health

Status wszystkich serwisów.

## 🛠️ Development

```bash
# Logi wszystkich serwisów
docker compose logs -f

# Logi konkretnego serwisu
docker compose logs -f api

# Restart API po zmianach
docker compose restart api

# Wejście do kontenera
docker exec -it bielik-api bash

# Połączenie z bazą
docker exec -it bielik-postgres psql -U bielik -d bielik_knowledge
```

## 💻 Frontend (TypeScript)

Frontend jest teraz pisany w TypeScript i bundlowany do `modules/frontend/js/app.js`.

```bash
cd modules/frontend
npm install

# Build dev (tsc + esbuild, sourcemap)
npm run build:dev

# Build produkcyjny (minifikacja)
npm run build
```

Po każdej zmianie w `modules/frontend/src/**/*` odpal `npm run build:dev`, aby odświeżyć bundla.

## 📚 Dokumentacja API (OpenAPI)

Możesz generować statyczny plik `docs/openapi.json` bezpośrednio z aplikacji FastAPI:

```bash
# z katalogu głównego repozytorium

# Jednorazowe wygenerowanie OpenAPI
make docs-api

# Tryb watch – regeneruje OpenAPI przy zmianach w modules/api
make docs-api-watch
```

Plik `docs/openapi.json` możesz wgrać do narzędzi typu Swagger UI / Redoc / Stoplight jako źródło dokumentacji.

## 📊 Dodawanie dokumentów

1. Dodaj dokument przez API:
```bash
curl -X POST http://localhost:8000/api/v1/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Nowy przepis",
    "source": "Dz.U. 2025",
    "category": "vat",
    "content": "Treść dokumentu..."
  }'
```

2. Lub bezpośrednio w SQL (`docker/postgres/init.sql`)

## ⚠️ Ograniczenia MVP

- Brak autentykacji użytkowników
- Brak historii rozmów między sesjami
- Embeddingi nie są automatycznie generowane dla nowych dokumentów
- Tylko polski model Bielik (brak fallback na GPT)

## 🔮 Roadmap

- [ ] Autentykacja (Clerk/Supabase Auth)
- [ ] Automatyczne embeddingi
- [ ] Historia rozmów
- [ ] Więcej dokumentów prawnych
- [ ] Wtyczka do przeglądarki
- [ ] Integracja z KSeF API

## 📄 Licencja

Apache 2.0

## 🙏 Credits

- [SpeakLeash/Bielik](https://huggingface.co/speakleash) - polski model LLM
- [Ollama](https://ollama.ai) - hosting modeli
- [pgvector](https://github.com/pgvector/pgvector) - wyszukiwanie wektorowe
