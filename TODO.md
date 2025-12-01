# 🚀 BIELIK MVP - Lista TODO

## Cel: Minimalny ekosystem AI dla polskich przedsiębiorców
**Stack**: Docker + Dify.ai + Bielik 11B (Ollama) + PostgreSQL + pgvector
**Bez**: logowania użytkowników, płatności, produkcyjnego hostingu
**Czas realizacji**: 2-3 dni dla podstawowego MVP

---

## 📋 FAZA 0: Przygotowanie środowiska (2-4h)

### Wymagania systemowe
- [ ] RAM: minimum 16GB (24GB+ rekomendowane dla Bielik 11B)
- [ ] Dysk: 50GB wolnego miejsca
- [ ] GPU: opcjonalne, ale przyspiesza 10x (NVIDIA z CUDA)
- [ ] Docker Desktop / Docker Engine 24+
- [ ] docker-compose v2.20+

### Instalacja bazowa
```bash
# 1. Sprawdź wersje
docker --version  # >= 24.0
docker compose version  # >= 2.20

# 2. Utwórz katalog projektu
mkdir -p ~/bielik-mvp && cd ~/bielik-mvp

# 3. Sklonuj to repozytorium (lub skopiuj pliki)
git clone https://github.com/softreck/bielik-mvp.git .
```

- [ ] Zainstalowany Docker Desktop/Engine
- [ ] Sprawdzone wymagania pamięciowe
- [ ] Utworzony katalog projektu

---

## 📋 FAZA 1: Uruchomienie Bielika przez Ollama (1-2h)

### Krok 1.1: Docker Compose dla Ollama
```yaml
# docker/ollama/docker-compose.yml
version: '3.8'
services:
  ollama:
    image: ollama/ollama:latest
    container_name: bielik-ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    environment:
      - OLLAMA_HOST=0.0.0.0
    # Dla GPU NVIDIA (opcjonalne):
    # deploy:
    #   resources:
    #     reservations:
    #       devices:
    #         - driver: nvidia
    #           count: all
    #           capabilities: [gpu]
    restart: unless-stopped

volumes:
  ollama_data:
```

- [ ] Utworzony plik docker-compose.yml dla Ollama
- [ ] Uruchomiony kontener: `docker compose up -d`

### Krok 1.2: Pobranie modelu Bielik
```bash
# Poczekaj na start kontenera (~30s)
docker exec -it bielik-ollama ollama pull mwiewior/bielik

# Lub dla wersji 11B (lepsza jakość, więcej RAM):
docker exec -it bielik-ollama ollama pull speakleash/bielik-11b-v2.3-instruct:Q4_K_M

# Test działania:
docker exec -it bielik-ollama ollama run mwiewior/bielik "Czym jest KSeF?"
```

- [ ] Model Bielik pobrany (~7-15GB)
- [ ] Test działania modelu OK
- [ ] Sprawdzone API: `curl http://localhost:11434/api/generate -d '{"model":"mwiewior/bielik","prompt":"test"}'`

---

## 📋 FAZA 2: Baza wiedzy prawnej (2-3h)

### Krok 2.1: PostgreSQL z pgvector
```yaml
# docker/postgres/docker-compose.yml
version: '3.8'
services:
  postgres:
    image: pgvector/pgvector:pg16
    container_name: bielik-postgres
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: bielik
      POSTGRES_PASSWORD: bielik_dev_2024
      POSTGRES_DB: bielik_knowledge
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    restart: unless-stopped

volumes:
  postgres_data:
```

- [ ] Utworzony docker-compose.yml dla PostgreSQL
- [ ] Uruchomiona baza danych

### Krok 2.2: Schemat bazy danych
```sql
-- docker/postgres/init.sql
CREATE EXTENSION IF NOT EXISTS vector;

-- Tabela dokumentów prawnych
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    source TEXT,  -- np. 'ustawa_vat', 'rozporzadzenie_ksef'
    category TEXT,  -- np. 'podatki', 'zus', 'prawo_pracy'
    content TEXT NOT NULL,
    embedding vector(1024),  -- dla Bielik embeddings
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tabela chunków (fragmentów dokumentów)
CREATE TABLE chunks (
    id SERIAL PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id),
    chunk_index INTEGER,
    content TEXT NOT NULL,
    embedding vector(1024),
    tokens INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indeksy dla szybkiego wyszukiwania
CREATE INDEX ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON documents(category);
CREATE INDEX ON documents(source);

-- Tabela sesji rozmów (bez auth, tylko tracking)
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module TEXT NOT NULL,  -- np. 'ksef', 'b2b', 'zus'
    messages JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

- [ ] Utworzony plik init.sql
- [ ] Schemat załadowany do bazy
- [ ] Test połączenia: `psql -h localhost -U bielik -d bielik_knowledge`

### Krok 2.3: Skrypt do ładowania dokumentów prawnych
```python
# scripts/load_documents.py
"""
Skrypt do ładowania dokumentów prawnych do bazy wiedzy.
Źródła: ISAP, podatki.gov.pl, zus.pl
"""
import os
import requests
from bs4 import BeautifulSoup
import psycopg2
from psycopg2.extras import execute_values

# Przykładowe źródła do pobrania
SOURCES = {
    'ksef': [
        'https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20220001463',  # Ustawa o KSeF
    ],
    'vat': [
        'https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU20040540535',  # Ustawa VAT
    ],
    'pip': [
        'https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU19740240141',  # Kodeks pracy
    ],
}

def chunk_text(text, max_tokens=500, overlap=50):
    """Dzieli tekst na chunki zachowując strukturę artykułów."""
    # Prosta implementacja - do rozbudowy
    words = text.split()
    chunks = []
    for i in range(0, len(words), max_tokens - overlap):
        chunk = ' '.join(words[i:i + max_tokens])
        chunks.append(chunk)
    return chunks

def get_embedding(text, model="mwiewior/bielik"):
    """Pobiera embedding z Ollama."""
    response = requests.post(
        'http://localhost:11434/api/embeddings',
        json={'model': model, 'prompt': text}
    )
    return response.json()['embedding']

# TODO: Implementacja pełnego pipeline'u
```

- [ ] Utworzony skrypt load_documents.py
- [ ] Pobrane podstawowe dokumenty (KSeF, VAT, KP)
- [ ] Wygenerowane embeddingi
- [ ] Dane załadowane do PostgreSQL

---

## 📋 FAZA 3: Backend API z FastAPI (2-3h)

### Krok 3.1: Struktura API
```
modules/api/
├── main.py           # FastAPI app
├── routers/
│   ├── chat.py       # Endpoint czatu z LLM
│   ├── documents.py  # Zarządzanie bazą wiedzy
│   └── health.py     # Health checks
├── services/
│   ├── llm.py        # Komunikacja z Ollama
│   ├── rag.py        # Retrieval-Augmented Generation
│   └── db.py         # Połączenie z PostgreSQL
├── models/
│   └── schemas.py    # Pydantic models
├── requirements.txt
└── Dockerfile
```

- [ ] Utworzona struktura katalogów
- [ ] Zainstalowane zależności

### Krok 3.2: Główny plik API
```python
# modules/api/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import chat, documents, health

app = FastAPI(
    title="Bielik MVP API",
    description="API dla asystenta AI polskich przedsiębiorców",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # W produkcji zawęzić
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, tags=["health"])
app.include_router(chat.router, prefix="/api/v1", tags=["chat"])
app.include_router(documents.router, prefix="/api/v1", tags=["documents"])

@app.get("/")
def root():
    return {"message": "Bielik MVP API", "status": "running"}
```

- [ ] Utworzony main.py
- [ ] Skonfigurowane CORS
- [ ] Zarejestrowane routery

### Krok 3.3: Serwis RAG
```python
# modules/api/services/rag.py
import requests
from typing import List, Optional
import psycopg2
from psycopg2.extras import RealDictCursor

class RAGService:
    def __init__(self, db_url: str, ollama_url: str = "http://ollama:11434"):
        self.db_url = db_url
        self.ollama_url = ollama_url
        self.model = "mwiewior/bielik"
    
    def get_embedding(self, text: str) -> List[float]:
        """Pobiera embedding dla tekstu."""
        response = requests.post(
            f"{self.ollama_url}/api/embeddings",
            json={"model": self.model, "prompt": text}
        )
        return response.json()["embedding"]
    
    def search_similar(self, query: str, category: Optional[str] = None, limit: int = 5) -> List[dict]:
        """Wyszukuje podobne dokumenty w bazie wiedzy."""
        embedding = self.get_embedding(query)
        
        conn = psycopg2.connect(self.db_url)
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            sql = """
                SELECT c.content, d.title, d.source, d.category,
                       1 - (c.embedding <=> %s::vector) as similarity
                FROM chunks c
                JOIN documents d ON c.document_id = d.id
                WHERE (%s IS NULL OR d.category = %s)
                ORDER BY c.embedding <=> %s::vector
                LIMIT %s
            """
            cur.execute(sql, (embedding, category, category, embedding, limit))
            return cur.fetchall()
    
    def generate_response(self, query: str, context: List[dict], module: str) -> str:
        """Generuje odpowiedź z kontekstem."""
        context_text = "\n\n".join([
            f"[{doc['source']}] {doc['content']}" 
            for doc in context
        ])
        
        system_prompts = {
            'ksef': "Jesteś ekspertem od Krajowego Systemu e-Faktur (KSeF). Odpowiadaj precyzyjnie na pytania o e-faktury, terminy wdrożenia, wymagania techniczne.",
            'b2b': "Jesteś ekspertem prawa pracy. Pomagasz ocenić ryzyko przekwalifikowania umowy B2B na etat według kryteriów art. 22 Kodeksu pracy.",
            'zus': "Jesteś ekspertem od składek ZUS. Pomagasz obliczać składki zdrowotne i społeczne dla różnych form działalności.",
            'vat': "Jesteś ekspertem od podatku VAT. Pomagasz z rozliczeniami VAT, JPK, procedurami OSS/IOSS.",
            'default': "Jesteś pomocnym asystentem dla polskich przedsiębiorców. Odpowiadasz na pytania prawno-podatkowe."
        }
        
        prompt = f"""System: {system_prompts.get(module, system_prompts['default'])}

Kontekst z bazy wiedzy:
{context_text}

Pytanie użytkownika: {query}

Odpowiedz na podstawie powyższego kontekstu. Jeśli nie masz pewności, powiedz to wprost."""

        response = requests.post(
            f"{self.ollama_url}/api/generate",
            json={
                "model": self.model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.3,
                    "num_predict": 1000
                }
            }
        )
        return response.json()["response"]
```

- [ ] Utworzony serwis RAG
- [ ] Zaimplementowane embeddingi
- [ ] Zaimplementowane wyszukiwanie wektorowe
- [ ] Zaimplementowana generacja odpowiedzi

### Krok 3.4: Endpoint czatu
```python
# modules/api/routers/chat.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from services.rag import RAGService

router = APIRouter()
rag = RAGService(db_url="postgresql://bielik:bielik_dev_2024@postgres:5432/bielik_knowledge")

class ChatRequest(BaseModel):
    message: str
    module: str = "default"  # ksef, b2b, zus, vat, default
    conversation_id: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    sources: List[dict]
    conversation_id: str

@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Główny endpoint czatu z Bielikiem."""
    try:
        # 1. Wyszukaj podobne dokumenty
        context = rag.search_similar(
            query=request.message,
            category=request.module if request.module != "default" else None,
            limit=5
        )
        
        # 2. Wygeneruj odpowiedź
        response = rag.generate_response(
            query=request.message,
            context=context,
            module=request.module
        )
        
        # 3. Przygotuj źródła
        sources = [
            {"title": doc["title"], "source": doc["source"], "similarity": doc["similarity"]}
            for doc in context
        ]
        
        return ChatResponse(
            response=response,
            sources=sources,
            conversation_id=request.conversation_id or "new"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

- [ ] Utworzony router chat.py
- [ ] Zdefiniowane modele Pydantic
- [ ] Endpoint /chat działa

### Krok 3.5: Dockerfile dla API
```dockerfile
# modules/api/Dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```
# modules/api/requirements.txt
fastapi==0.109.0
uvicorn[standard]==0.27.0
psycopg2-binary==2.9.9
requests==2.31.0
pydantic==2.5.3
python-multipart==0.0.6
```

- [ ] Utworzony Dockerfile
- [ ] Utworzony requirements.txt
- [ ] Zbudowany obraz: `docker build -t bielik-api .`

---

## 📋 FAZA 4: Frontend - prosty interfejs (2-3h)

### Krok 4.1: Struktura frontendu
```
modules/frontend/
├── index.html
├── css/
│   └── style.css
├── js/
│   └── app.js
├── Dockerfile
└── nginx.conf
```

- [ ] Utworzona struktura katalogów

### Krok 4.2: Główna strona HTML
```html
<!-- modules/frontend/index.html -->
<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bielik MVP - Asystent AI dla przedsiębiorców</title>
    <link rel="stylesheet" href="css/style.css">
</head>
<body>
    <div class="container">
        <header>
            <h1>🦅 Bielik MVP</h1>
            <p>Twój AI asystent prawno-podatkowy</p>
        </header>
        
        <nav class="modules">
            <button class="module-btn active" data-module="default">💬 Ogólne</button>
            <button class="module-btn" data-module="ksef">📄 KSeF</button>
            <button class="module-btn" data-module="b2b">💼 B2B vs Etat</button>
            <button class="module-btn" data-module="zus">🏥 ZUS/Składki</button>
            <button class="module-btn" data-module="vat">💰 VAT/JPK</button>
        </nav>
        
        <main class="chat-container">
            <div id="chat-messages" class="messages">
                <div class="message assistant">
                    <p>Cześć! Jestem Bielikiem - polskim asystentem AI. Wybierz moduł i zadaj pytanie dotyczące prawa podatkowego, ZUS lub umów B2B.</p>
                </div>
            </div>
            
            <form id="chat-form" class="input-container">
                <input type="text" id="user-input" placeholder="Zadaj pytanie..." autocomplete="off">
                <button type="submit">Wyślij</button>
            </form>
        </main>
        
        <aside id="sources" class="sources hidden">
            <h3>📚 Źródła</h3>
            <ul id="sources-list"></ul>
        </aside>
    </div>
    
    <script src="js/app.js"></script>
</body>
</html>
```

- [ ] Utworzony plik index.html
- [ ] Dodane przyciski modułów
- [ ] Przygotowany kontener czatu

### Krok 4.3: Styl CSS
```css
/* modules/frontend/css/style.css */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    min-height: 100vh;
    color: #e0e0e0;
}

.container {
    max-width: 900px;
    margin: 0 auto;
    padding: 20px;
}

header {
    text-align: center;
    padding: 20px 0;
}

header h1 {
    font-size: 2.5rem;
    color: #fff;
}

.modules {
    display: flex;
    gap: 10px;
    justify-content: center;
    flex-wrap: wrap;
    margin: 20px 0;
}

.module-btn {
    padding: 10px 20px;
    border: 2px solid #4a90a4;
    background: transparent;
    color: #4a90a4;
    border-radius: 25px;
    cursor: pointer;
    transition: all 0.3s;
}

.module-btn:hover, .module-btn.active {
    background: #4a90a4;
    color: #fff;
}

.chat-container {
    background: rgba(255,255,255,0.05);
    border-radius: 15px;
    padding: 20px;
    min-height: 500px;
    display: flex;
    flex-direction: column;
}

.messages {
    flex: 1;
    overflow-y: auto;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 15px;
}

.message {
    padding: 15px;
    border-radius: 10px;
    max-width: 80%;
}

.message.user {
    background: #4a90a4;
    color: #fff;
    align-self: flex-end;
}

.message.assistant {
    background: rgba(255,255,255,0.1);
    align-self: flex-start;
}

.input-container {
    display: flex;
    gap: 10px;
    margin-top: 20px;
}

#user-input {
    flex: 1;
    padding: 15px;
    border: none;
    border-radius: 25px;
    background: rgba(255,255,255,0.1);
    color: #fff;
    font-size: 1rem;
}

#user-input::placeholder {
    color: rgba(255,255,255,0.5);
}

button[type="submit"] {
    padding: 15px 30px;
    border: none;
    border-radius: 25px;
    background: #4a90a4;
    color: #fff;
    cursor: pointer;
    font-size: 1rem;
}

button[type="submit"]:hover {
    background: #3a7a94;
}

.sources {
    margin-top: 20px;
    padding: 15px;
    background: rgba(255,255,255,0.05);
    border-radius: 10px;
}

.sources.hidden {
    display: none;
}

.sources h3 {
    margin-bottom: 10px;
}

.sources ul {
    list-style: none;
}

.sources li {
    padding: 5px 0;
    border-bottom: 1px solid rgba(255,255,255,0.1);
    font-size: 0.9rem;
}

.loading::after {
    content: '...';
    animation: dots 1.5s infinite;
}

@keyframes dots {
    0%, 20% { content: '.'; }
    40% { content: '..'; }
    60%, 100% { content: '...'; }
}
```

- [ ] Utworzony plik style.css
- [ ] Responsywny design
- [ ] Ciemny motyw

### Krok 4.4: JavaScript
```javascript
// modules/frontend/js/app.js
const API_URL = '/api/v1';  // Proxy przez nginx
let currentModule = 'default';

// Obsługa wyboru modułu
document.querySelectorAll('.module-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.module-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentModule = btn.dataset.module;
        
        // Pokaż powitanie dla modułu
        const messages = {
            'ksef': 'Pytaj o Krajowy System e-Faktur: terminy, wymagania, procedury.',
            'b2b': 'Pomogę ocenić ryzyko umowy B2B według kryteriów Inspekcji Pracy.',
            'zus': 'Obliczę składki ZUS i wyjaśnię zasady ubezpieczeń.',
            'vat': 'Pomogę z VAT, JPK, procedurami OSS/IOSS.',
            'default': 'Zadaj dowolne pytanie dotyczące prowadzenia firmy w Polsce.'
        };
        addMessage(messages[currentModule], 'assistant');
    });
});

// Obsługa formularza
document.getElementById('chat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('user-input');
    const message = input.value.trim();
    
    if (!message) return;
    
    addMessage(message, 'user');
    input.value = '';
    
    // Pokaż loading
    const loadingId = addMessage('Myślę', 'assistant', true);
    
    try {
        const response = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: message,
                module: currentModule
            })
        });
        
        const data = await response.json();
        
        // Usuń loading i dodaj odpowiedź
        removeMessage(loadingId);
        addMessage(data.response, 'assistant');
        
        // Pokaż źródła
        if (data.sources && data.sources.length > 0) {
            showSources(data.sources);
        }
    } catch (error) {
        removeMessage(loadingId);
        addMessage('Przepraszam, wystąpił błąd. Spróbuj ponownie.', 'assistant');
        console.error(error);
    }
});

function addMessage(text, role, isLoading = false) {
    const container = document.getElementById('chat-messages');
    const id = `msg-${Date.now()}`;
    
    const div = document.createElement('div');
    div.id = id;
    div.className = `message ${role}${isLoading ? ' loading' : ''}`;
    div.innerHTML = `<p>${text}</p>`;
    
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    
    return id;
}

function removeMessage(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function showSources(sources) {
    const container = document.getElementById('sources');
    const list = document.getElementById('sources-list');
    
    list.innerHTML = sources.map(s => 
        `<li><strong>${s.title}</strong> (${s.source}) - ${Math.round(s.similarity * 100)}% dopasowania</li>`
    ).join('');
    
    container.classList.remove('hidden');
}
```

- [ ] Utworzony plik app.js
- [ ] Obsługa wyboru modułów
- [ ] Wysyłanie zapytań do API
- [ ] Wyświetlanie źródeł

### Krok 4.5: Docker dla frontendu
```dockerfile
# modules/frontend/Dockerfile
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html

EXPOSE 80
```

```nginx
# modules/frontend/nginx.conf
server {
    listen 80;
    server_name localhost;
    
    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
    
    location /api/ {
        proxy_pass http://api:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

- [ ] Utworzony Dockerfile
- [ ] Utworzony nginx.conf
- [ ] Zbudowany obraz

---

## 📋 FAZA 5: Docker Compose - cały stack (1h)

### Krok 5.1: Główny docker-compose.yml
```yaml
# docker-compose.yml
version: '3.8'

services:
  # LLM Backend
  ollama:
    image: ollama/ollama:latest
    container_name: bielik-ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    environment:
      - OLLAMA_HOST=0.0.0.0
    restart: unless-stopped
    # Uncomment for GPU:
    # deploy:
    #   resources:
    #     reservations:
    #       devices:
    #         - driver: nvidia
    #           count: all
    #           capabilities: [gpu]

  # Baza danych
  postgres:
    image: pgvector/pgvector:pg16
    container_name: bielik-postgres
    environment:
      POSTGRES_USER: bielik
      POSTGRES_PASSWORD: bielik_dev_2024
      POSTGRES_DB: bielik_knowledge
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docker/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"
    restart: unless-stopped

  # API Backend
  api:
    build: ./modules/api
    container_name: bielik-api
    environment:
      DATABASE_URL: postgresql://bielik:bielik_dev_2024@postgres:5432/bielik_knowledge
      OLLAMA_URL: http://ollama:11434
    depends_on:
      - postgres
      - ollama
    ports:
      - "8000:8000"
    restart: unless-stopped

  # Frontend
  frontend:
    build: ./modules/frontend
    container_name: bielik-frontend
    depends_on:
      - api
    ports:
      - "3000:80"
    restart: unless-stopped

volumes:
  ollama_data:
  postgres_data:
```

- [ ] Utworzony główny docker-compose.yml
- [ ] Wszystkie serwisy skonfigurowane
- [ ] Volumes dla trwałości danych

### Krok 5.2: Skrypt startowy
```bash
#!/bin/bash
# scripts/start.sh

echo "🦅 Uruchamianie Bielik MVP..."

# 1. Budowanie obrazów
echo "📦 Budowanie obrazów Docker..."
docker compose build

# 2. Uruchamianie serwisów
echo "🚀 Uruchamianie serwisów..."
docker compose up -d

# 3. Czekanie na Ollama
echo "⏳ Czekam na Ollama..."
sleep 10

# 4. Pobieranie modelu Bielik
echo "📥 Pobieranie modelu Bielik..."
docker exec bielik-ollama ollama pull mwiewior/bielik

# 5. Ładowanie dokumentów (opcjonalnie)
# echo "📚 Ładowanie bazy wiedzy..."
# docker exec bielik-api python scripts/load_documents.py

echo "✅ Gotowe!"
echo ""
echo "🌐 Frontend: http://localhost:3000"
echo "📡 API: http://localhost:8000/docs"
echo "🤖 Ollama: http://localhost:11434"
```

- [ ] Utworzony skrypt start.sh
- [ ] Nadane uprawnienia: `chmod +x scripts/start.sh`
- [ ] Test uruchomienia

---

## 📋 FAZA 6: Ładowanie danych do bazy wiedzy (2-3h)

### Krok 6.1: Podstawowe dokumenty do załadowania
```
Źródła do pobrania:
- [ ] Ustawa o KSeF (Dz.U. 2022 poz. 1463)
- [ ] Rozporządzenie w sprawie KSeF
- [ ] Ustawa VAT (kluczowe artykuły)
- [ ] Kodeks pracy (art. 22, 281-283)
- [ ] Ustawa o PIP (nowe uprawnienia 2026)
- [ ] Zasady składek ZUS 2025
```

### Krok 6.2: Skrypt do automatycznego pobierania
```python
# scripts/fetch_legal_docs.py
"""
Pobiera dokumenty prawne z oficjalnych źródeł.
"""
import requests
from bs4 import BeautifulSoup
import json
import os

DOCS = [
    {
        "id": "ksef_ustawa",
        "title": "Ustawa o Krajowym Systemie e-Faktur",
        "url": "https://isap.sejm.gov.pl/isap.nsf/download.xsp/WDU20220001463/T/D20221463L.pdf",
        "category": "ksef",
        "source": "Dz.U. 2022 poz. 1463"
    },
    {
        "id": "kodeks_pracy_art22",
        "title": "Kodeks pracy - Art. 22 Stosunek pracy",
        "content": """
Art. 22. § 1. Przez nawiązanie stosunku pracy pracownik zobowiązuje się do wykonywania pracy określonego rodzaju na rzecz pracodawcy i pod jego kierownictwem oraz w miejscu i czasie wyznaczonym przez pracodawcę, a pracodawca - do zatrudniania pracownika za wynagrodzeniem.
§ 1¹. Zatrudnienie w warunkach określonych w § 1 jest zatrudnieniem na podstawie stosunku pracy, bez względu na nazwę zawartej przez strony umowy.
§ 1². Nie jest dopuszczalne zastąpienie umowy o pracę umową cywilnoprawną przy zachowaniu warunków wykonywania pracy, określonych w § 1.
        """,
        "category": "b2b",
        "source": "Kodeks pracy"
    },
    {
        "id": "pip_kryteria_b2b",
        "title": "Kryteria oceny pozornego samozatrudnienia PIP",
        "content": """
Państwowa Inspekcja Pracy ocenia czy umowa B2B nie jest pozornym samozatrudnieniem według następujących kryteriów:

1. PODPORZĄDKOWANIE - czy zleceniobiorca otrzymuje polecenia służbowe, jak je wykonać
2. MIEJSCE PRACY - czy musi pracować w siedzibie zleceniodawcy
3. CZAS PRACY - czy ma stałe godziny pracy narzucone przez zleceniodawcę
4. WYŁĄCZNOŚĆ - czy pracuje tylko dla jednego klienta przez dłuższy czas
5. BRAK RYZYKA - czy nie ponosi ryzyka gospodarczego
6. ZAKAZ KONKURENCJI - czy ma zakaz pracy dla konkurencji
7. NARZĘDZIA - czy używa wyłącznie narzędzi dostarczonych przez zleceniodawcę
8. SUBSTYTUCJA - czy może wysłać kogoś innego do wykonania pracy

Od 1 stycznia 2026 inspektor PIP będzie mógł DECYZJĄ ADMINISTRACYJNĄ (bez sądu) przekształcić umowę B2B w stosunek pracy jeśli stwierdzi spełnienie tych kryteriów.
        """,
        "category": "b2b",
        "source": "PIP 2026"
    },
    {
        "id": "zus_skladki_2025",
        "title": "Składki ZUS dla przedsiębiorców 2025",
        "content": """
SKŁADKI ZUS 2025 dla przedsiębiorców (JDG):

DUŻY ZUS (pełne składki):
- Emerytalna: 812,23 zł
- Rentowa: 332,90 zł
- Chorobowa (dobrowolna): 101,94 zł
- Wypadkowa: ~70 zł (zależy od branży)
- Fundusz Pracy: 101,94 zł
RAZEM: ~1419 zł + składka zdrowotna

MAŁY ZUS (pierwsze 6 miesięcy):
- Tylko składka zdrowotna

MAŁY ZUS+ (przy niskich przychodach):
- Proporcjonalnie do przychodu

SKŁADKA ZDROWOTNA 2025:
- Ryczałt: 461,66 zł / 769,43 zł / 1384,97 zł (zależnie od przychodu)
- Podatek liniowy: 4,9% dochodu, min. 314,96 zł
- Skala podatkowa: 9% dochodu, min. 314,96 zł
        """,
        "category": "zus",
        "source": "ZUS 2025"
    },
    {
        "id": "ksef_terminy_2026",
        "title": "Terminy wdrożenia KSeF 2026",
        "content": """
HARMONOGRAM WDROŻENIA KSeF:

1 LUTEGO 2026:
- WYSTAWIANIE faktur w KSeF: obowiązkowe dla firm z obrotem > 200 mln zł
- ODBIERANIE faktur z KSeF: obowiązkowe dla WSZYSTKICH podatników VAT

1 KWIETNIA 2026:
- WYSTAWIANIE faktur w KSeF: obowiązkowe dla WSZYSTKICH podatników VAT

OKRES PRZEJŚCIOWY (do 31.12.2026):
- Brak kar za błędy w fakturach KSeF
- Możliwość wystawiania faktur "offline" z późniejszym przesłaniem do KSeF

OD 1 STYCZNIA 2027:
- Pełne sankcje za nieprzestrzeganie przepisów
- Kara do 100% VAT na fakturze wystawionej poza KSeF

WYŁĄCZENIA z obowiązku KSeF:
- Podatnicy zwolnieni z VAT (do 200 tys. zł obrotu) - do końca 2026
- Faktury B2C dla konsumentów - mogą być poza KSeF
- Bilety, paragony - wyłączone
        """,
        "category": "ksef",
        "source": "Ustawa KSeF 2024"
    }
]

def save_docs():
    os.makedirs('data/legal', exist_ok=True)
    
    with open('data/legal/documents.json', 'w', encoding='utf-8') as f:
        json.dump(DOCS, f, ensure_ascii=False, indent=2)
    
    print(f"Zapisano {len(DOCS)} dokumentów")

if __name__ == "__main__":
    save_docs()
```

- [ ] Utworzony skrypt fetch_legal_docs.py
- [ ] Pobrane podstawowe dokumenty
- [ ] Dane zapisane w formacie JSON

### Krok 6.3: Ładowanie do bazy z embeddingami
```python
# scripts/load_to_db.py
"""
Ładuje dokumenty do PostgreSQL z embeddingami.
"""
import json
import requests
import psycopg2
from psycopg2.extras import execute_values

DB_URL = "postgresql://bielik:bielik_dev_2024@localhost:5432/bielik_knowledge"
OLLAMA_URL = "http://localhost:11434"
MODEL = "mwiewior/bielik"

def get_embedding(text):
    response = requests.post(
        f"{OLLAMA_URL}/api/embeddings",
        json={"model": MODEL, "prompt": text[:2000]}  # limit tokenów
    )
    return response.json()["embedding"]

def chunk_text(text, max_chars=1000):
    """Prosty chunking po akapitach."""
    paragraphs = text.split('\n\n')
    chunks = []
    current = ""
    
    for p in paragraphs:
        if len(current) + len(p) < max_chars:
            current += p + "\n\n"
        else:
            if current:
                chunks.append(current.strip())
            current = p + "\n\n"
    
    if current:
        chunks.append(current.strip())
    
    return chunks

def load_documents():
    with open('data/legal/documents.json', 'r', encoding='utf-8') as f:
        docs = json.load(f)
    
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    
    for doc in docs:
        print(f"Ładuję: {doc['title']}")
        
        content = doc.get('content', '')
        if not content and 'url' in doc:
            print(f"  Pomiń - wymaga pobrania z URL")
            continue
        
        # Wstaw dokument
        cur.execute("""
            INSERT INTO documents (title, source, category, content, metadata)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id
        """, (doc['title'], doc['source'], doc['category'], content, json.dumps(doc)))
        
        doc_id = cur.fetchone()[0]
        
        # Chunki i embeddingi
        chunks = chunk_text(content)
        for i, chunk in enumerate(chunks):
            print(f"  Chunk {i+1}/{len(chunks)}")
            embedding = get_embedding(chunk)
            
            cur.execute("""
                INSERT INTO chunks (document_id, chunk_index, content, embedding, tokens)
                VALUES (%s, %s, %s, %s, %s)
            """, (doc_id, i, chunk, embedding, len(chunk.split())))
        
        conn.commit()
    
    cur.close()
    conn.close()
    print("Gotowe!")

if __name__ == "__main__":
    load_documents()
```

- [ ] Utworzony skrypt load_to_db.py
- [ ] Test ładowania danych
- [ ] Weryfikacja embeddingów w bazie

---

## 📋 FAZA 7: Testowanie i walidacja (1-2h)

### Testy do wykonania
```bash
# 1. Sprawdź czy wszystkie kontenery działają
docker compose ps

# 2. Test API
curl http://localhost:8000/
curl http://localhost:8000/docs  # Swagger UI

# 3. Test Ollama
curl http://localhost:11434/api/generate -d '{
  "model": "mwiewior/bielik",
  "prompt": "Co to jest KSeF?",
  "stream": false
}'

# 4. Test endpointu czatu
curl -X POST http://localhost:8000/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Kiedy wchodzi obowiązkowy KSeF?", "module": "ksef"}'

# 5. Test frontendu
# Otwórz http://localhost:3000 w przeglądarce
```

- [ ] Wszystkie kontenery running
- [ ] API odpowiada na /docs
- [ ] Ollama generuje odpowiedzi
- [ ] RAG zwraca źródła
- [ ] Frontend wyświetla czat

### Przykładowe pytania testowe

| Moduł | Pytanie | Oczekiwana odpowiedź |
|-------|---------|----------------------|
| ksef | "Kiedy KSeF będzie obowiązkowy?" | "Od 1 lutego 2026 dla dużych firm, od 1 kwietnia 2026 dla wszystkich" |
| b2b | "Jakie są kryteria pozornego samozatrudnienia?" | Lista 8 kryteriów PIP |
| zus | "Ile wynosi składka zdrowotna na ryczałcie?" | "461,66 / 769,43 / 1384,97 zł" |
| vat | "Co to jest JPK_VAT?" | Wyjaśnienie z terminami |

- [ ] Test KSeF OK
- [ ] Test B2B OK
- [ ] Test ZUS OK
- [ ] Test VAT OK

---

## 📋 FAZA 8: Dokumentacja i finalizacja (1h)

### Pliki do utworzenia
- [ ] README.md - instrukcja instalacji
- [ ] CONTRIBUTING.md - jak rozwijać projekt
- [ ] LICENSE - Apache 2.0 lub MIT
- [ ] .env.example - wzór zmiennych środowiskowych
- [ ] .gitignore

### README.md
```markdown
# 🦅 Bielik MVP

Minimalny asystent AI dla polskich przedsiębiorców, oparty na polskim modelu LLM Bielik.

## Funkcje
- 💬 Czat z AI na tematy prawno-podatkowe
- 📄 Moduł KSeF - pytania o e-faktury
- 💼 Moduł B2B - ocena ryzyka umów
- 🏥 Moduł ZUS - składki i ubezpieczenia
- 💰 Moduł VAT - rozliczenia podatkowe

## Wymagania
- Docker 24+
- 16GB RAM (24GB+ rekomendowane)
- 50GB wolnego miejsca

## Szybki start
\`\`\`bash
git clone https://github.com/softreck/bielik-mvp.git
cd bielik-mvp
chmod +x scripts/start.sh
./scripts/start.sh
\`\`\`

Otwórz http://localhost:3000

## Architektura
- **Ollama** - hosting modelu Bielik
- **PostgreSQL + pgvector** - baza wiedzy z wyszukiwaniem wektorowym
- **FastAPI** - backend API z RAG
- **Nginx** - frontend statyczny

## Licencja
Apache 2.0
```

- [ ] README.md utworzony
- [ ] Instrukcja instalacji jasna
- [ ] Licencja dodana

---

## ✅ PODSUMOWANIE

### Szacowany czas realizacji
| Faza | Czas |
|------|------|
| Faza 0: Przygotowanie | 2-4h |
| Faza 1: Ollama + Bielik | 1-2h |
| Faza 2: PostgreSQL | 2-3h |
| Faza 3: Backend API | 2-3h |
| Faza 4: Frontend | 2-3h |
| Faza 5: Docker Compose | 1h |
| Faza 6: Dane prawne | 2-3h |
| Faza 7: Testowanie | 1-2h |
| Faza 8: Dokumentacja | 1h |
| **RAZEM** | **14-22h** (2-3 dni) |

### Minimalna wersja (1 dzień)
Jeśli chcesz uruchomić w 1 dzień, pomiń:
- Faza 6 (użyj hardcoded danych)
- Zaawansowane chunking
- Testy automatyczne

### Następne kroki po MVP
1. Więcej dokumentów prawnych (crawling ISAP)
2. Lepszy chunking (zachowanie struktury artykułów)
3. Historia rozmów w bazie
4. Autentykacja użytkowników
5. Deployment na Hetzner
