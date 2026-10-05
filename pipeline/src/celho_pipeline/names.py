"""Pulizia e normalizzazione dei nomi delle carte.

`norm` è la chiave di confronto. Il frontend deve riprodurla esattamente: i vettori di prova
condivisi sono in tests/fixtures/norm_vectors.json.
"""

import re
import unicodedata

_APOSTROPHES = str.maketrans({"’": "'", "‘": "'", "`": "'", "´": "'", "ʼ": "'"})
_LIGATURES = str.maketrans({"æ": "ae", "Æ": "Ae", "œ": "oe", "Œ": "Oe"})
_SPACES = re.compile(r"\s+")

_QTY = re.compile(r"^\d+\s*x?\s+(?=\S)", re.IGNORECASE)
_SET_PREFIX = re.compile(r"^\[[^\]]{1,8}\]\s*")


def norm(name: str) -> str:
    """Chiave di confronto: senza diacritici, apostrofi uniformi, spazi compressi, casefold."""
    s = unicodedata.normalize("NFKD", (name or "").translate(_LIGATURES))
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.translate(_APOSTROPHES)
    return _SPACES.sub(" ", s).strip().casefold()


def clean(raw: str) -> str:
    """Toglie i prefissi di quantità e di set ("4 Galvanic Blast", "[BOK] Ninja ...")."""
    s = _SPACES.sub(" ", raw or "").strip()
    for _ in range(2):  # "[BOK] 4 Nome" o "4 [BOK] Nome"
        s = _SET_PREFIX.sub("", s)
        s = _QTY.sub("", s)
    s = s.replace(" && ", " // ")
    return s.strip()


def split_faces(name: str) -> list[str]:
    """"A // B" -> ["A", "B"]; accetta anche la barra singola tra spazi ("A / B")."""
    parts = re.split(r"\s*//\s*|\s+/\s+", name)
    return [p for p in (x.strip() for x in parts) if p]
