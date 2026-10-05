"""Deduplica approvata (vedi CLAUDE.md, "Deduplica").

1. File con lo stesso multinsieme di mazzi: se ne tiene uno (cartelle attive e "native" prima).
2. Stesso mazzo, ±1 giorno, solo tra cartelle diverse della stessa famiglia di copie:
   si scarta un mazzo se un'altra cartella della famiglia ne ha già tenuto uno uguale
   non ancora abbinato a questa cartella (vale il massimo per cartella, non la somma).
   Eccezione: ±8 giorni tra file League di mtgo.com_before_new_data_model e di mtgo.com,
   perché l'archivio data le League alla pubblicazione settimanale.
"""

import datetime as dt
from collections import Counter, defaultdict
from dataclasses import replace

from .source import FAMILIES, Tournament, precedence

DAY_TOLERANCE = 1
LEAGUE_TOLERANCE = 8
LEAGUE_PAIR = frozenset({"mtgo.com_before_new_data_model", "mtgo.com"})


def is_league(t: Tournament) -> bool:
    return "league" in t.rel.rsplit("/", 1)[-1].lower()


def tolerance(folder_a: str, league_a: bool, folder_b: str, league_b: bool, league_tolerance: int) -> int:
    if league_a and league_b and {folder_a, folder_b} == LEAGUE_PAIR:
        return league_tolerance
    return DAY_TOLERANCE


def deck_fingerprint(main, side, keymap: list[int]) -> int:
    m: Counter = Counter()
    s: Counter = Counter()
    for arr, acc in ((main, m), (side, s)):
        for i in range(0, len(arr), 2):
            acc[keymap[arr[i]]] += arr[i + 1]
    return hash((tuple(sorted(m.items())), tuple(sorted(s.items()))))


def _year(day: int) -> int:
    return dt.date.fromordinal(day).year


def dedupe(tournaments: list[Tournament], keymap: list[int],
           league_tolerance: int = LEAGUE_TOLERANCE) -> tuple[list[Tournament], dict]:
    """`league_tolerance`: giorni tra League di mtgo.com_before_new_data_model e mtgo.com."""
    for t in tournaments:
        for d in t.decks:
            d.fp = deck_fingerprint(d.main, d.side, keymap)

    before = {"tournaments": len(tournaments), "decks": sum(len(t.decks) for t in tournaments),
              "tornei_senza_mazzi": sum(1 for t in tournaments if not t.decks)}
    tournaments = [t for t in tournaments if t.decks]

    # Regola 1: file identici
    groups: dict[int, list[Tournament]] = defaultdict(list)
    for t in tournaments:
        groups[hash(tuple(sorted(d.fp for d in t.decks)))].append(t)
    rule1: Counter = Counter()
    rule1_decks: Counter = Counter()
    survivors = []
    for ts in groups.values():
        ts.sort(key=precedence)
        survivors.append(ts[0])
        for t in ts[1:]:
            k = (t.folder, ts[0].folder, _year(t.day))
            rule1[k] += 1
            rule1_decks[k] += len(t.decks)

    # Regola 2: stesso mazzo tra copie della stessa fonte
    def order(t: Tournament):
        fam = FAMILIES.get(t.family, ())
        return (fam.index(t.folder) if t.folder in fam else 99, t.archive, t.day, t.rel)

    # (famiglia, fp) -> mazzi tenuti: {"folder", "seen": cartelle già abbinate, "obs": [(giorno, cartella, league)]}
    # "obs" registra anche le copie scartate: una terza cartella può abbinarsi alla data di una copia
    # (per esempio magic.wizards.com alla copia in before_new_data_model di una League di mtgo.com).
    kept_idx: dict[tuple, list[dict]] = defaultdict(list)
    rule2: Counter = Counter()
    emptied: Counter = Counter()
    result: list[Tournament] = []

    def matches(e: dict, folder: str, league: bool, day: int) -> bool:
        if e["folder"] == folder or folder in e["seen"]:
            return False
        return any(f != folder and abs(od - day) <= tolerance(folder, league, f, ol, league_tolerance)
                   for od, f, ol in e["obs"])

    for t in sorted(survivors, key=order):
        keep = []
        league = is_league(t)
        for d in t.decks:
            entries = kept_idx[(t.family, d.fp)]
            match = next((e for e in entries if matches(e, t.folder, league, d.day)), None)
            if match is not None:
                match["seen"].add(t.folder)
                match["obs"].append((d.day, t.folder, league))
                rule2[(t.folder, match["folder"], _year(d.day))] += 1
            else:
                entries.append({"folder": t.folder, "seen": set(), "obs": [(d.day, t.folder, league)]})
                keep.append(d)
        if t.decks and not keep:
            emptied[(t.folder, _year(t.day))] += 1
        if keep:
            result.append(replace(t, decks=keep))  # copia: i tornei in input restano intatti

    result.sort(key=lambda t: (t.day, t.rel))
    log = {
        "prima": before,
        "dopo": {"tournaments": len(result), "decks": sum(len(t.decks) for t in result)},
        "regola1_file_identici": [
            {"scartata": a, "tenuta": b, "anno": y, "tornei": n, "mazzi": rule1_decks[(a, b, y)]}
            for (a, b, y), n in sorted(rule1.items())
        ],
        "regola2_mazzi_ripetuti": [
            {"scartata": a, "tenuta": b, "anno": y, "mazzi": n} for (a, b, y), n in sorted(rule2.items())
        ],
        "regola2_tornei_svuotati": [
            {"cartella": a, "anno": y, "tornei": n} for (a, y), n in sorted(emptied.items())
        ],
    }
    return result, log
