#!/usr/bin/env python3
"""Prosty generator dokumentacji OpenAPI dla Bielik API.

Uruchomienie:

    python scripts/generate_api_docs.py          # jednorazowo
    python scripts/generate_api_docs.py --watch  # tryb watch (regeneracja przy zmianach w modules/api)
"""

import json
import sys
import time
from pathlib import Path
from typing import Dict, List


REPO_ROOT = Path(__file__).resolve().parent.parent

# Upewnij się, że katalog główny repo jest na sys.path,
# aby import "modules.api.main" działał niezależnie od miejsca uruchomienia.
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from modules.api.main import app


DOCS_DIR = REPO_ROOT / "docs"
WATCH_DIRS = [REPO_ROOT / "modules" / "api"]


def generate() -> None:
    """Wygeneruj plik docs/openapi.json na podstawie schematu FastAPI."""
    DOCS_DIR.mkdir(exist_ok=True)
    schema = app.openapi()
    out_path = DOCS_DIR / "openapi.json"
    out_path.write_text(
        json.dumps(schema, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    rel = out_path.relative_to(REPO_ROOT)
    print(f"[docs] Wygenerowano {rel}")


def _snapshot() -> Dict[str, float]:
    """Zrób snapshot czasów modyfikacji plików w katalogach WATCH_DIRS."""
    mtimes: Dict[str, float] = {}
    for base in WATCH_DIRS:
        if not base.exists():
            continue
        for path in base.rglob("*.py"):
            try:
                mtimes[str(path)] = path.stat().st_mtime
            except FileNotFoundError:
                # Plik mógł zostać usunięty między iteracją a stat()
                continue
    return mtimes


def watch(interval: float = 2.0) -> None:
    """Prosty watcher: regeneruje OpenAPI przy zmianach w modules/api.

    Nie wymaga dodatkowych zależności (polling co `interval` sekund).
    """

    print("[docs] Tryb watch: obserwuję zmiany w modules/api/**/*.py")
    previous = _snapshot()
    generate()

    while True:
        time.sleep(interval)
        current = _snapshot()
        if current != previous:
            print("[docs] Wykryto zmiany w modules/api, regeneruję dokumentację API...")
            generate()
            previous = current


def main(argv: List[str]) -> None:
    if "--watch" in argv:
        watch()
    else:
        generate()


if __name__ == "__main__":
    main(sys.argv[1:])
