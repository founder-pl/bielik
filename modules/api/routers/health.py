"""
Health Router - Sprawdzanie stanu serwisów
"""
from fastapi import APIRouter
import logging
import requests
import psycopg2
import os

logger = logging.getLogger(__name__)
router = APIRouter()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://bielik:bielik_dev_2024@localhost:5432/bielik_knowledge")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")


@router.get("/health")
async def health_check():
    """
    Sprawdza stan wszystkich serwisów.
    
    Zwraca status: healthy/degraded/unhealthy
    """
    status = {
        "api": "healthy",
        "database": "unknown",
        "ollama": "unknown",
        "model": "unknown"
    }
    
    # Sprawdź bazę danych
    try:
        conn = psycopg2.connect(DATABASE_URL, connect_timeout=5)
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        conn.close()
        status["database"] = "healthy"
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        status["database"] = "unhealthy"
    
    # Sprawdź Ollama
    try:
        response = requests.get(f"{OLLAMA_URL}/", timeout=5)
        if response.status_code == 200:
            status["ollama"] = "healthy"
        else:
            status["ollama"] = "degraded"
    except Exception as e:
        logger.error(f"Ollama health check failed: {e}")
        status["ollama"] = "unhealthy"
    
    # Sprawdź model Bielik
    try:
        response = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        if response.status_code == 200:
            models = response.json().get("models", [])
            model_names = [m.get("name", "") for m in models]
            
            # Szukaj Bielika
            bielik_found = any("bielik" in name.lower() for name in model_names)
            
            if bielik_found:
                status["model"] = "healthy"
            else:
                status["model"] = "not_loaded"
        else:
            status["model"] = "unknown"
    except Exception as e:
        logger.error(f"Model health check failed: {e}")
        status["model"] = "unknown"
    
    # Określ ogólny status
    if all(v == "healthy" for v in status.values()):
        overall = "healthy"
    elif status["database"] == "unhealthy" or status["ollama"] == "unhealthy":
        overall = "unhealthy"
    else:
        overall = "degraded"
    
    return {
        "status": overall,
        "services": status
    }


@router.get("/health/db")
async def db_health():
    """Szczegółowy health check bazy danych."""
    try:
        conn = psycopg2.connect(DATABASE_URL, connect_timeout=5)
        with conn.cursor() as cur:
            # Sprawdź tabele
            cur.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
            """)
            tables = [r[0] for r in cur.fetchall()]
            
            # Sprawdź liczby rekordów
            stats = {}
            for table in ['documents', 'chunks', 'conversations']:
                if table in tables:
                    cur.execute(f"SELECT COUNT(*) FROM {table}")
                    stats[table] = cur.fetchone()[0]
            
            # Sprawdź pgvector
            cur.execute("SELECT extname FROM pg_extension WHERE extname = 'vector'")
            pgvector = cur.fetchone() is not None
            
        conn.close()
        
        return {
            "status": "healthy",
            "tables": tables,
            "record_counts": stats,
            "pgvector_enabled": pgvector
        }
        
    except Exception as e:
        logger.error(f"DB health check failed: {e}")
        return {
            "status": "unhealthy",
            "error": str(e)
        }


@router.get("/health/ollama")
async def ollama_health():
    """Szczegółowy health check Ollama."""
    try:
        # Podstawowy status
        response = requests.get(f"{OLLAMA_URL}/", timeout=5)
        
        # Lista modeli
        models_response = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        models = []
        bielik_loaded = False
        
        if models_response.status_code == 200:
            models_data = models_response.json().get("models", [])
            models = [
                {
                    "name": m.get("name"),
                    "size": m.get("size"),
                    "modified": m.get("modified_at")
                }
                for m in models_data
            ]
            bielik_loaded = any("bielik" in m["name"].lower() for m in models)
        
        return {
            "status": "healthy" if response.status_code == 200 else "degraded",
            "url": OLLAMA_URL,
            "models": models,
            "bielik_loaded": bielik_loaded
        }
        
    except Exception as e:
        logger.error(f"Ollama health check failed: {e}")
        return {
            "status": "unhealthy",
            "error": str(e)
        }
