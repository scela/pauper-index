"""Risoluzione dei nomi delle decklist a oracle_id.

Ordine: nome grezzo -> pulizia -> alias -> esclusioni -> indice (nome, facce, nomi alternativi)
-> esiti online già registrati -> (se online) nome stampato in altre lingue, poi fuzzy.
"""

import csv
import datetime as dt
import difflib
from dataclasses import dataclass
from pathlib import Path

from .carddb import LV_ALT, LV_FACE, LV_NONPLAYABLE, CardDB
from .names import clean, norm
from .scryfall import Api

FUZZY_MIN_SIMILARITY = 0.75
ONLINE_FIELDS = ["sorgente", "metodo", "esito", "risultato", "oracle_id", "verificato"]


@dataclass(frozen=True, slots=True)
class Resolution:
    oracle_id: str | None
    method: str  # exact face alt alias foreign fuzzy | excluded nonplayable ambiguous unresolved
    detail: str = ""


def read_csv(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with open(path, encoding="utf-8-sig", newline="") as f:
        return [r for r in csv.DictReader(f)]


def load_aliases(path: Path) -> dict[str, str]:
    return {norm(r["sorgente"]): r["corretto"].strip() for r in read_csv(path) if r.get("sorgente")}


def load_excludes(path: Path) -> set[str]:
    return {norm(r["nome"]) for r in read_csv(path) if r.get("nome")}


class OnlineLog:
    """Esiti delle ricerche online (lingue straniere e fuzzy), committati e rivedibili a mano."""

    def __init__(self, path: Path):
        self.path = path
        self.rows = {norm(r["sorgente"]): r for r in read_csv(path)}
        self.dirty = False

    def get(self, key: str) -> dict | None:
        return self.rows.get(key)

    def put(self, source: str, method: str, outcome: str, result: str = "", oracle_id: str = "") -> None:
        self.rows[norm(source)] = {
            "sorgente": source, "metodo": method, "esito": outcome, "risultato": result,
            "oracle_id": oracle_id, "verificato": dt.date.today().isoformat(),
        }
        self.dirty = True

    def save(self) -> None:
        if not self.dirty:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.path, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=ONLINE_FIELDS, lineterminator="\n")
            w.writeheader()
            for r in sorted(self.rows.values(), key=lambda r: norm(r["sorgente"])):
                w.writerow(r)
        self.dirty = False


def similarity(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, norm(a), norm(b)).ratio()


class Resolver:
    def __init__(self, db: CardDB, aliases: dict[str, str], excludes: set[str],
                 online: OnlineLog, api: Api | None = None):
        self.db = db
        self.aliases = aliases
        self.excludes = excludes
        self.online = online
        self.api = api

    def resolve(self, raw: str) -> Resolution:
        r = self._local(raw, "exact")
        if r.method != "unresolved":
            return r
        name = clean(raw)
        k = norm(name)
        if k in self.aliases:
            return self._local(self.aliases[k], "alias")
        if name != raw:
            r = self._local(name, "exact")
            if r.method != "unresolved":
                return r
        return self._online(name)

    def _local(self, name: str, method: str) -> Resolution:
        if norm(name) in self.excludes:
            return Resolution(None, "excluded", name)
        oid, lv, amb = self.db.lookup(name)
        if amb:
            return Resolution(None, "ambiguous", name)
        if oid is None:
            return Resolution(None, "unresolved", name)
        if lv == LV_NONPLAYABLE:
            return Resolution(None, "nonplayable", self.db.cards[oid].name)
        if method == "exact":
            method = {LV_FACE: "face", LV_ALT: "alt"}.get(lv, "exact")
        return Resolution(oid, method, self.db.cards[oid].name)

    def _online(self, name: str) -> Resolution:
        k = norm(name)
        if not k:
            return Resolution(None, "unresolved", name)
        row = self.online.get(k)
        if row is None and self.api is not None:
            row = self._ask(name)
        if row and row["esito"] == "accettato" and row["oracle_id"] in self.db.cards:
            return Resolution(row["oracle_id"], row["metodo"], row["risultato"])
        return Resolution(None, "unresolved", name)

    def _ask(self, name: str) -> dict:
        api = self.api
        q = name.replace('"', "")
        data = api.get("/cards/search", {"q": f'lang:any !"{q}"', "unique": "cards"})
        if data.get("object") == "list":
            oids = {c.get("oracle_id") or c["card_faces"][0]["oracle_id"] for c in data["data"]}
            oids &= self.db.cards.keys()
            if len(oids) == 1:
                oid = oids.pop()
                if self.db.cards[oid].playable:
                    self.online.put(name, "foreign", "accettato", self.db.cards[oid].name, oid)
                else:
                    self.online.put(name, "foreign", "scartato: non giocabile", self.db.cards[oid].name, oid)
                return self.online.get(norm(name))
        data = api.get("/cards/named", {"fuzzy": name})
        if data.get("object") != "card":
            self.online.put(name, "fuzzy", "non trovato")
            return self.online.get(norm(name))
        oid = data.get("oracle_id") or data["card_faces"][0]["oracle_id"]
        card = self.db.cards.get(oid)
        if card is None:
            self.online.put(name, "fuzzy", "scartato: fuori dal bulk", data["name"], oid)
        elif not card.playable:
            self.online.put(name, "fuzzy", "scartato: non giocabile", card.name, oid)
        elif not self.db.has_common(oid):
            self.online.put(name, "fuzzy", "scartato: nessuna printing common", card.name, oid)
        elif max(similarity(name, n) for n in (card.name, *card.faces)) < FUZZY_MIN_SIMILARITY:
            self.online.put(name, "fuzzy", "scartato: troppo diverso", card.name, oid)
        else:
            self.online.put(name, "fuzzy", "accettato", card.name, oid)
        return self.online.get(norm(name))
