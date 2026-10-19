"""Debutti: carte apparse per la prima volta nei tornei di recente, con un'analisi del metagame.

Uscite:
- data/debuts.json (pubblicato, scaricato solo dalla pagina #debutti): una carta per riga, carte e archetipi come
  indici di cards.json e identificativi delle famiglie dei file dei mazzi. Dei giocatori c'è solo il numero di
  giocatori diversi: i nomi (e qualsiasi impronta) non escono mai da source.load_all, dove diventano numeri
  progressivi validi solo in memoria.
- data/reviews/legalita.json (committato, non pubblicato): carte bandite oggi e registro dei cambi di legalità,
  dal giorno in cui il file è stato creato (2026-10-19). Serve alla categoria "tolta dalle bandite".
- data/reviews/debutti.md: tabella per la revisione (categoria, mazzi, giocatori, "al posto di").

Una carta è un debutto se la sua prima apparizione (`f` di cards.json) è entro MAX_DAYS giorni dall'ultimo
torneo, oppure se è stata tolta dalle bandite entro MAX_DAYS giorni (anche se era già giocata prima del ban: allora
i mazzi si contano dal giorno dello sblocco). Il sito sceglie il periodo (30, 61, 90, 120 giorni) sulla data `f`.
"""

import datetime as dt
import json
from collections import Counter
from pathlib import Path

from . import config
from .carddb import CardDB
from .decks import NORMAL_BASICS, to_cards, tournament_ids
from .outputs import dumps, iso
from .source import Tournament

MAX_DAYS = 120  # periodo più lungo offerto dal sito
MIN_DECKS = 5  # filtro anti-rumore: almeno 5 mazzi...
MIN_PLAYERS = 3  # ...di almeno 3 giocatori diversi
WATCH_MIN_DECKS = 2  # "In osservazione": le escluse dal filtro con almeno 2 mazzi
NEW_DAYS = 120  # "carta nuova" / "appena legale": stampa uscita al massimo 120 giorni prima della prima apparizione
BEFORE_DAYS = 60  # periodo prima della prima apparizione per il confronto "al posto di"
MIN_COMPARE = 20  # mazzi minimi di ciascun gruppo di confronto
MIN_DROP = 0.20  # calo minimo della presenza (20 punti) perché una carta sia "al posto di"
MAX_REPLACED = 3
TOP_ARCHS = 4
TOP_WITH = 6
TOP_BEST = 3
ENTRY_GAMES = {"paper", "mtgo"}

LEGALITY = config.REVIEWS / "legalita.json"


def score(result) -> float:
    """Ordine dei piazzamenti, come nel sito (placementScore): un 5-0 vale come subito dopo la top 8."""
    if isinstance(result, int):
        return result
    if isinstance(result, str) and "-" in result:
        w, _, lost = result.partition("-")
        if w.isdigit() and lost.isdigit():
            return 8.5 if int(lost) == 0 else 100 + int(lost)
    return 1e6


def update_legality(db: CardDB, today: str, path: Path = LEGALITY) -> dict:
    """Registro delle carte bandite e dei cambi. Al primo avvio salva solo lo stato di oggi (nessun cambio)."""
    banned = {o: c.name for o, c in db.cards.items() if c.playable and c.pauper == "banned"}
    if path.exists():
        reg = json.loads(path.read_text("utf-8"))
    else:
        reg = {"v": 1, "since": today, "banned": banned, "changes": []}
    old = reg["banned"]
    for o in sorted(set(old) - set(banned)):
        to = db.cards[o].pauper if o in db.cards else "missing"
        reg["changes"].append([today, o, old[o], "banned", to])
    for o in sorted(set(banned) - set(old)):
        reg["changes"].append([today, o, banned[o], "legal" if o in db.cards else "missing", "banned"])
    reg["banned"] = dict(sorted(banned.items()))
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(reg, ensure_ascii=False, indent=1) + "\n"
    if not path.exists() or path.read_text("utf-8") != text:
        path.write_text(text, "utf-8", newline="\n")
    return reg


def unbanned(reg: dict) -> dict[str, int]:
    """oracle_id -> giorno dell'ultimo sblocco (da bandita a legale)."""
    out = {}
    for day, o, _, frm, to in reg["changes"]:
        if frm == "banned" and to == "legal":
            out[o] = dt.date.fromisoformat(day).toordinal()
    return out


def category(db: CardDB, oid: str, first: int, unban: int | None) -> str:
    """n = carta nuova, l = appena legale, u = tolta dalle bandite, r = riscoperta."""
    if unban is not None:
        return "u"
    prints = [p.released_at for p in db.printings.get(oid, []) if p.games & ENTRY_GAMES and p.released_at]
    if prints and first - dt.date.fromisoformat(min(prints)).toordinal() <= NEW_DAYS:
        return "n"
    entry = db.entry_printing(oid)
    if entry and first - dt.date.fromisoformat(entry.released_at).toordinal() <= NEW_DAYS:
        return "l"
    return "r"


class Recent:
    """Mazzi recenti in forma comoda: carte come indici di cards.json, archetipo della lista, giocatore."""

    __slots__ = ("day", "ti", "result", "player", "main", "side", "arch", "fam")

    def __init__(self, day, ti, result, player, main, side, arch, fam):
        self.day, self.ti, self.result, self.player = day, ti, result, player
        self.main, self.side, self.arch, self.fam = main, side, arch, fam

    def has(self, i: int) -> bool:
        return i in self.main or i in self.side


def presence(ds: list[Recent], zone: str) -> Counter:
    n = Counter()
    for d in ds:
        n.update(getattr(d, zone).keys())
    return n


def replaced(card: int, mine: list[Recent], recent: list[Recent], since: int,
             basics: set[int]) -> tuple[str, list, int]:
    """"Al posto di": carte che calano nella variante principale delle liste che giocano la carta.

    Confronto 1 (prima/dopo): le liste della variante nei BEFORE_DAYS giorni prima di `since` contro le liste con la
    carta. Confronto 2 (stesso periodo): le liste della variante senza la carta, da `since`, contro quelle con la
    carta; vale solo se sono almeno MIN_COMPARE, e allora la carta deve calare in entrambi. Così una carta che cala
    per un'altra novità arrivata nello stesso momento non viene attribuita alla carta sbagliata.
    Restituisce (variante, [[carta, presenza prima, con la carta, senza la carta o -1] in per mille], nuovo mazzo).
    """
    variants = Counter(d.arch for d in mine if d.arch)
    if not variants:
        return "", [], 0
    arch = variants.most_common(1)[0][0]
    zone = "side" if sum(card in d.side for d in mine) > sum(card in d.main for d in mine) else "main"
    post = [d for d in mine if d.arch == arch]
    pre = [d for d in recent if d.arch == arch and since - BEFORE_DAYS <= d.day < since]
    without = [d for d in recent if d.arch == arch and d.day >= since and not d.has(card)]
    if not pre:
        return arch, [], 1  # la variante non esisteva prima: la carta ha dato vita a un mazzo nuovo
    if len(pre) < MIN_COMPARE or len(post) < MIN_DECKS:
        return arch, [], 0
    p_pre, p_post = presence(pre, zone), presence(post, zone)
    p_wo = presence(without, zone) if len(without) >= MIN_COMPARE else None
    out = []
    for c, n in p_pre.items():
        if c == card or c in basics:
            continue
        a, b = n / len(pre), p_post[c] / len(post)
        if a - b < MIN_DROP:
            continue
        w = -1.0
        if p_wo is not None:
            w = p_wo[c] / len(without)
            if w - b < MIN_DROP:
                continue
        out.append((a - b, c, a, b, w))
    out.sort(key=lambda x: (-x[0], x[1]))
    return arch, [[c, round(a * 1000), round(b * 1000), round(w * 1000) if w >= 0 else -1]
                  for _, c, a, b, w in out[:MAX_REPLACED]], 0


def monday(day: int) -> int:
    return day - dt.date.fromordinal(day).weekday()


def build_debuts(kept: list[Tournament], keymap, key_oids, db: CardDB, order: list[str], anchor: int,
                 firsts: dict[str, int], arch_of: dict, fams: dict[str, list], today: str,
                 out: Path = config.DATA / "debuts.json", review: Path = config.REVIEWS / "debutti.md",
                 legality: Path = LEGALITY, log=print) -> dict:
    pos = {o: i for i, o in enumerate(order)}
    basics = {pos[o] for o, c in db.cards.items() if c.name in NORMAL_BASICS and o in pos}
    unban = {o: d for o, d in unbanned(update_legality(db, today, legality)).items() if anchor - d <= MAX_DAYS}
    # candidati: prima apparizione recente o sblocco recente, carta legale oggi, non terra base
    cand: dict[int, tuple[int, int | None]] = {}  # indice -> (giorno da cui si contano i mazzi, sblocco)
    for o, f in firsts.items():
        c = db.cards.get(o)
        if o in pos and c and c.pauper == "legal" and not c.basic and anchor - f <= MAX_DAYS:
            cand[pos[o]] = (f, None)
    for o, d in unban.items():
        c = db.cards.get(o)
        if o in pos and c and c.pauper == "legal":
            cand[pos[o]] = (d, d)
    start = min([s for s, _ in cand.values()] + [anchor]) - BEFORE_DAYS
    tours = sorted((t for t in kept if t.day >= start), key=lambda t: (t.day, t.name, t.uri))
    tids = tournament_ids(tours)
    recent: list[Recent] = []
    for ti, t in enumerate(tours):
        for d in t.decks:
            main, _ = to_cards(d.main, keymap, key_oids, pos)
            side, _ = to_cards(d.side, keymap, key_oids, pos)
            key = (tuple(sorted(main.items())), tuple(sorted(side.items())))
            aid, _, fam = arch_of.get(key, ("", "", ""))
            recent.append(Recent(d.day, ti, d.result, d.player, main, side, aid, fam))
    week_tot = Counter(monday(d.day) for d in recent)
    last_week = monday(anchor)
    by_card: dict[int, list[Recent]] = {i: [] for i in cand}
    for d in recent:
        for i in set(d.main) | set(d.side):
            if i in by_card and d.day >= cand[i][0]:
                by_card[i].append(d)
    fam_tot: dict[int, Counter] = {}
    rows, watch, used_t, used_f, used_v = [], [], set(), set(), set()
    arch_names = {aid: name for aid, name, _ in arch_of.values()}
    for i in sorted(cand, key=lambda i: (-len(by_card[i]), order[i])):
        since, ub = cand[i]
        mine = by_card[i]
        n = len(mine)
        players = len({d.player for d in mine if d.player >= 0})
        first = firsts.get(order[i], since)
        kind = category(db, order[i], first, ub)
        if n < MIN_DECKS or players < MIN_PLAYERS:
            if n >= WATCH_MIN_DECKS:
                watch.append([i, kind, iso(first), n, players])
            continue
        # archetipi: quota dei suoi mazzi e adozione nella famiglia (mazzi della famiglia dallo stesso giorno)
        if since not in fam_tot:
            fam_tot[since] = Counter(d.fam or "x" for d in recent if d.day >= since)
        fc = Counter(d.fam or "x" for d in mine)
        archs = [[f, k, fam_tot[since][f]] for f, k in sorted(fc.items(), key=lambda x: (-x[1], x[0]))[:TOP_ARCHS]]
        used_f.update(f for f, *_ in archs)
        main_only = sum(1 for d in mine if i in d.main and i not in d.side)
        side_only = sum(1 for d in mine if i not in d.main)
        copies = Counter(min(4, d.main.get(i, 0) + d.side.get(i, 0)) for d in mine)
        variant, rep, new_deck = replaced(i, mine, recent, since, basics)
        if rep or new_deck:
            used_v.add(variant)
        together = Counter()
        for d in mine:
            together.update(c for c in set(d.main) | set(d.side) if c != i and c not in basics)
        w0 = monday(since)
        weeks = list(range(w0, last_week + 1, 7))
        wc = Counter(monday(d.day) for d in mine)
        best = sorted(mine, key=lambda d: (score(d.result), -d.day, d.ti))[:TOP_BEST]
        used_t.update(d.ti for d in best)
        row = {
            "c": i, "k": kind, "f": iso(first), "d": n, "p": players,
            "a": archs,
            "z": [main_only, side_only, n - main_only - side_only],
            "q": [copies[k] for k in (1, 2, 3, 4)],
            "rv": variant if rep or new_deck else "", "r": rep,
            "w0": iso(w0), "w": [wc[w] for w in weeks], "wt": [week_tot[w] for w in weeks],
            "co": [[c, k] for c, k in sorted(together.items(), key=lambda x: (-x[1], x[0]))[:TOP_WITH]],
            "b": [[tids[d.ti], d.result] for d in best],
        }
        if ub is not None:
            row["u"] = iso(ub)
        if new_deck:
            row["nd"] = 1
        rows.append(row)
    names = {f: (fams[f][0] if f in fams else "") for f in sorted(used_f)}
    head = {
        "v": 1, "anchor": iso(anchor), "max": MAX_DAYS, "minDecks": MIN_DECKS, "minPlayers": MIN_PLAYERS,
        # l'ultima settimana è completa solo se l'ultimo torneo è di domenica
        "lastWeekPartial": int(dt.date.fromordinal(anchor).isoweekday() != 7),
        "fam": names,
        "arch": {v: arch_names.get(v, "") for v in sorted(used_v)},  # variante del confronto "al posto di"
        "t": {str(tids[ti]): [iso(tours[ti].day), tours[ti].name, tours[ti].uri, tours[ti].kind]
              for ti in sorted(used_t)},
        "o": watch,
    }
    head_s = dumps(head)[:-1]
    body = ",\n".join(dumps(r) for r in rows)
    out.write_text(f'{head_s},"c":[\n{body}\n]}}\n', "utf-8", newline="\n")
    write_review(review, rows, watch, head, db, order)
    info = {"carte": len(rows), "in_osservazione": len(watch), "sbloccate": len(unban)}
    log(f"debutti: {info}")
    return info


KIND = {"n": "nuova", "l": "appena legale", "u": "tolta dalle bandite", "r": "riscoperta"}


def write_review(path: Path, rows: list, watch: list, head: dict, db: CardDB, order: list[str]) -> None:
    name = lambda i: db.cards[order[i]].name if order[i] in db.cards else "?"  # noqa: E731
    lines = [f"# Debutti (ultimo torneo {head['anchor']})", "",
             f"Prima apparizione entro {head['max']} giorni, almeno {head['minDecks']} mazzi e "
             f"{head['minPlayers']} giocatori.", "",
             "| Carta | Prima | Categoria | Mazzi | Giocatori | Archetipo principale | Al posto di |",
             "|---|---|---|---|---|---|---|"]
    for r in rows:
        f, k, tot = r["a"][0] if r["a"] else ("x", 0, 1)
        label = head["fam"].get(f) or "non classificate"
        arch = f"{label} {100 * k / r['d']:.0f}% (adozione {100 * k / max(1, tot):.0f}%)"
        rep = ", ".join(f"{name(c)} {a / 10:.0f}%→{b / 10:.0f}%" + (f" (senza {w / 10:.0f}%)" if w >= 0 else "")
                        for c, a, b, w in r["r"])
        rep = rep or ("mazzo nuovo" if r.get("nd") else "—")
        if r["rv"]:
            rep = f"{head['arch'].get(r['rv']) or 'non classificate'}: {rep}"
        lines.append(f"| {name(r['c'])} | {r['f']} | {KIND[r['k']]} | {r['d']} | {r['p']} | {arch} | {rep} |")
    lines += ["", "## In osservazione", "", "| Carta | Prima | Categoria | Mazzi | Giocatori |",
              "|---|---|---|---|---|"]
    lines += [f"| {name(i)} | {f} | {KIND[k]} | {n} | {p} |" for i, k, f, n, p in watch]
    path.write_text("\n".join(lines) + "\n", "utf-8", newline="\n")
