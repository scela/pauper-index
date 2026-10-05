"""Set d'ingresso nel Pauper e set "rilevanti".

Set d'ingresso di una carta = set della prima printing common in carta o su MTGO
(vedi CardDB.entry_printing). Un gruppo di set è rilevante se rende Pauper-legali
almeno N carte; il gruppo è il `parent_set_code` di Scryfall, se presente.
"""

import datetime as dt
from collections import defaultdict

from .carddb import CardDB, Printing


def entry_map(db: CardDB) -> dict[str, Printing]:
    """Set d'ingresso, solo per le carte che Scryfall dà legali o bannate (fonte autorevole)."""
    out = {}
    for oid, c in db.cards.items():
        if not c.playable or c.pauper == "not_legal":
            continue
        p = db.entry_printing(oid)
        if p is not None:
            out[oid] = p
    return out


def group_of(code: str, sets_info: dict[str, dict]) -> str:
    seen = set()
    while code in sets_info and sets_info[code].get("parent_set_code") and code not in seen:
        seen.add(code)
        code = sets_info[code]["parent_set_code"]
    return code


def validate(db: CardDB, entries: dict[str, Printing]) -> dict:
    """Confronta la regola (applicata a tutte le carte) con la legalità Pauper di Scryfall."""
    legal_no_entry, entry_not_legal = [], []
    for oid, c in db.cards.items():
        if not c.playable:
            continue
        p = db.entry_printing(oid)
        if c.pauper in ("legal", "banned") and p is None:
            legal_no_entry.append(c.name)
        elif c.pauper == "not_legal" and p is not None:
            entry_not_legal.append(f"{c.name} ({p.set}, {p.set_type})")
    return {"legali_senza_ingresso": sorted(legal_no_entry), "ingresso_ma_non_legali": sorted(entry_not_legal)}


def relevant_sets(db: CardDB, entries: dict[str, Printing], sets_info: dict[str, dict], played: set[str],
                  today: dt.date, years: int = 2, threshold: int = 5) -> list[dict]:
    since = (today - dt.timedelta(days=365 * years)).isoformat()
    per_set: dict[str, list[str]] = defaultdict(list)
    for oid, p in entries.items():
        if db.cards[oid].pauper in ("legal", "banned"):
            per_set[p.set].append(oid)
    per_group: dict[str, int] = defaultdict(int)
    for code, oids in per_set.items():
        per_group[group_of(code, sets_info)] += len(oids)
    rows = []
    for code, s in sets_info.items():
        if s.get("released_at", "") < since or s["released_at"] > today.isoformat():
            continue
        n = len(per_set.get(code, ()))
        if not n and code not in per_group:
            continue
        g = group_of(code, sets_info)
        rows.append({
            "set": code, "nome": s["name"], "tipo": s.get("set_type", ""), "uscita": s["released_at"],
            "gruppo": g, "carte_ingresso": n, "giocate": sum(1 for o in per_set.get(code, ()) if o in played),
            "carte_gruppo": per_group.get(g, 0), "rilevante_set": n >= threshold,
            "rilevante_gruppo": per_group.get(g, 0) >= threshold,
            "digitale": bool(s.get("digital")),
        })
    rows.sort(key=lambda r: (r["uscita"], r["set"]))
    return rows
