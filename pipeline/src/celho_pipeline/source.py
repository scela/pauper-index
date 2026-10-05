"""MTGODecklistCache: clone sparse, lettura dei tornei Pauper, classificazione.

Non conserva mai `Player` né `AnchorUri`, che contengono i nomi dei giocatori.
"""

import datetime as dt
import json
import os
import re
import subprocess
from array import array
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

from . import config

TOP_DIRS = ("Tournaments", "Tournaments-Archive")
# Parola intera nel nome del file: "pauper-cube-..." sì, "...-cubecon-dmv-..." (una convention) no.
EXCLUDED_NAME = re.compile(r"(?:^|[-_ .])(?:cube|limited|draft|sealed|2hg)(?=[-_ .]|$)", re.IGNORECASE)

# Famiglie di cartelle che sono copie della stessa fonte, in ordine di precedenza.
FAMILIES = {
    "mtgo": ("mtgo.com_limited_data", "mtgo.com", "mtgo.com_before_new_data_model", "magic.wizards.com"),
    "melee": ("melee.gg", "melee.gg_manual_scraping"),
}
_FOLDER_FAMILY = {f: fam for fam, folders in FAMILIES.items() for f in folders}
_HOST_FAMILY = (("mtgo.com", "mtgo"), ("magic.wizards.com", "mtgo"), ("melee.gg", "melee"))
MTGO_HOSTS = ("mtgo.com", "magic.wizards.com", "manatraders.com")

_RANK = re.compile(r"^(\d+)(?:st|nd|rd|th)\s+place$", re.IGNORECASE)
_RECORD = re.compile(r"^\d+-\d+(?:-\d+)?$")


@dataclass(slots=True)
class Deck:
    day: int  # date.toordinal()
    result: int | str | None
    main: array  # coppie piatte (id_nome, copie), unsigned short
    side: array
    fp: int = 0  # impronta dopo la risoluzione dei nomi


@dataclass(slots=True)
class Tournament:
    folder: str
    rel: str
    name: str
    uri: str
    day: int
    kind: str  # "m" = MTGO, "p" = cartaceo e altre piattaforme
    family: str
    archive: bool
    decks: list[Deck] = field(default_factory=list)


class NameTable:
    """Interning dei nomi grezzi: ogni nome distinto ha un id intero."""

    def __init__(self):
        self.ids: dict[str, int] = {}
        self.names: list[str] = []

    def id(self, name: str) -> int:
        i = self.ids.get(name)
        if i is None:
            i = self.ids[name] = len(self.names)
            self.names.append(name)
        return i


def parse_day(s: str | None) -> int | None:
    if not s:
        return None
    try:
        return dt.date.fromisoformat(s[:10]).toordinal()
    except ValueError:
        return None


def normalize_result(r) -> int | str | None:
    s = str(r or "").strip()
    if not s:
        return None
    m = _RANK.match(s)
    if m:
        return int(m.group(1))
    return s


def host(uri: str) -> str:
    h = urlparse(uri or "").hostname or ""
    return h.removeprefix("www.")


def classify(folder: str, uri: str) -> tuple[str, str]:
    """-> (famiglia per la deduplica, tipo "m"/"p")."""
    h = host(uri)
    kind = "m" if any(h == x or h.endswith("." + x) for x in MTGO_HOSTS) else "p"
    family = _FOLDER_FAMILY.get(folder, folder)
    if folder == "mtgo.com_limited_data" and kind == "p":
        family = next((fam for x, fam in _HOST_FAMILY if h.endswith(x)), h or folder)
    return family, kind


def precedence(t: Tournament) -> tuple:
    """Ordine di preferenza: cartelle attive, copia nella cartella "nativa", ordine della famiglia."""
    order = FAMILIES.get(t.family, (t.folder,))
    native = t.folder in order
    return (t.archive, not native, order.index(t.folder) if native else 99, t.rel)


def iter_files(root: Path):
    for top in TOP_DIRS:
        base = root / top
        for dp, _, fns in os.walk(base):
            for fn in fns:
                low = fn.lower()
                if low.endswith(".json") and "pauper" in low and not EXCLUDED_NAME.search(fn):
                    yield Path(dp) / fn


def excluded_files(root: Path) -> list[str]:
    out = []
    for top in TOP_DIRS:
        for _, _, fns in os.walk(root / top):
            out +=[fn for fn in fns if "pauper" in fn.lower() and EXCLUDED_NAME.search(fn)]
    return sorted(out)


def _cards(items, names: NameTable) -> array:
    a = array("H")
    for it in items or ():
        n = it.get("CardName")
        c = it.get("Count")
        if not n or not isinstance(c, int) or c <= 0:
            continue
        a.append(names.id(n))
        a.append(min(c, 65535))
    return a


def load_tournament(path: Path, root: Path, names: NameTable) -> Tournament | None:
    rel = path.relative_to(root).as_posix()
    parts = rel.split("/")
    with open(path, encoding="utf-8-sig") as f:
        j = json.load(f)
    t = j.get("Tournament") or {}
    day = parse_day(t.get("Date"))
    if day is None:
        return None
    uri = t.get("Uri") or ""
    family, kind = classify(parts[1], uri)
    tour = Tournament(parts[1], rel, (t.get("Name") or "").strip(), uri, day, kind, family,
                      parts[0] == "Tournaments-Archive")
    for d in j.get("Decks") or []:
        main = _cards(d.get("Mainboard"), names)
        side = _cards(d.get("Sideboard"), names)
        if not main and not side:
            continue
        tour.decks.append(Deck(parse_day(d.get("Date")) or day, normalize_result(d.get("Result")), main, side))
    return tour


def load_all(root: Path = config.SOURCE_DIR) -> tuple[list[Tournament], NameTable]:
    names = NameTable()
    out = []
    for p in iter_files(root):
        t = load_tournament(p, root, names)
        if t is not None:
            out.append(t)
    out.sort(key=lambda t: (t.day, t.rel))
    return out, names


def _git(*args: str, cwd: Path | None = None) -> str:
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout


def ensure_source(dest: Path = config.SOURCE_DIR, url: str = config.SOURCE_URL,
                  branch: str = config.SOURCE_BRANCH) -> dict:
    """Clone sparse (non-cone) o aggiornamento dell'esistente. Restituisce commit e data."""
    if not (dest / ".git").exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        _git("clone", "--filter=blob:none", "--no-checkout", "--depth", "1", "--branch", branch, url, str(dest))
        _git("sparse-checkout", "init", "--no-cone", cwd=dest)
    sparse = dest / ".git" / "info" / "sparse-checkout"
    sparse.write_text("\n".join(config.SPARSE_PATTERNS) + "\n", "utf-8")
    _git("fetch", "--depth", "1", "origin", branch, cwd=dest)
    _git("reset", "--hard", "FETCH_HEAD", cwd=dest)
    return source_info(dest)


def source_info(dest: Path = config.SOURCE_DIR) -> dict:
    sha, date = _git("log", "-1", "--format=%H %cI", cwd=dest).split()
    return {"commit": sha, "commit_date": date}
