"""
Bielik MVP - API Backend
FastAPI z RAG dla polskich przedsiębiorców
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from routers import chat, documents, health, layout, commands_documents, events, projects, commands_projects, context, sources

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
app.include_router(layout.router, prefix="/api/v1", tags=["layout"])
app.include_router(commands_documents.router, prefix="/api/v1", tags=["commands-documents"])
app.include_router(events.router, prefix="/api/v1", tags=["events"])
app.include_router(projects.router, prefix="/api/v1", tags=["projects"])
app.include_router(commands_projects.router, prefix="/api/v1", tags=["commands-projects"])
app.include_router(context.router, prefix="/api/v1", tags=["context"])
app.include_router(sources.router, prefix="/api/v1", tags=["sources"])


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


# ═══════════════════════════════════════════════════════════════
# SSO - Single Sign-On from IDCard.pl
# ═══════════════════════════════════════════════════════════════

import jwt
import os
from datetime import datetime, timedelta
from starlette.responses import RedirectResponse

@app.get("/sso", tags=["auth"])
async def sso_login(token: str, redirect: str = "/"):
    """
    SSO endpoint - loguje użytkownika tokenem z IDCard.pl
    Przekierowuje do frontendu z tokenem w URL
    """
    SSO_SECRET = os.getenv("SSO_SECRET", "idcard-secret-key-change-in-production")
    JWT_SECRET = os.getenv("JWT_SECRET", "detax-secret-key-change-in-production")
    
    try:
        # Weryfikuj token z IDCard.pl
        payload = jwt.decode(token, SSO_SECRET, algorithms=["HS256"])
        user_id = payload.get("sub")
        email = payload.get("email")
        
        if not user_id:
            return {"error": "Invalid token"}
        
        # Utwórz lokalny token dla Detax
        local_token = jwt.encode({
            "sub": user_id,
            "email": email,
            "exp": datetime.utcnow() + timedelta(hours=24),
            "iat": datetime.utcnow(),
            "iss": "detax.pl",
            "sso_from": "idcard.pl"
        }, JWT_SECRET, algorithm="HS256")
        
        # Przekieruj do frontendu z tokenem
        frontend_url = f"http://localhost:3005{redirect}?sso_token={local_token}"
        return RedirectResponse(url=frontend_url, status_code=302)
        
    except jwt.ExpiredSignatureError:
        return {"error": "Token expired"}
    except jwt.InvalidTokenError:
        return {"error": "Invalid token"}
