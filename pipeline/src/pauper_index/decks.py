"""Decklist recenti per "Mazzi che puoi costruire" (funzione 4) e, in seguito, per il Brewing.

Uscite (in data/):
- decks-61.json, decks-365.json: tornei, archetipi e liste distinte della finestra (le liste identiche, main e
  side, sono unite: ogni lista porta le sue apparizioni). Carte come indici di cards.json. Mai nomi dei
  giocatori né AnchorUri: solo Tournament.Uri.
- reviews/archetipi-auto.json: registro dei gruppi automatici (stato interno, committato, non pubblicato).
- reviews/archetipi.md: tabella degli archetipi della finestra a 61 giorni, per la revisione dei nomi.

Archetipi, in due livelli (vedi CLAUDE.md, "Archetipi"):
1. curati (data/manual/archetypes.csv, scritto a mano): una lista prende il nome se il main contiene almeno
   `minimo` delle carte chiave. Dipende solo dalla lista, quindi è stabile da un giorno all'altro. Con `colori` = 1
   il nome porta davanti la combinazione di colori della lista ("Dimir Faeries", "Mono-Blue Terror");
2. automatici, per le liste non coperte: gruppi per somiglianza delle carte del main (senza terre), con
   un'identità salvata nel registro. Il nome si fissa alla creazione (colori + 2 carte caratteristiche) e non si
   ricalcola; ogni giorno le liste si assegnano prima ai gruppi esistenti e solo quelle rimaste formano gruppi nuovi.
"""

import csv
import datetime as dt
import json
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from . import config
from .carddb import CardDB
from .outputs import dumps, iso
from .source import Tournament

WINDOWS = (61, 365)
MIN_MAIN = 40  # liste con meno carte nel main sono incomplete (dati rotti o parziali): si scartano
NORMAL_BASICS = ("Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes")  # sempre disponibili

JOIN = 0.40  # somiglianza minima per entrare in un gruppo automatico esistente
NEW = 0.45  # somiglianza per formare un gruppo nuovo tra le liste rimaste
MIN_GROUP = 6  # apparizioni minime perché un gruppo nuovo venga registrato
CORE = 0.5  # una carta è nel "nucleo" del gruppo se compare in almeno metà delle sue liste

ARCHETYPES_CSV = config.MANUAL / "archetypes.csv"
REGISTRY = config.REVIEWS / "archetipi-auto.json"


@dataclass
class DeckList:
    main: dict[int, int]
    side: dict[int, int]
    first: int  # primo giorno in cui compare
    uses: list[tuple[int, object]] = field(default_factory=list)  # (indice torneo, piazzamento)
    arch: str = ""  # chiave dell'archetipo: "c:<nome>" curato, "a:<id>" automatico, "" non classificato

    def key(self) -> tuple:
        return (tuple(sorted(self.main.items())), tuple(sorted(self.side.items())))


@dataclass
class Curated:
    name: str
    cards: list[str]  # oracle_id delle carte chiave
    minimum: int
    colors: bool = False  # il nome porta davanti i colori della lista (Affinity, Faeries, Terror)


def flat(d: dict[int, int]) -> list[int]:
    return [x for k in sorted(d) for x in (k, d[k])]


def to_cards(arr, keymap: list[int], key_oids: list[str | None], pos: dict[str, int]) -> tuple[dict[int, int], int]:
    """Coppie piatte (id nome, copie) -> {indice carta: copie}; restituisce anche le copie non risolte."""
    out: dict[int, int] = {}
    lost = 0
    for k in range(0, len(arr), 2):
        oid = key_oids[keymap[arr[k]]]
        i = pos.get(oid) if oid else None
        if i is None:
            lost += arr[k + 1]
            continue
        out[i] = out.get(i, 0) + arr[k + 1]
    return out, lost


def collect(kept: list[Tournament], keymap, key_oids, pos: dict[str, int],
            since: int) -> tuple[list[Tournament], list[DeckList], dict]:
    """Tornei e liste distinte dopo il giorno `since` (escluso)."""
    tours = sorted((t for t in kept if t.day > since), key=lambda t: (t.day, t.name, t.uri))
    lists: dict[tuple, DeckList] = {}
    stats = Counter()
    for ti, t in enumerate(tours):
        for d in t.decks:
            main, lost_m = to_cards(d.main, keymap, key_oids, pos)
            side, lost_s = to_cards(d.side, keymap, key_oids, pos)
            stats["copie_non_risolte"] += lost_m + lost_s
            if sum(main.values()) < MIN_MAIN:
                stats["mazzi_incompleti"] += 1
                continue
            dl = DeckList(main, side, d.day)
            k = dl.key()
            dl = lists.setdefault(k, dl)
            dl.first = min(dl.first, d.day)
            dl.uses.append((ti, d.result))
            stats["mazzi"] += 1
    # ordine stabile: per prima apparizione, poi per contenuto (le liste nuove si aggiungono in fondo)
    ordered = sorted(lists.values(), key=lambda x: (x.first, x.key()))
    stats["liste"] = len(ordered)
    return [t for t in tours], ordered, dict(stats)


# ---------- archetipi ----------

def load_curated(db: CardDB, path: Path | None = None) -> list[Curated]:
    """archetypes.csv: nome,carte (separate da ';'),minimo. L'ordine del file è la priorità a parità di punteggio."""
    path = path or ARCHETYPES_CSV
    if not path.exists():
        return []
    out = []
    with open(path, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            names = [n.strip() for n in row["carte"].split(";") if n.strip()]
            # stesso indice dei nomi delle decklist: il nome completo vince sulle facce (per esempio la seconda
            # faccia di una carta "prepare" che porta il nome di Tolarian Terror)
            found = {n: db.lookup(n)[0] for n in names}
            missing = [n for n, o in found.items() if not o]
            if missing:
                raise ValueError(f"archetypes.csv, {row['nome']}: carte sconosciute {missing}")
            oids = list(found.values())
            out.append(Curated(row["nome"].strip(), oids, int(row.get("minimo") or min(2, len(oids))),
                               (row.get("colori") or "").strip() == "1"))
    return out


def curated_match(main_oids: set[str], curated: list[Curated]) -> str | None:
    best, score = None, 0.0
    for c in curated:
        hit = sum(1 for o in c.cards if o in main_oids)
        if hit >= c.minimum and hit / len(c.cards) > score:
            best, score = c.name, hit / len(c.cards)
    return best


def jaccard(a: set, b: set) -> float:
    return len(a & b) / len(a | b) if a or b else 0.0


COLOR_ORDER = "WUBRG"
# nomi usati dalla comunità per le combinazioni di colori (chiavi nell'ordine WUBRG)
COLOR_NAMES = {
    "": "Colorless", "W": "Mono-White", "U": "Mono-Blue", "B": "Mono-Black", "R": "Mono-Red", "G": "Mono-Green",
    "WU": "Azorius", "UB": "Dimir", "BR": "Rakdos", "RG": "Gruul", "WG": "Selesnya",
    "WB": "Orzhov", "UR": "Izzet", "BG": "Golgari", "WR": "Boros", "UG": "Simic",
    "WUB": "Esper", "UBR": "Grixis", "BRG": "Jund", "WRG": "Naya", "WUG": "Bant",
    "WBG": "Abzan", "WUR": "Jeskai", "UBG": "Sultai", "WBR": "Mardu", "URG": "Temur",
}


def color_name(colors: str) -> str:
    return COLOR_NAMES.get(colors) or ("Four-Color" if len(colors) == 4 else "Five-Color")


def deck_colors(main: dict[int, int], oids: list[str], db: CardDB) -> str:
    """Colori del mazzo: almeno 4 copie di carte non terra che li richiedono nel costo, e almeno una terra che li
    produce (così una carta che si gioca senza lanciarla, come Sneaky Snacker nel Red Madness, non conta)."""
    n = Counter()
    sources = set()
    for i, q in main.items():
        c = db.cards.get(oids[i])
        if not c:
            continue
        if "Land" in c.type_line:
            sources.update(c.produces)
        else:
            for x in c.colors:
                n[x] += q
    return "".join(x for x in COLOR_ORDER if n[x] >= 4 and (x in sources or not sources))


def characteristic(members: list[DeckList], spells: list[set[int]], idx_of: dict[int, int],
                   freq: Counter, total: int, k: int = 2) -> list[int]:
    """Carte caratteristiche: frequenti nel gruppo e rare fuori (lift), solo non terre."""
    w = sum(len(m.uses) for m in members)
    cnt = Counter()
    for m in members:
        for i in spells[idx_of[id(m)]]:
            cnt[i] += len(m.uses)
    score = {i: (v / w) * ((v / w) / (freq[i] / total)) for i, v in cnt.items() if v / w >= 0.6}
    return [i for i, _ in sorted(score.items(), key=lambda x: (-x[1], x[0]))[:k]]


def classify(lists: list[DeckList], db: CardDB, oids: list[str], today: str) -> dict:
    """Assegna l'archetipo a ogni lista (in place) e aggiorna il registro dei gruppi automatici, che restituisce."""
    curated = load_curated(db)
    registry = json.loads(REGISTRY.read_text("utf-8")) if REGISTRY.exists() else {"next": 1, "groups": []}
    groups = registry["groups"]
    is_land = ["Land" in db.cards[o].type_line if o in db.cards else False for o in oids]
    spells = [{i for i in dl.main if not is_land[i]} for dl in lists]
    idx_of = {id(dl): k for k, dl in enumerate(lists)}
    freq = Counter()
    total = 0
    for dl, sp in zip(lists, spells, strict=True):
        total += len(dl.uses)
        for i in sp:
            freq[i] += len(dl.uses)

    # 1) curati
    rest = []
    for dl in lists:
        name = curated_match({oids[i] for i in dl.main}, curated)
        if name:
            dl.arch = f"c:{name}"
        else:
            rest.append(dl)

    # 2) gruppi automatici esistenti: nucleo fisso (in oracle_id) e primo gruppo registrato abbastanza simile.
    # L'assegnazione dipende solo dalla lista e dal registro (a cui si aggiungono gruppi, mai si modificano):
    # un gruppo nuovo nasce solo da liste che nessun gruppo esistente accoglie, quindi non ne "ruba" altre.
    pos = {o: i for i, o in enumerate(oids)}
    cores = [{pos[o] for o in g["core"] if o in pos} for g in groups]
    left = []
    for dl in rest:
        sp = spells[idx_of[id(dl)]]
        gi = next((k for k, core in enumerate(cores) if jaccard(core, sp) >= JOIN), -1)
        if gi >= 0:
            dl.arch = f"a:{groups[gi]['id']}"
            groups[gi]["seen"] = today
        else:
            left.append(dl)

    # 3) gruppi nuovi tra le liste rimaste (ordine deterministico)
    clusters: list[tuple[Counter, list[DeckList]]] = []
    for dl in sorted(left, key=lambda x: (-len(spells[idx_of[id(x)]]), x.key())):
        sp = spells[idx_of[id(dl)]]
        best, bs = None, 0.0
        for c in clusters:
            core = {k for k, v in c[0].items() if v >= CORE * len(c[1])}
            s = jaccard(core, sp)
            if s > bs:
                best, bs = c, s
        if best is not None and bs >= NEW:
            best[0].update(sp)
            best[1].append(dl)
        else:
            clusters.append((Counter(sp), [dl]))
    for cnt, mem in clusters:
        if sum(len(m.uses) for m in mem) < MIN_GROUP:
            continue
        top = characteristic(mem, spells, idx_of, freq, total)
        colors = Counter(deck_colors(m.main, oids, db) for m in mem).most_common(1)[0][0]
        g = {"id": registry["next"], "name": " + ".join(db.cards[oids[i]].name for i in top), "colors": colors,
             "core": sorted(oids[k] for k, v in cnt.items() if v >= CORE * len(mem)), "created": today, "seen": today}
        registry["next"] += 1
        groups.append(g)
    # il raggruppamento propone solo i gruppi nuovi: le liste rimaste si assegnano con la stessa regola dei giorni
    # successivi (primo gruppo registrato abbastanza simile), così l'assegnazione di oggi è quella di domani
    cores = [{pos[o] for o in g["core"] if o in pos} for g in groups]
    for dl in left:
        sp = spells[idx_of[id(dl)]]
        gi = next((k for k, core in enumerate(cores) if jaccard(core, sp) >= JOIN), -1)
        if gi >= 0:
            dl.arch = f"a:{groups[gi]['id']}"
            groups[gi]["seen"] = today
    return registry


# ---------- uscite ----------

def archetype(key: str, colors: str, registry: dict, curated: list[Curated]) -> tuple[str, list]:
    """Identificativo stabile e voce [nome, colori, tipo] di una lista. c<n> curato (riga del CSV; con i colori nel
    nome c<n><colori>, per esempio c7UB = "Dimir Faeries"), a<n> automatico, x<colori> non classificato."""
    if key.startswith("c:"):
        n, c = next((n, c) for n, c in enumerate(curated, 1) if c.name == key[2:])
        if c.colors:
            return f"c{n}{colors}", [f"{color_name(colors)} {c.name}", colors, "c"]
        return f"c{n}", [c.name, "", "c"]
    if key.startswith("a:"):
        g = next(g for g in registry["groups"] if g["id"] == int(key[2:]))
        return f"a{g['id']}", [g["name"], g["colors"], "a"]
    return f"x{colors}", ["", colors, "x"]  # non classificato: il sito mostra solo i colori


def tournament_ids(tours: list[Tournament]) -> list[int]:
    """Identificativo stabile di un torneo: giorno (AAAAMMGG) * 100 + progressivo nel giorno (ordine per nome e
    Uri). Non dipende dalla finestra, quindi le righe delle liste non cambiano quando un torneo vecchio ne esce."""
    out, seq, last = [], 0, None
    for t in tours:  # già ordinati per giorno, nome, Uri
        seq = seq + 1 if t.day == last else 0
        last = t.day
        out.append(int(iso(t.day).replace("-", "")) * 100 + seq)
    return out


def build_window(days: int, tours: list[Tournament], lists: list[DeckList], db: CardDB, oids: list[str],
                 registry: dict, curated: list[Curated], anchor: int) -> tuple[dict, list]:
    tids = tournament_ids(tours)
    arch: dict[str, list] = {}

    def arch_of(key: str, colors: str) -> str:
        k, entry = archetype(key, colors, registry, curated)
        arch.setdefault(k, entry)
        return k

    used_t = sorted({ti for dl in lists for ti, _ in dl.uses})
    rows = []
    for dl in lists:
        colors = deck_colors(dl.main, oids, db)
        uses = sorted(([tids[ti], r] for ti, r in dl.uses), key=lambda x: (x[0], str(x[1])))
        rows.append([arch_of(dl.arch, colors), colors, flat(dl.main), flat(dl.side), uses])
    pos = {o: i for i, o in enumerate(oids)}
    head = {
        "v": 1,
        "days": days,
        "anchor": iso(anchor),
        "basics": sorted(pos[o] for o, c in db.cards.items() if c.name in NORMAL_BASICS and o in pos),
        "t": {str(tids[ti]): [iso(tours[ti].day), tours[ti].name, tours[ti].uri, tours[ti].kind] for ti in used_t},
        "a": dict(sorted(arch.items())),
    }
    return head, rows


def write_window(path: Path, head: dict, rows: list) -> None:
    """Una riga per lista (diff leggibili; git salva solo le differenze tra un giorno e l'altro)."""
    head_s = dumps(head)[:-1]
    body = ",\n".join(dumps(r) for r in rows)
    path.write_text(f'{head_s},"l":[\n{body}\n]}}\n', "utf-8", newline="\n")


def report(lists: list[DeckList], registry: dict, curated: list[Curated], db: CardDB, oids: list[str],
           path: Path) -> None:
    by_id = {g["id"]: g for g in registry["groups"]}
    total = sum(len(dl.uses) for dl in lists)
    agg: dict[tuple, list] = {}
    for dl in lists:
        colors = deck_colors(dl.main, oids, db)
        _, entry = archetype(dl.arch, colors, registry, curated)
        a = agg.setdefault((dl.arch, entry[0] if dl.arch.startswith("c:") else ""), [0, 0, Counter()])
        a[0] += len(dl.uses)
        a[1] += 1
        a[2][colors] += len(dl.uses)
    lines = ["# Archetipi degli ultimi 61 giorni", "",
             f"{total} mazzi, {len(lists)} liste distinte. Curati: data/manual/archetypes.csv; "
             "automatici: data/reviews/archetipi-auto.json (nome fissato alla creazione).", "",
             "| Mazzi | % | Liste | Tipo | Nome | Colori | Nucleo (prime carte) |", "|---|---|---|---|---|---|---|"]
    for (key, cname), (n, nl, cols) in sorted(agg.items(), key=lambda x: -x[1][0]):
        if key.startswith("c:"):
            kind, name, core = "curato", cname, ""
        elif key.startswith("a:"):
            g = by_id[int(key[2:])]
            kind, name = "automatico", g["name"]
            core = ", ".join(db.cards[o].name for o in g["core"][:6] if o in db.cards)
        else:
            kind, name, core = "non classificato", "—", ""
        colors = cols.most_common(1)[0][0] or "C"
        lines.append(f"| {n} | {100 * n / total:.1f} | {nl} | {kind} | {name} | {colors} | {core} |")
    path.write_text("\n".join(lines) + "\n", "utf-8", newline="\n")


def build_decks(kept: list[Tournament], keymap, key_oids, db: CardDB, order: list[str], anchor: int,
                out_dir: Path = config.DATA, review_dir: Path = config.REVIEWS, log=print) -> dict:
    pos = {o: i for i, o in enumerate(order)}
    today = dt.date.today().isoformat()
    # archetipi assegnati sulla finestra più lunga: ogni lista ha lo stesso archetipo in tutti i file
    tours, lists, stats = collect(kept, keymap, key_oids, pos, anchor - max(WINDOWS))
    registry = classify(lists, db, order, today)
    curated = load_curated(db)
    REGISTRY.parent.mkdir(parents=True, exist_ok=True)
    REGISTRY.write_text(json.dumps(registry, ensure_ascii=False, indent=1) + "\n", "utf-8", newline="\n")
    info = {"finestra_lunga": stats}
    for days in WINDOWS:
        since = anchor - days
        sub = [DeckList(dl.main, dl.side, dl.first, [u for u in dl.uses if tours[u[0]].day > since], dl.arch)
               for dl in lists]
        sub = [dl for dl in sub if dl.uses]
        for dl in sub:
            dl.first = min(tours[ti].day for ti, _ in dl.uses)
        sub.sort(key=lambda x: (x.first, x.key()))
        head, rows = build_window(days, tours, sub, db, order, registry, curated, anchor)
        write_window(out_dir / f"decks-{days}.json", head, rows)
        info[days] = {"tornei": len(head["t"]), "liste": len(rows), "mazzi": sum(len(r[4]) for r in rows)}
        if days == min(WINDOWS):
            report(sub, registry, curated, db, order, review_dir / "archetipi.md")
    log(f"mazzi: {info}")
    return info
