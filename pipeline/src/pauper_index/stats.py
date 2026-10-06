"""Statistiche per oracle_id e per finestra temporale.

Le finestre sono ancorate alla data dell'ultimo mazzo (vedi CLAUDE.md): un mazzo del giorno `d`
è nella finestra di N giorni se d > ancora - N.
"""

from collections import Counter
from dataclasses import dataclass, field
from datetime import date

from .source import Tournament


@dataclass(slots=True)
class CardStats:
    nw: int
    decks_any: list[int] = field(default_factory=list)
    decks_main: list[int] = field(default_factory=list)
    copies: list[int] = field(default_factory=list)
    hist_any: list[Counter] = field(default_factory=list)
    hist_main: list[Counter] = field(default_factory=list)
    first: int = 0
    last: int = 0
    last_seen: dict = field(default_factory=dict)  # "m"/"p" -> (giorno, indice torneo, risultato, main, side)
    years: Counter = field(default_factory=Counter)  # anno -> mazzi (main+side), su tutto lo storico

    def __post_init__(self):
        self.decks_any = [0] * self.nw
        self.decks_main = [0] * self.nw
        self.copies = [0] * self.nw
        self.hist_any = [Counter() for _ in range(self.nw)]
        self.hist_main = [Counter() for _ in range(self.nw)]


def median_high(hist: Counter) -> int:
    n = sum(hist.values())
    if not n:
        return 0
    target, acc = n // 2, 0
    for v in sorted(hist):
        acc += hist[v]
        if acc > target:
            return v
    return 0


def _better(new: tuple, old: tuple | None) -> bool:
    """Ultima apparizione: data più recente; a pari data, piazzamento migliore."""
    if old is None or new[0] > old[0]:
        return True
    if new[0] < old[0]:
        return False
    rn, ro = new[2], old[2]
    return isinstance(rn, int) and (not isinstance(ro, int) or rn < ro)


def window_index(day: int, anchor: int, windows) -> list[int]:
    return [i for i, n in enumerate(windows) if n is None or day > anchor - n]


def compute(tournaments: list[Tournament], keymap: list[int], key_oids: list[str | None],
            windows, anchor: int | None = None, cutoff: int | None = None):
    """-> (stats per oracle_id, totali per finestra, ancora)."""
    if cutoff is not None:
        tournaments = [t for t in tournaments if t.day <= cutoff]
    if anchor is None:
        anchor = max(d.day for t in tournaments for d in t.decks)
    nw = len(windows)
    stats: dict[str, CardStats] = {}
    totals = [{"decks": 0, "tournaments": 0} for _ in windows]

    for ti, t in enumerate(tournaments):
        t_windows = set()
        for d in t.decks:
            if cutoff is not None and d.day > cutoff:
                continue
            ws = window_index(d.day, anchor, windows)
            year = date.fromordinal(d.day).year
            t_windows.update(ws)
            for w in ws:
                totals[w]["decks"] += 1
            main: Counter = Counter()
            side: Counter = Counter()
            for arr, acc in ((d.main, main), (d.side, side)):
                for i in range(0, len(arr), 2):
                    oid = key_oids[keymap[arr[i]]]
                    if oid is not None:
                        acc[oid] += arr[i + 1]
            for oid in main.keys() | side.keys():
                m, s = main.get(oid, 0), side.get(oid, 0)
                st = stats.get(oid)
                if st is None:
                    st = stats[oid] = CardStats(nw, first=d.day, last=d.day)
                st.first = min(st.first, d.day)
                st.last = max(st.last, d.day)
                st.years[year] += 1
                for w in ws:
                    st.decks_any[w] += 1
                    st.copies[w] += m + s
                    st.hist_any[w][m + s] += 1
                    if m:
                        st.decks_main[w] += 1
                        st.hist_main[w][m] += 1
                cand = (d.day, ti, d.result, m, s)
                if _better(cand, st.last_seen.get(t.kind)):
                    st.last_seen[t.kind] = cand
        for w in t_windows:
            totals[w]["tournaments"] += 1
    return stats, totals, anchor, tournaments


def unresolved_stats(tournaments: list[Tournament], names: list[str], unresolved_ids: set[int]) -> dict:
    """Per nome grezzo non risolto: mazzi, occorrenze, prima e ultima apparizione."""
    out: dict[int, list] = {}
    for t in tournaments:
        for d in t.decks:
            seen = set()
            for arr in (d.main, d.side):
                for i in range(0, len(arr), 2):
                    nid = arr[i]
                    if nid in unresolved_ids:
                        e = out.setdefault(nid, [0, 0, d.day, d.day])
                        e[1] += 1
                        e[2] = min(e[2], d.day)
                        e[3] = max(e[3], d.day)
                        if nid not in seen:
                            seen.add(nid)
                            e[0] += 1
    return {names[k]: v for k, v in out.items()}
