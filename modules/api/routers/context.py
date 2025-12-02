"""Context Router - hierarchical context: Contact -> Projects -> Files -> Channels
Includes Nextcloud integration for e-Doręczenia messages context.
"""
from typing import Optional, List, Dict, Any
import logging
import os
import requests

from fastapi import APIRouter, HTTPException, Query
import psycopg2
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)
router = APIRouter()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://bielik:bielik_dev_2024@localhost:5432/bielik_knowledge")

# Nextcloud integration
NEXTCLOUD_URL = os.getenv("NEXTCLOUD_URL", "http://localhost:8090")
NEXTCLOUD_USER = os.getenv("NEXTCLOUD_USER", "admin")
NEXTCLOUD_PASSWORD = os.getenv("NEXTCLOUD_PASSWORD", "admin")
NEXTCLOUD_EDORECZENIA_FOLDER = os.getenv("NEXTCLOUD_FOLDER", "/e-Doreczenia")


MODULES = [
    {"id": "default", "name": "Ogólne"},
    {"id": "ksef", "name": "KSeF"},
    {"id": "b2b", "name": "B2B"},
    {"id": "zus", "name": "ZUS"},
    {"id": "vat", "name": "VAT"},
]


def _get_connection():
    return psycopg2.connect(DATABASE_URL)


def _get_project(project_id: int) -> Optional[Dict[str, Any]]:
    try:
        conn = _get_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT id, name, description, contact FROM projects WHERE id = %s",
                (project_id,),
            )
            row = cur.fetchone()
        conn.close()
        return dict(row) if row else None
    except Exception as e:
        logger.error(f"Error getting project {project_id}: {e}")
        return None


def _get_project_file(file_id: int) -> Optional[Dict[str, Any]]:
    try:
        conn = _get_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT id, project_id, filename, path FROM project_files WHERE id = %s",
                (file_id,),
            )
            row = cur.fetchone()
        conn.close()
        return dict(row) if row else None
    except Exception as e:
        logger.error(f"Error getting project file {file_id}: {e}")
        return None


def _recommend_channels(contact: Optional[str], project: Optional[Dict[str, Any]], project_file: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Prosta heurystyka doboru kanałów na podstawie nazwy projektu/pliku."""
    text = " ".join(
        [
            contact or "",
            (project or {}).get("name", ""),
            (project or {}).get("description", ""),
            (project_file or {}).get("filename", ""),
            (project_file or {}).get("path", ""),
        ]
    ).lower()

    recommended_ids = set(["default"])

    if any(k in text for k in ["ksef", "e-fakt", "faktura"]):
        recommended_ids.add("ksef")
    if any(k in text for k in ["umowa", "b2b", "kontrakt", "sprzeda"]):
        recommended_ids.add("b2b")
    if any(k in text for k in ["zus", "składk", "ubezpiecze"]):
        recommended_ids.add("zus")
    if any(k in text for k in ["vat", "jpk", "oss"]):
        recommended_ids.add("vat")

    return [m for m in MODULES if m["id"] in recommended_ids]


@router.get("/context/channels")
async def get_context_channels(
    contact: Optional[str] = Query(default=None, description="Nazwa kontaktu / kontrahenta"),
    project_id: Optional[int] = Query(default=None, description="ID projektu"),
    file_id: Optional[int] = Query(default=None, description="ID pliku projektu"),
):
    """Zwraca rekomendowane kanały (moduły) w kontekście Kontakt -> Projekt -> Plik.

    Kanały są wyliczane heurystycznie na podstawie nazw i opisów projektu/plików.
    """
    try:
        project = _get_project(project_id) if project_id is not None else None
        project_file = _get_project_file(file_id) if file_id is not None else None

        channels = _recommend_channels(contact, project, project_file)

        return {
            "contact": contact,
            "project": project,
            "file": project_file,
            "channels": channels,
        }
    except Exception as e:
        logger.error(f"Error getting context channels: {e}")
        raise HTTPException(status_code=500, detail="Nie udało się wyliczyć kanałów kontekstowych")


@router.get("/context/hierarchy")
async def get_context_hierarchy():
    """Zwraca pełną hierarchię: Kontakty -> Projekty -> Pliki (JSON).

    Struktura:
    {
      "contacts": [
        {
          "name": "Kontrahent",
          "projects": [
            {
              "id": 1,
              "name": "Umowa sprzedaży",
              "description": "...",
              "files": [ {"id": 10, "filename": "umowa.pdf", "path": "..."}, ... ]
            }
          ]
        },
        ...
      ]
    }
    """
    try:
        conn = _get_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Pobierz wszystkie projekty
            cur.execute(
                "SELECT id, name, description, contact FROM projects ORDER BY contact, id DESC"
            )
            projects = [dict(r) for r in cur.fetchall()]

            # Pobierz wszystkie pliki
            cur.execute(
                "SELECT id, project_id, filename, path FROM project_files ORDER BY id"
            )
            files = [dict(r) for r in cur.fetchall()]
        conn.close()

        files_by_project: Dict[int, List[Dict[str, Any]]] = {}
        for f in files:
            files_by_project.setdefault(f["project_id"], []).append(
                {
                    "id": f["id"],
                    "filename": f.get("filename"),
                    "path": f.get("path"),
                }
            )

        contacts_map: Dict[str, Dict[str, Any]] = {}
        for p in projects:
            contact_name = p.get("contact") or "Inne";
            if contact_name not in contacts_map:
                contacts_map[contact_name] = {"name": contact_name, "projects": []}

            contacts_map[contact_name]["projects"].append(
                {
                    "id": p["id"],
                    "name": p.get("name"),
                    "description": p.get("description"),
                    "files": files_by_project.get(p["id"], []),
                }
            )

        contacts_list = list(contacts_map.values())

        return {"contacts": contacts_list}

    except Exception as e:
        logger.error(f"Error getting context hierarchy: {e}")
        raise HTTPException(status_code=500, detail="Nie udało się pobrać hierarchii kontekstu")


# ═══════════════════════════════════════════════════════════════
# NEXTCLOUD INTEGRATION - e-Doręczenia context
# ═══════════════════════════════════════════════════════════════

def _get_nextcloud_files(folder: str = "") -> List[Dict[str, Any]]:
    """Pobierz listę plików z Nextcloud WebDAV."""
    try:
        url = f"{NEXTCLOUD_URL}/remote.php/dav/files/{NEXTCLOUD_USER}{NEXTCLOUD_EDORECZENIA_FOLDER}{folder}"
        response = requests.request(
            "PROPFIND",
            url,
            auth=(NEXTCLOUD_USER, NEXTCLOUD_PASSWORD),
            headers={"Depth": "1"},
            timeout=10
        )
        
        if response.status_code in [200, 207]:
            # Parse WebDAV response (simplified)
            files = []
            import re
            hrefs = re.findall(r'<d:href>([^<]+)</d:href>', response.text)
            for href in hrefs[1:]:  # Skip first (folder itself)
                filename = href.split('/')[-1] or href.split('/')[-2]
                files.append({
                    "path": href,
                    "filename": filename,
                    "folder": folder
                })
            return files
        return []
    except Exception as e:
        logger.error(f"Error getting Nextcloud files: {e}")
        return []


@router.get("/context/nextcloud")
async def get_nextcloud_context(
    folder: Optional[str] = Query(default="", description="Subfolder w e-Doreczenia (INBOX, SENT, etc.)"),
    user_nip: Optional[str] = Query(default=None, description="NIP użytkownika dla kontekstu"),
    user_company: Optional[str] = Query(default=None, description="Nazwa firmy użytkownika"),
):
    """
    Pobierz kontekst z Nextcloud - wiadomości e-Doręczeń użytkownika.
    
    Struktura folderów:
    - /e-Doreczenia/INBOX - wiadomości odebrane
    - /e-Doreczenia/SENT - wiadomości wysłane
    - /e-Doreczenia/DRAFTS - szkice
    - /e-Doreczenia/ARCHIVE - archiwum
    
    AI Detax używa tego kontekstu do personalizowanych odpowiedzi.
    """
    try:
        # Pobierz pliki z Nextcloud
        files = _get_nextcloud_files(f"/{folder}" if folder else "")
        
        # Pobierz strukturę folderów
        folders = []
        for f in ["INBOX", "SENT", "DRAFTS", "ARCHIVE", "TRASH"]:
            folder_files = _get_nextcloud_files(f"/{f}")
            folders.append({
                "name": f,
                "count": len(folder_files),
                "files": folder_files[:5]  # Limit do 5 plików
            })
        
        return {
            "status": "connected",
            "nextcloud_url": NEXTCLOUD_URL,
            "edoreczenia_folder": NEXTCLOUD_EDORECZENIA_FOLDER,
            "user_context": {
                "nip": user_nip,
                "company": user_company,
            },
            "folders": folders,
            "files": files[:20],  # Limit
            "ai_context_available": True,
            "message": "Kontekst e-Doręczeń dostępny dla AI"
        }
    except Exception as e:
        logger.error(f"Error getting Nextcloud context: {e}")
        return {
            "status": "disconnected",
            "error": str(e),
            "ai_context_available": False
        }


@router.get("/context/user/{user_id}")
async def get_user_context(
    user_id: str,
    nip: Optional[str] = Query(default=None),
    company: Optional[str] = Query(default=None),
    ade_address: Optional[str] = Query(default=None),
):
    """
    Pobierz pełny kontekst użytkownika dla AI.
    
    Łączy dane z:
    - IDCard.pl (dane firmy, aliasy email)
    - Szyfromat.pl (wiadomości e-Doręczeń)
    - Nextcloud (pliki, historia korespondencji)
    
    AI używa tego kontekstu do personalizowanych odpowiedzi.
    """
    try:
        # Pobierz kontekst z Nextcloud
        nextcloud_files = _get_nextcloud_files("/INBOX")
        
        # Rekomenduj moduły na podstawie kontekstu
        context_text = f"{company or ''} {nip or ''} {ade_address or ''}"
        recommended_modules = _recommend_channels(company, None, None)
        
        return {
            "user_id": user_id,
            "company": {
                "name": company,
                "nip": nip,
                "ade_address": ade_address,
            },
            "email_context": {
                "inbox_count": len(nextcloud_files),
                "recent_messages": nextcloud_files[:5],
                "source": "nextcloud"
            },
            "recommended_modules": recommended_modules,
            "ai_features": [
                "Odpowiedzi w kontekście Twojej firmy",
                "Analiza wiadomości e-Doręczeń",
                "Personalizowane porady prawne",
                "Historia korespondencji z urzędami"
            ],
            "status": "ready"
        }
    except Exception as e:
        logger.error(f"Error getting user context: {e}")
        raise HTTPException(status_code=500, detail=str(e))
