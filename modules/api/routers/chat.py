"""
Chat Router - Endpointy czatu z Bielikiem
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
import logging
import uuid

from services.rag import rag_service

logger = logging.getLogger(__name__)
router = APIRouter()


class ChatRequest(BaseModel):
    """Request do czatu."""
    message: str = Field(..., min_length=1, max_length=2000, description="Pytanie użytkownika")
    module: str = Field(
        default="default", 
        description="Moduł: ksef, b2b, zus, vat, default"
    )
    conversation_id: Optional[str] = Field(
        default=None, 
        description="ID konwersacji (opcjonalne)"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "message": "Kiedy KSeF będzie obowiązkowy?",
                "module": "ksef"
            }
        }


class Source(BaseModel):
    """Źródło odpowiedzi."""
    title: str
    source: str
    category: str
    similarity: float


class ChatResponse(BaseModel):
    """Odpowiedź z czatu."""
    response: str
    sources: List[Source]
    module: str
    conversation_id: str


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Główny endpoint czatu z Bielikiem.
    
    Wysyła pytanie do modelu LLM z kontekstem z bazy wiedzy (RAG).
    
    **Moduły:**
    - `ksef` - Krajowy System e-Faktur
    - `b2b` - Umowy B2B, ryzyko PIP
    - `zus` - Składki ZUS, ubezpieczenia
    - `vat` - JPK, VAT OSS
    - `default` - Ogólne pytania
    """
    try:
        # Walidacja modułu
        valid_modules = ["ksef", "b2b", "zus", "vat", "default"]
        if request.module not in valid_modules:
            request.module = "default"
        
        logger.info(f"Chat request: {request.module} - {request.message[:50]}...")
        
        # Wywołaj RAG
        result = rag_service.chat(
            message=request.message,
            module=request.module
        )
        
        # Przygotuj odpowiedź
        return ChatResponse(
            response=result["response"],
            sources=[Source(**s) for s in result["sources"]],
            module=result["module"],
            conversation_id=request.conversation_id or str(uuid.uuid4())
        )
        
    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(
            status_code=500, 
            detail=f"Błąd przetwarzania: {str(e)}"
        )


@router.get("/modules")
async def get_modules():
    """Zwraca listę dostępnych modułów."""
    return {
        "modules": [
            {
                "id": "default",
                "name": "💬 Ogólne",
                "description": "Ogólne pytania o prowadzenie firmy w Polsce"
            },
            {
                "id": "ksef",
                "name": "📄 KSeF",
                "description": "Krajowy System e-Faktur - terminy, wymagania, procedury"
            },
            {
                "id": "b2b",
                "name": "💼 B2B vs Etat",
                "description": "Umowy B2B, ryzyko przekwalifikowania, kryteria PIP"
            },
            {
                "id": "zus",
                "name": "🏥 ZUS/Składki",
                "description": "Składki społeczne i zdrowotne, terminy, obliczenia"
            },
            {
                "id": "vat",
                "name": "💰 VAT/JPK",
                "description": "JPK_VAT, VAT OSS, rozliczenia podatkowe"
            }
        ]
    }


@router.post("/chat/simple")
async def simple_chat(message: str, module: str = "default"):
    """
    Uproszczony endpoint czatu (query params).
    
    Przykład: POST /api/v1/chat/simple?message=Co to KSeF?&module=ksef
    """
    request = ChatRequest(message=message, module=module)
    return await chat(request)
