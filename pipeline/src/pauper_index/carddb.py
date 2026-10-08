"""Carte (oracle_cards), printing (default_cards) e indice dei nomi."""

import datetime as dt
import re
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, field

from .names import norm, split_faces

NON_PLAYABLE_LAYOUTS = frozenset(
    {"token", "double_faced_token", "art_series", "emblem", "planar", "scheme", "vanguard"}
)
NON_PLAYABLE_SET_TYPES = frozenset({"memorabilia", "token"})
# Printing che non rendono una carta Pauper-legale: set memorabilia/token, bordo argentato,
# timbro "acorn" (Unfinity), set non ancora usciti. I set "funny" non sono esclusi in blocco:
# le common di Unfinity senza acorn e le basi nere di Unglued sono legali.
ENTRY_EXCLUDED_SET_TYPES = frozenset({"memorabilia", "token"})
ENTRY_GAMES = frozenset({"paper", "mtgo"})

# Livelli dell'indice: più basso = più forte.
LV_NAME, LV_FACE, LV_ALT, LV_NONPLAYABLE = 0, 1, 2, 3


@dataclass(slots=True)
class Card:
    oracle_id: str
    name: str
    faces: tuple[str, ...]
    layout: str
    pauper: str  # legal | banned | not_legal
    type_line: str
    ref_id: str  # printing di riferimento scelta da oracle_cards
    playable: bool
    colors: str = ""  # colori del costo di mana in ordine WUBRG, senza phyrexiano (per i colori degli archetipi)
    produces: str = ""  # mana colorato prodotto (solo per le terre), in ordine WUBRG

    @property
    def basic(self) -> bool:
        return self.type_line.startswith("Basic ") or " Basic " in self.type_line


@dataclass(slots=True)
class Printing:
    id: str
    oracle_id: str
    set: str
    set_name: str
    set_type: str
    collector_number: str
    rarity: str
    games: frozenset
    released_at: str
    lang: str
    illustration_id: str
    artist: str
    has_back: bool
    alt_names: tuple[str, ...] = field(default=())
    border_color: str = "black"
    security_stamp: str = ""

    def counts_for_pauper(self, today: str) -> bool:
        return (self.rarity == "common" and bool(self.games & ENTRY_GAMES)
                and self.set_type not in ENTRY_EXCLUDED_SET_TYPES and self.border_color != "silver"
                and self.security_stamp != "acorn" and self.released_at <= today)


def _oracle_id(c: dict) -> str | None:
    return c.get("oracle_id") or (c.get("card_faces") or [{}])[0].get("oracle_id")


def _colors(c: dict) -> str:
    """Colori che servono davvero per lanciare la carta: simboli del costo di mana, senza il mana phyrexiano
    (pagabile con la vita). Senza costo (sospendi, terre) si usano i colori della carta."""
    f0 = (c.get("card_faces") or [{}])[0]
    cost = c.get("mana_cost") or f0.get("mana_cost") or ""
    if cost:
        cols = {ch for sym in re.findall(r"\{([^}]+)\}", cost) if "P" not in sym for ch in sym if ch in "WUBRG"}
    else:
        cols = set(c.get("colors") or f0.get("colors") or [])
    return "".join(x for x in "WUBRG" if x in cols)


def _produces(c: dict) -> str:
    if "Land" not in (c.get("type_line") or ""):
        return ""
    return "".join(x for x in "WUBRG" if x in (c.get("produced_mana") or []))


def card_from_json(c: dict) -> Card:
    faces = tuple(f["name"] for f in c.get("card_faces") or []) or (c["name"],)
    return Card(
        oracle_id=_oracle_id(c),
        name=c["name"],
        faces=faces,
        layout=c["layout"],
        pauper=c.get("legalities", {}).get("pauper", "not_legal"),
        type_line=c.get("type_line") or (c.get("card_faces") or [{}])[0].get("type_line", ""),
        ref_id=c["id"],
        playable=c["layout"] not in NON_PLAYABLE_LAYOUTS and c.get("set_type") not in NON_PLAYABLE_SET_TYPES,
        colors=_colors(c),
        produces=_produces(c),
    )


def printing_from_json(c: dict) -> Printing:
    faces = c.get("card_faces") or []
    f0 = faces[0] if faces else {}
    alt = {c.get("printed_name"), c.get("flavor_name")}
    for f in faces:
        alt |= {f.get("printed_name"), f.get("flavor_name")}
    alt.discard(None)
    return Printing(
        id=c["id"],
        oracle_id=_oracle_id(c),
        set=c["set"],
        set_name=c.get("set_name", ""),
        set_type=c.get("set_type", ""),
        collector_number=c.get("collector_number", ""),
        rarity=c.get("rarity", ""),
        games=frozenset(c.get("games") or ()),
        released_at=c.get("released_at", ""),
        lang=c.get("lang", "en"),
        illustration_id=c.get("illustration_id") or f0.get("illustration_id") or "",
        artist=c.get("artist") or f0.get("artist") or "",
        has_back="image_uris" not in c and len(faces) > 1 and "image_uris" in faces[1],
        alt_names=tuple(sorted(alt)),
        border_color=c.get("border_color", "black"),
        security_stamp=c.get("security_stamp") or "",
    )


class NameIndex:
    def __init__(self):
        self._e: dict[str, dict[int, set[str]]] = defaultdict(lambda: defaultdict(set))

    def add(self, name: str, oracle_id: str, level: int) -> None:
        k = norm(name)
        if k:
            self._e[k][level].add(oracle_id)

    def lookup(self, name: str, cards: dict[str, Card]) -> tuple[str | None, int, bool]:
        """-> (oracle_id, livello, ambiguo). Ai pari livello preferisce le carte con legalità Pauper."""
        levels = self._e.get(norm(name))
        if not levels:
            return None, -1, False
        lv = min(levels)
        oids = levels[lv]
        if len(oids) > 1:
            ranked = [o for o in oids if cards[o].pauper != "not_legal"]
            if len(ranked) == 1:
                return ranked[0], lv, False
            return None, lv, True
        return next(iter(oids)), lv, False

    def items(self):
        return self._e.items()


class CardDB:
    def __init__(self, oracle: Iterable[dict], default: Iterable[dict]):
        self.cards: dict[str, Card] = {}
        for c in oracle:
            card = card_from_json(c)
            self.cards[card.oracle_id] = card
        self.printings: dict[str, list[Printing]] = defaultdict(list)
        self.by_id: dict[str, str] = {}
        for c in default:
            p = printing_from_json(c)
            if p.oracle_id not in self.cards:
                continue
            self.printings[p.oracle_id].append(p)
            self.by_id[p.id] = p.oracle_id
        for ps in self.printings.values():
            ps.sort(key=lambda p: (p.released_at, p.set, p.collector_number))
        self.index = self._build_index()

    def _build_index(self) -> NameIndex:
        idx = NameIndex()
        for oid, c in self.cards.items():
            if not c.playable:
                idx.add(c.name, oid, LV_NONPLAYABLE)
                for f in c.faces:
                    idx.add(f, oid, LV_NONPLAYABLE)
                continue
            idx.add(c.name, oid, LV_NAME)
            if len(c.faces) > 1:
                for f in c.faces:
                    idx.add(f, oid, LV_FACE)
            for p in self.printings.get(oid, ()):
                for alt in p.alt_names:
                    idx.add(alt, oid, LV_ALT)
                    for f in split_faces(alt):
                        idx.add(f, oid, LV_ALT)
        return idx

    def lookup(self, name: str) -> tuple[str | None, int, bool]:
        """Nome completo, poi (se "A // B") la sola faccia frontale."""
        oid, lv, amb = self.index.lookup(name, self.cards)
        if oid or amb:
            return oid, lv, amb
        faces = split_faces(name)
        if len(faces) > 1:
            joined = " // ".join(faces)
            oid, lv, amb = self.index.lookup(joined, self.cards)
            if oid or amb:
                return oid, lv, amb
            return self.index.lookup(faces[0], self.cards)
        if "/" in name:  # "A/B" senza spazi; i nomi veri con la barra ("Choco/Mog") passano prima
            return self.lookup(name.replace("/", " // "))
        return None, -1, False

    def has_common(self, oracle_id: str) -> bool:
        return self.entry_printing(oracle_id) is not None

    def entry_printing(self, oracle_id: str, today: str | None = None) -> Printing | None:
        """Prima printing common in carta o su MTGO: la regola di legalità del Pauper."""
        today = today or dt.date.today().isoformat()
        for p in self.printings.get(oracle_id, ()):
            if p.counts_for_pauper(today):
                return p
        return None
