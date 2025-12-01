"""
RAG Service - Retrieval-Augmented Generation
Wyszukiwanie w bazie wiedzy + generacja odpowiedzi z Bielikiem
"""
import os
import logging
import requests
from typing import List, Optional, Dict, Any
import psycopg2
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)

# Konfiguracja z zmiennych środowiskowych
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://bielik:bielik_dev_2024@localhost:5432/bielik_knowledge")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "mwiewior/bielik")

# System prompts dla każdego modułu
SYSTEM_PROMPTS = {
    "ksef": """Jesteś ekspertem od Krajowego Systemu e-Faktur (KSeF). 
Odpowiadasz precyzyjnie na pytania o:
- Terminy wdrożenia KSeF (luty/kwiecień 2026)
- Wymagania techniczne (API, XML, autoryzacja)
- Kary i sankcje
- Procedury awaryjne
Zawsze podawaj konkretne daty i przepisy. Jeśli nie jesteś pewien, powiedz to wprost.""",

    "b2b": """Jesteś ekspertem prawa pracy specjalizującym się w umowach B2B.
Pomagasz ocenić ryzyko przekwalifikowania umowy B2B na etat według:
- Art. 22 Kodeksu pracy
- Kryteriów Państwowej Inspekcji Pracy
- Nowych uprawnień PIP od 2026
Ostrzegaj przed czerwonymi flagami i sugeruj zabezpieczenia.""",

    "zus": """Jesteś ekspertem od składek ZUS i ubezpieczeń społecznych.
Pomagasz z:
- Obliczaniem składek (pełny ZUS, mały ZUS+, preferencyjny)
- Składką zdrowotną (ryczałt, liniowy, skala)
- Zmianami od 2026
- Terminami i deklaracjami
Podawaj konkretne kwoty i wzory na obliczenia.""",

    "vat": """Jesteś ekspertem od podatku VAT.
Pomagasz z:
- JPK_VAT (struktura, terminy, oznaczenia GTU)
- VAT OSS/IOSS dla sprzedaży międzynarodowej
- Stawkami VAT w Polsce i UE
- Korektami i procedurami
Zawsze sprawdzaj aktualność stawek i terminów.""",

    "default": """Jesteś Bielikiem - polskim asystentem AI dla przedsiębiorców.
Odpowiadasz na pytania dotyczące:
- Prawa podatkowego w Polsce
- Składek ZUS i ubezpieczeń
- Umów B2B i prawa pracy
- E-administracji (KSeF, JPK, e-Doręczenia)
Jeśli nie znasz odpowiedzi, powiedz to wprost i zasugeruj źródła."""
}


class RAGService:
    """Serwis RAG z bazą wiedzy prawnej."""
    
    def __init__(self):
        self.db_url = DATABASE_URL
        self.ollama_url = OLLAMA_URL
        self.model = OLLAMA_MODEL
        logger.info(f"RAG Service initialized: model={self.model}, ollama={self.ollama_url}")
    
    def get_db_connection(self):
        """Pobiera połączenie do bazy danych."""
        return psycopg2.connect(self.db_url)
    
    def get_embedding(self, text: str) -> List[float]:
        """Pobiera embedding dla tekstu z Ollama."""
        try:
            # Ogranicz długość tekstu
            text = text[:2000]
            
            response = requests.post(
                f"{self.ollama_url}/api/embeddings",
                json={
                    "model": self.model,
                    "prompt": text
                },
                timeout=30
            )
            response.raise_for_status()
            
            embedding = response.json().get("embedding", [])
            logger.debug(f"Got embedding of size {len(embedding)}")
            return embedding
            
        except Exception as e:
            logger.error(f"Error getting embedding: {e}")
            return []
    
    def search_similar(
        self, 
        query: str, 
        category: Optional[str] = None, 
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """Wyszukuje podobne dokumenty w bazie wiedzy."""
        
        embedding = self.get_embedding(query)
        
        if not embedding:
            logger.warning("Empty embedding, falling back to text search")
            return self._text_search(query, category, limit)
        
        try:
            conn = self.get_db_connection()
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Sprawdź czy mamy embeddingi w bazie
                cur.execute("SELECT COUNT(*) FROM chunks WHERE embedding IS NOT NULL")
                count = cur.fetchone()['count']
                
                if count == 0:
                    logger.warning("No embeddings in database, using text search")
                    conn.close()
                    return self._text_search(query, category, limit)
                
                # Wyszukiwanie wektorowe
                sql = """
                    SELECT 
                        c.id as chunk_id,
                        c.content,
                        d.title,
                        d.source,
                        d.category,
                        1 - (c.embedding <=> %s::vector) as similarity
                    FROM chunks c
                    JOIN documents d ON c.document_id = d.id
                    WHERE c.embedding IS NOT NULL
                      AND (%s IS NULL OR d.category = %s)
                    ORDER BY c.embedding <=> %s::vector
                    LIMIT %s
                """
                cur.execute(sql, (embedding, category, category, embedding, limit))
                results = cur.fetchall()
                
            conn.close()
            return [dict(r) for r in results]
            
        except Exception as e:
            logger.error(f"Error in vector search: {e}")
            return self._text_search(query, category, limit)
    
    def _text_search(
        self, 
        query: str, 
        category: Optional[str] = None, 
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """Fallback: wyszukiwanie pełnotekstowe."""
        try:
            conn = self.get_db_connection()
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Najpierw spróbuj full-text search
                sql = """
                    SELECT 
                        c.id as chunk_id,
                        c.content,
                        d.title,
                        d.source,
                        d.category,
                        ts_rank(to_tsvector('simple', c.content), 
                                plainto_tsquery('simple', %s)) as similarity
                    FROM chunks c
                    JOIN documents d ON c.document_id = d.id
                    WHERE (%s IS NULL OR d.category = %s)
                      AND to_tsvector('simple', c.content) @@ plainto_tsquery('simple', %s)
                    ORDER BY similarity DESC
                    LIMIT %s
                """
                cur.execute(sql, (query, category, category, query, limit))
                results = cur.fetchall()
                
                # Jeśli brak wyników, zwróć wszystkie dokumenty z kategorii
                if not results:
                    sql = """
                        SELECT 
                            c.id as chunk_id,
                            c.content,
                            d.title,
                            d.source,
                            d.category,
                            0.5 as similarity
                        FROM chunks c
                        JOIN documents d ON c.document_id = d.id
                        WHERE (%s IS NULL OR d.category = %s)
                        LIMIT %s
                    """
                    cur.execute(sql, (category, category, limit))
                    results = cur.fetchall()
                    
                    # Jeśli nadal brak, pobierz bezpośrednio z documents
                    if not results:
                        sql = """
                            SELECT 
                                d.id as chunk_id,
                                d.content,
                                d.title,
                                d.source,
                                d.category,
                                0.5 as similarity
                            FROM documents d
                            WHERE (%s IS NULL OR d.category = %s)
                            LIMIT %s
                        """
                        cur.execute(sql, (category, category, limit))
                        results = cur.fetchall()
                
            conn.close()
            return [dict(r) for r in results]
            
        except Exception as e:
            logger.error(f"Error in text search: {e}")
            return []
    
    def generate_response(
        self, 
        query: str, 
        context: List[Dict[str, Any]], 
        module: str = "default"
    ) -> str:
        """Generuje odpowiedź z kontekstem."""
        
        # Przygotuj kontekst
        if context:
            context_text = "\n\n---\n\n".join([
                f"📄 {doc.get('title', 'Dokument')} ({doc.get('source', 'brak źródła')}):\n{doc.get('content', '')[:1500]}"
                for doc in context
            ])
        else:
            context_text = "Brak dokumentów w bazie wiedzy dla tego tematu."
        
        # System prompt
        system_prompt = SYSTEM_PROMPTS.get(module, SYSTEM_PROMPTS["default"])
        
        # Pełny prompt
        full_prompt = f"""{system_prompt}

══════════════════════════════════════════
KONTEKST Z BAZY WIEDZY:
══════════════════════════════════════════
{context_text}

══════════════════════════════════════════
PYTANIE UŻYTKOWNIKA:
══════════════════════════════════════════
{query}

══════════════════════════════════════════
TWOJA ODPOWIEDŹ:
══════════════════════════════════════════
Odpowiedz na podstawie powyższego kontekstu. Bądź konkretny i pomocny.
Jeśli nie masz pewności lub brakuje informacji w kontekście, powiedz to wprost.
"""

        try:
            response = requests.post(
                f"{self.ollama_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": full_prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.3,
                        "num_predict": 1500,
                        "top_p": 0.9,
                        "repeat_penalty": 1.1
                    }
                },
                timeout=120
            )
            response.raise_for_status()
            
            result = response.json()
            return result.get("response", "Przepraszam, nie udało się wygenerować odpowiedzi.")
            
        except requests.exceptions.Timeout:
            logger.error("Timeout waiting for Ollama response")
            return "Przepraszam, generowanie odpowiedzi trwa zbyt długo. Spróbuj ponownie z krótszym pytaniem."
        except Exception as e:
            logger.error(f"Error generating response: {e}")
            return f"Przepraszam, wystąpił błąd: {str(e)}"
    
    def chat(
        self, 
        message: str, 
        module: str = "default"
    ) -> Dict[str, Any]:
        """Główna metoda czatu - wyszukuje kontekst i generuje odpowiedź."""
        
        logger.info(f"Chat request: module={module}, message={message[:50]}...")
        
        # Mapowanie modułu na kategorię
        category = module if module != "default" else None
        
        # 1. Wyszukaj podobne dokumenty
        context = self.search_similar(
            query=message,
            category=category,
            limit=5
        )
        
        logger.info(f"Found {len(context)} context documents")
        
        # 2. Wygeneruj odpowiedź
        response = self.generate_response(
            query=message,
            context=context,
            module=module
        )
        
        # 3. Przygotuj źródła
        sources = [
            {
                "title": doc.get("title", "Dokument"),
                "source": doc.get("source", "brak źródła"),
                "category": doc.get("category", ""),
                "similarity": round(float(doc.get("similarity", 0)), 3)
            }
            for doc in context
        ]
        
        return {
            "response": response,
            "sources": sources,
            "module": module
        }


# Singleton instance
rag_service = RAGService()
