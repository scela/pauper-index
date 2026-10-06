"""Scrittura dei file letti dal frontend. Formati descritti in CLAUDE.md ("Output della pipeline")."""

import csv
import datetime as dt
import gzip
import json
from collections import Counter
from collections.abc import Mapping
from pathlib import Path

from .carddb import LV_ALT, LV_NAME, CardDB
from .stats import CardStats, median_high


def iso(day: int) -> str:
    return dt.date.fromordinal(day).isoformat()


def dumps(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def write_lines_json(path: Path, head: dict, key: str, rows: list) -> None:
    """JSON con una riga per elemento della lista `key`: diff leggibili e compressione git migliore."""
    path.parent.mkdir(parents=True, exist_ok=True)
    head_s = dumps(head)[:-1]
    body = ",\n".join(dumps(r) for r in rows)
    sep = "," if head else ""
    path.write_text(f'{head_s}{sep}"{key}":[\n{body}\n]}}\n', "utf-8", newline="\n")


def size_info(path: Path) -> dict:
    raw = path.read_bytes()
    return {"file": path.name, "kb": round(len(raw) / 1024, 1), "gzip_kb": round(len(gzip.compress(raw, 9)) / 1024, 1)}


def _last(st: CardStats, kind: str, t_index: dict[int, int]) -> list | None:
    e = st.last_seen.get(kind)
    if e is None:
        return None
    day, ti, result, m, s = e
    return [t_index[ti], result, m, s]


def year_series(counts: Mapping[int, int], first: int, last: int) -> list[int]:
    """[primo anno, mazzi del primo anno, …, mazzi dell'ultimo anno] (anni senza mazzi = 0)."""
    return [first, *(counts.get(y, 0) for y in range(first, last + 1))]


def build_cards(db: CardDB, stats: dict[str, CardStats], tournaments, entries, sets_info, windows,
                totals, anchor: int) -> tuple[dict, list, list[str]]:
    order = sorted(stats, key=lambda o: (db.cards[o].name.casefold(), o))
    used_t: dict[int, int] = {}
    for o in order:
        for e in stats[o].last_seen.values():
            used_t.setdefault(e[1], 0)
    t_ids = sorted(used_t, key=lambda i: (tournaments[i].day, tournaments[i].rel))
    t_index = {ti: n for n, ti in enumerate(t_ids)}
    t_rows = [[iso(tournaments[i].day), tournaments[i].name, tournaments[i].uri, tournaments[i].kind]
              for i in t_ids]

    # mazzi per anno (tutti, deduplicati): servono a calcolare l'anno di massima diffusione in percentuale
    year_tot: Counter = Counter()
    for t in tournaments:
        for d in t.decks:
            year_tot[dt.date.fromordinal(d.day).year] += 1
    y_first, y_last = min(year_tot), max(year_tot)

    entry_sets = {}
    rows = []
    for o in order:
        c, st = db.cards[o], stats[o]
        ws = []
        for w in range(len(windows)):
            if st.decks_any[w]:
                ws.append([st.decks_any[w], st.decks_main[w], st.copies[w],
                           median_high(st.hist_any[w]), median_high(st.hist_main[w])])
            else:
                ws.append(0)
        row = {"o": o, "n": c.name, "l": c.pauper[0]}
        if c.basic:
            row["b"] = 1
        p = entries.get(o)
        if p is not None:
            row["e"] = p.set
            entry_sets[p.set] = sets_info.get(p.set, {})
        row["s"] = ws
        row["f"] = iso(st.first)
        row["z"] = iso(st.last)
        row["y"] = year_series(st.years, min(st.years), max(st.years))
        for kind, k in (("m", "lm"), ("p", "lp")):
            v = _last(st, kind, t_index)
            if v is not None:
                row[k] = v
        prints = db.printings.get(o, [])
        row["r"] = next((i for i, pr in enumerate(prints) if pr.id == c.ref_id), 0 if prints else -1)
        rows.append(row)

    head = {
        "v": 2,
        "anchor": iso(anchor),
        "w": [n or 0 for n in windows],
        "tot": [[x["decks"], x["tournaments"]] for x in totals],
        "sets": {k: [v.get("name", k), v.get("released_at", ""), v.get("set_type", "")]
                 for k, v in sorted(entry_sets.items())},
        "t": t_rows,
        "yt": year_series(year_tot, y_first, y_last),
    }
    return head, rows, order


def build_printings(db: CardDB, order: list[str], sets_info) -> tuple[dict, list]:
    artists: dict[str, int] = {}
    sets_used: dict[str, list] = {}
    rows = []
    for o in order:
        groups: dict[str, int] = {}
        plist = []
        for p in db.printings.get(o, []):
            a = artists.setdefault(p.artist, len(artists))
            g = groups.setdefault(p.illustration_id or p.id, len(groups))
            s = sets_info.get(p.set, {})
            sets_used.setdefault(p.set, [s.get("name", p.set_name), s.get("released_at", p.released_at)])
            item = [p.id, p.set, p.collector_number, a, g, 1 if p.has_back else 0, RARITY.get(p.rarity, "s")]
            if p.lang != "en":
                item.append(p.lang)
            plist.append(item)
        rows.append(plist)
    head = {"v": 2, "sets": dict(sorted(sets_used.items())), "artists": list(artists)}
    return head, rows


RARITY = {"common": "c", "uncommon": "u", "rare": "r", "mythic": "m", "special": "s", "bonus": "b"}


def build_sets(db: CardDB, order: list[str], sets_info: dict) -> list[dict]:
    """Espansioni in cui è stampata almeno una carta giocata (filtro per espansione del sito).

    Una voce per set: codice, nome, data di uscita, tipo Scryfall, set padre, solo digitale.
    I set padre sono inclusi anche senza carte proprie, per poter raggruppare.
    """
    used = {p.set for o in order for p in db.printings.get(o, [])}
    seen = set()
    queue = sorted(used)
    while queue:
        code = queue.pop()
        if code in seen or code not in sets_info:
            continue
        seen.add(code)
        parent = sets_info[code].get("parent_set_code")
        if parent:
            queue.append(parent)
    out = []
    for code in seen:
        s = sets_info[code]
        item = {"c": code, "n": s["name"], "d": s.get("released_at", ""), "t": s.get("set_type", "")}
        if s.get("parent_set_code"):
            item["p"] = s["parent_set_code"]
        if s.get("digital"):
            item["g"] = 1
        out.append(item)
    out.sort(key=lambda x: (x["d"], x["c"]), reverse=True)
    return out


def build_names(db: CardDB, order: list[str]) -> dict[str, int]:
    pos = {o: i for i, o in enumerate(order)}
    out = {}
    for k, levels in db.index.items():
        lv = min(levels)
        if lv > LV_ALT:
            continue
        oids = levels[lv]
        if len(oids) > 1:
            ranked = [o for o in oids if db.cards[o].pauper != "not_legal"]
            oids = set(ranked) if len(ranked) == 1 else set()
        if len(oids) == 1:
            o = next(iter(oids))
            if o in pos and (lv == LV_NAME or k not in out):
                out[k] = pos[o]
    return dict(sorted(out.items()))


def build_all_names(db: CardDB) -> list[str]:
    """Nomi normalizzati di tutte le carte giocabili (anche mai giocate in Pauper).

    Serve al frontend per distinguere, nel testo incollato, una carta mai giocata da un nome non riconosciuto.
    """
    keys = set()
    for k, levels in db.index.items():
        if min(levels) <= LV_ALT:
            keys.add(k)
    return sorted(keys)


def build_card_names(db: CardDB) -> list[list[str]]:
    """[nome, legalità l|b|n] di tutte le carte giocabili in carta o su MTGO, ordinate per nome.

    Serve ai suggerimenti del controllo rapido (anche per le carte mai giocate in Pauper).
    Escluse le carte solo Arena (per esempio le versioni ribilanciate "A-").
    """
    out = []
    for oid, c in db.cards.items():
        if not c.playable:
            continue
        if not any(p.games & {"paper", "mtgo"} for p in db.printings.get(oid, ())):
            continue
        out.append([c.name, c.pauper[0]])
    out.sort(key=lambda x: (x[0].casefold(), x[0]))
    return out


def write_json(path: Path, obj, pretty: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(obj, ensure_ascii=False, indent=2) if pretty else dumps(obj)
    path.write_text(text + "\n", "utf-8", newline="\n")


def write_csv(path: Path, header: list[str], rows: list[list]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(header)
        w.writerows(rows)
