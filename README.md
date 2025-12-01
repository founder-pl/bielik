# 🦅 Bielik Biznes

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
git clone https://github.com/softreck/bielik-mvp.git
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
│   ├── api/                # FastAPI backend
│   │   ├── main.py
│   │   ├── routers/        # Endpointy API
│   │   ├── services/       # Logika biznesowa (RAG)
│   │   └── Dockerfile
│   └── frontend/           # Statyczny HTML/CSS/JS
│       ├── index.html
│       ├── css/
│       ├── js/
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
