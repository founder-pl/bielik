"""
Documents Router - Zarządzanie bazą wiedzy
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import logging
import psycopg2
from psycopg2.extras import RealDictCursor
import os

logger = logging.getLogger(__name__)
router = APIRouter()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://bielik:bielik_dev_2024@localhost:5432/bielik_knowledge")


class Document(BaseModel):
    """Model dokumentu."""
    id: int
    title: str
    source: Optional[str]
    category: str
    content: str


class DocumentCreate(BaseModel):
    """Model tworzenia dokumentu."""
    title: str
    source: Optional[str] = None
    category: str
    content: str


class DocumentStats(BaseModel):
    """Statystyki bazy wiedzy."""
    total_documents: int
    total_chunks: int
    categories: List[dict]


@router.get("/documents", response_model=List[Document])
async def list_documents(
    category: Optional[str] = None,
    limit: int = 50
):
    """
    Lista dokumentów w bazie wiedzy.
    
    Możesz filtrować po kategorii: ksef, b2b, zus, vat
    """
    try:
        conn = psycopg2.connect(DATABASE_URL)
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if category:
                cur.execute(
                    "SELECT id, title, source, category, content FROM documents WHERE category = %s LIMIT %s",
                    (category, limit)
                )
            else:
                cur.execute(
                    "SELECT id, title, source, category, content FROM documents LIMIT %s",
                    (limit,)
                )
            results = cur.fetchall()
        conn.close()
        
        return [Document(**r) for r in results]
        
    except Exception as e:
        logger.error(f"Error listing documents: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/documents/stats", response_model=DocumentStats)
async def get_stats():
    """Statystyki bazy wiedzy."""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Liczba dokumentów
            cur.execute("SELECT COUNT(*) as count FROM documents")
            total_docs = cur.fetchone()['count']
            
            # Liczba chunków
            cur.execute("SELECT COUNT(*) as count FROM chunks")
            total_chunks = cur.fetchone()['count']
            
            # Kategorie
            cur.execute("""
                SELECT category, COUNT(*) as count 
                FROM documents 
                GROUP BY category 
                ORDER BY count DESC
            """)
            categories = cur.fetchall()
            
        conn.close()
        
        return DocumentStats(
            total_documents=total_docs,
            total_chunks=total_chunks,
            categories=[dict(c) for c in categories]
        )
        
    except Exception as e:
        logger.error(f"Error getting stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/documents/{document_id}", response_model=Document)
async def get_document(document_id: int):
    """Pobierz pojedynczy dokument."""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT id, title, source, category, content FROM documents WHERE id = %s",
                (document_id,)
            )
            result = cur.fetchone()
        conn.close()
        
        if not result:
            raise HTTPException(status_code=404, detail="Dokument nie znaleziony")
        
        return Document(**result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting document: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/documents", response_model=Document)
async def create_document(doc: DocumentCreate):
    """
    Dodaj nowy dokument do bazy wiedzy.
    
    Uwaga: W MVP embeddingi nie są automatycznie generowane.
    """
    try:
        conn = psycopg2.connect(DATABASE_URL)
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO documents (title, source, category, content)
                VALUES (%s, %s, %s, %s)
                RETURNING id, title, source, category, content
            """, (doc.title, doc.source, doc.category, doc.content))
            result = cur.fetchone()
            conn.commit()
        conn.close()
        
        return Document(**result)
        
    except Exception as e:
        logger.error(f"Error creating document: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/documents/{document_id}")
async def delete_document(document_id: int):
    """Usuń dokument z bazy wiedzy."""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        with conn.cursor() as cur:
            cur.execute("DELETE FROM documents WHERE id = %s", (document_id,))
            deleted = cur.rowcount
            conn.commit()
        conn.close()
        
        if deleted == 0:
            raise HTTPException(status_code=404, detail="Dokument nie znaleziony")
        
        return {"message": "Dokument usunięty", "id": document_id}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting document: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search")
async def search_documents(
    q: str,
    category: Optional[str] = None,
    limit: int = 10
):
    """
    Wyszukiwanie pełnotekstowe w bazie wiedzy.
    
    Przykład: /api/v1/search?q=KSeF obowiązkowy&category=ksef
    """
    try:
        conn = psycopg2.connect(DATABASE_URL)
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            sql = """
                SELECT 
                    d.id,
                    d.title,
                    d.source,
                    d.category,
                    ts_headline('simple', d.content, plainto_tsquery('simple', %s), 
                               'MaxWords=50, MinWords=20, StartSel=**, StopSel=**') as snippet,
                    ts_rank(to_tsvector('simple', d.content), plainto_tsquery('simple', %s)) as rank
                FROM documents d
                WHERE to_tsvector('simple', d.content) @@ plainto_tsquery('simple', %s)
                  AND (%s IS NULL OR d.category = %s)
                ORDER BY rank DESC
                LIMIT %s
            """
            cur.execute(sql, (q, q, q, category, category, limit))
            results = cur.fetchall()
        conn.close()
        
        return {
            "query": q,
            "results": [dict(r) for r in results],
            "count": len(results)
        }
        
    except Exception as e:
        logger.error(f"Error searching: {e}")
        raise HTTPException(status_code=500, detail=str(e))
