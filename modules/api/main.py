"""
Bielik MVP - API Backend
FastAPI z RAG dla polskich przedsiębiorców
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from routers import chat, documents, health

# Konfiguracja logowania
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle events dla aplikacji."""
    logger.info("🦅 Bielik MVP API uruchamia się...")
    yield
    logger.info("🦅 Bielik MVP API zatrzymuje się...")


app = FastAPI(
    title="Bielik MVP API",
    description="""
## 🦅 Bielik MVP - Asystent AI dla polskich przedsiębiorców

API oparte na polskim modelu LLM Bielik z bazą wiedzy prawno-podatkowej.

### Moduły:
- **KSeF** - Krajowy System e-Faktur
- **B2B** - Umowy B2B vs etat, ryzyko PIP
- **ZUS** - Składki, ubezpieczenia
- **VAT** - JPK, OSS, rozliczenia

### Jak używać:
1. Wyślij zapytanie na `/api/v1/chat`
2. Podaj `module` odpowiedni do tematu
3. Otrzymaj odpowiedź z kontekstem i źródłami
    """,
    version="0.1.0",
    lifespan=lifespan
)

# CORS - pozwól na wszystkie origins w dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routery
app.include_router(health.router, tags=["health"])
app.include_router(chat.router, prefix="/api/v1", tags=["chat"])
app.include_router(documents.router, prefix="/api/v1", tags=["documents"])


@app.get("/", tags=["root"])
def root():
    """Główny endpoint - informacje o API."""
    return {
        "name": "Bielik MVP API",
        "version": "0.1.0",
        "status": "running",
        "modules": ["ksef", "b2b", "zus", "vat", "default"],
        "docs": "/docs",
        "health": "/health"
    }
