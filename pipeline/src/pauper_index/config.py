"""Percorsi e parametri. I default seguono docs/SPEC.md; vedi CLAUDE.md per le decisioni."""

import os
from pathlib import Path

ROOT = Path(os.environ.get("PAUPER_INDEX_ROOT") or Path(__file__).resolve().parents[3])

CACHE = ROOT / ".cache"
SOURCE_DIR = CACHE / "source"
SCRYFALL_CACHE = CACHE / "scryfall"
API_CACHE = SCRYFALL_CACHE / "api"

DATA = ROOT / "data"
MANUAL = DATA / "manual"
REVIEWS = DATA / "reviews"
SNAPSHOTS = DATA / "snapshots"
BASELINE_DIR = ROOT / "baseline"

SOURCE_URL = os.environ.get("PAUPER_INDEX_SOURCE_URL", "https://github.com/Jiliac/MTGODecklistCache.git")
SOURCE_BRANCH = os.environ.get("PAUPER_INDEX_SOURCE_BRANCH", "master")
SPARSE_PATTERNS = (
    "/Tournaments/**/*[Pp]auper*.json",
    "/Tournaments-Archive/**/*[Pp]auper*.json",
)

USER_AGENT = "PauperIndex/0.1 (pipeline dati Pauper, uso non commerciale)"
SCRYFALL_DELAY = 0.1  # secondi tra due richieste API

WINDOWS = (61, 365, 730, None)  # None = storico
NEW_SET_DAYS = 60
RELEVANT_SET_MIN_CARDS = 5
STALE_SOURCE_DAYS = 21
