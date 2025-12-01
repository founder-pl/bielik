# 🦅 BIELIK MVP - SZYBKI START

## ⚡ Minimalne kroki (30 minut do działającego MVP)

```bash
# 1. Wypakuj projekt
unzip bielik-mvp.zip
cd bielik-mvp

# 2. Uruchom wszystko jedną komendą
./scripts/start.sh

# 3. Otwórz przeglądarkę
http://localhost:3000
```

---

## 📋 CHECKLIST - CO JEST GOTOWE

### ✅ Infrastruktura Docker
- [x] docker-compose.yml - cały stack
- [x] Ollama z automatycznym pobieraniem Bielika
- [x] PostgreSQL 16 + pgvector
- [x] FastAPI backend
- [x] Nginx frontend

### ✅ Backend API
- [x] `/api/v1/chat` - główny endpoint czatu
- [x] `/api/v1/modules` - lista modułów
- [x] `/api/v1/documents` - CRUD dokumentów
- [x] `/api/v1/search` - wyszukiwanie
- [x] `/health` - status serwisów
- [x] RAG z wyszukiwaniem wektorowym
- [x] System prompty dla 5 modułów

### ✅ Frontend
- [x] Responsywny interfejs czatu
- [x] Przełączanie modułów (KSeF, B2B, ZUS, VAT)
- [x] Wyświetlanie źródeł
- [x] Quick questions
- [x] Health status indicator
- [x] Dark mode

### ✅ Baza wiedzy (dane początkowe)
- [x] KSeF - terminy 2026, wymagania, kary
- [x] B2B - art. 22 KP, kryteria PIP, zabezpieczenia
- [x] ZUS - składki 2025, zmiany 2026
- [x] VAT - JPK_VAT, VAT OSS

---

## 🔧 WYMAGANIA

| Zasób | Minimum | Rekomendowane |
|-------|---------|---------------|
| RAM | 8 GB | 16-24 GB |
| CPU | 4 cores | 8+ cores |
| Dysk | 30 GB | 50 GB |
| Docker | 24.0+ | latest |
| GPU | opcjonalne | NVIDIA (10x szybciej) |

---

## 🚀 KOMENDY

```bash
# Start
docker compose up -d

# Logi (wszystkie)
docker compose logs -f

# Logi API
docker compose logs -f api

# Status
docker compose ps

# Stop (zachowuje dane)
docker compose down

# Stop + usuń dane
docker compose down -v

# Restart API po zmianach kodu
docker compose restart api

# Wejście do kontenera API
docker exec -it bielik-api bash

# Wejście do bazy
docker exec -it bielik-postgres psql -U bielik -d bielik_knowledge
```

---

## 📡 TEST API

```bash
# Health check
curl http://localhost:8000/health

# Pytanie do Bielika
curl -X POST http://localhost:8000/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Kiedy KSeF będzie obowiązkowy?", "module": "ksef"}'

# Lista dokumentów
curl http://localhost:8000/api/v1/documents

# Statystyki bazy
curl http://localhost:8000/api/v1/documents/stats
```

---

## 🔮 NASTĘPNE KROKI (opcjonalne)

### Faza 2: Więcej dokumentów
```bash
# Dodaj dokument przez API
curl -X POST http://localhost:8000/api/v1/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Nowy przepis",
    "category": "vat",
    "source": "Dz.U. 2025",
    "content": "Treść..."
  }'
```

### Faza 3: Embeddingi
Dodaj automatyczne generowanie embeddingów w `services/rag.py`

### Faza 4: GPU
Odkomentuj sekcję GPU w `docker-compose.yml`

### Faza 5: Produkcja
- Dodaj Clerk/Supabase Auth
- Hosting na Hetzner + Coolify
- Własna domena + SSL

---

## 📁 STRUKTURA PLIKÓW

```
bielik-mvp/
├── docker-compose.yml      # 🐳 Główna konfiguracja
├── docker/postgres/
│   └── init.sql            # 📚 Schemat + dane początkowe
├── modules/api/
│   ├── main.py             # 🚀 FastAPI app
│   ├── routers/
│   │   ├── chat.py         # 💬 Endpoint czatu
│   │   ├── documents.py    # 📄 CRUD dokumentów
│   │   └── health.py       # ❤️ Health checks
│   └── services/
│       └── rag.py          # 🧠 RAG + LLM logic
├── modules/frontend/
│   ├── index.html          # 🌐 Strona główna
│   ├── css/style.css       # 🎨 Style
│   ├── js/app.js           # ⚡ Logika JS
│   └── nginx.conf          # 🔧 Proxy config
└── scripts/
    ├── start.sh            # ▶️ Uruchom
    └── stop.sh             # ⏹️ Zatrzymaj
```

---

## ❓ TROUBLESHOOTING

### "Model nie odpowiada"
```bash
# Sprawdź czy Bielik jest załadowany
curl http://localhost:11434/api/tags

# Jeśli brak, pobierz ręcznie
docker exec bielik-ollama ollama pull mwiewior/bielik
```

### "Brak pamięci"
```bash
# Użyj mniejszego modelu
docker exec bielik-ollama ollama pull mwiewior/bielik:7b-q4
```

### "API nie startuje"
```bash
# Sprawdź logi
docker compose logs api

# Sprawdź czy baza działa
docker compose logs postgres
```

### "Frontend nie łączy się z API"
```bash
# Sprawdź czy API działa
curl http://localhost:8000/

# Sprawdź nginx proxy
docker compose logs frontend
```

---

**Czas uruchomienia**: ~5 min (bez pobierania modelu) / ~15 min (z modelem 7GB)

**Gotowe!** 🎉
