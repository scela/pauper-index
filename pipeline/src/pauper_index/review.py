"""Revisione dopo ogni espansione e allarme "fonte ferma".

- Una revisione per gruppo di set (`parent_set_code`) che rende Pauper-legali almeno N carte, quando
  oggi >= uscita del set principale + 60 giorni e la revisione non esiste ancora.
- Al primo avvio si crea solo lo snapshot di partenza: i gruppi già scaduti non vengono recuperati.
- Il report completo (con i nomi non risolti, testo grezzo delle decklist) resta nel repository e va
  nella Issue; nel sito va solo data/reviews/index.json, senza nomi grezzi.
"""

import csv
import datetime as dt
import json
from pathlib import Path

import requests

from . import config
from .sets import group_of

DEFAULT_WINDOW = 1  # indice in cards.json "w": ultimo anno


def load_cards(path: Path = config.DATA / "cards.json") -> dict:
    return json.loads(path.read_text("utf-8"))


def snapshot(cards: dict, unresolved: list[str], today: str) -> dict:
    tot = cards["tot"][DEFAULT_WINDOW][0] or 1
    default, legal = {}, {}
    for c in cards["c"]:
        legal[c["o"]] = [c["n"], c["l"]]
        st = c["s"][DEFAULT_WINDOW]
        if st and c["l"] == "l" and not c.get("b"):
            default[c["o"]] = [c["n"], st[0], round(100 * st[0] / tot, 2), c.get("e")]
    return {"date": today, "anchor": cards["anchor"], "decks": tot, "default": default, "legal": legal,
            "unresolved": sorted(unresolved)}


def read_unresolved(path: Path = config.REVIEWS / "unresolved.csv") -> list[str]:
    if not path.exists():
        return []
    with open(path, encoding="utf-8", newline="") as f:
        return [r["nome"] for r in csv.DictReader(f)]


def latest_snapshot(folder: Path = config.SNAPSHOTS) -> dict | None:
    files = sorted(folder.glob("*.json")) if folder.exists() else []
    return json.loads(files[-1].read_text("utf-8")) if files else None


def write_snapshot(snap: dict, folder: Path = config.SNAPSHOTS) -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    p = folder / f"{snap['date']}.json"
    p.write_text(json.dumps(snap, ensure_ascii=False, separators=(",", ":")) + "\n", "utf-8", newline="\n")
    return p


def group_entries(entries, sets_info: dict) -> dict[str, int]:
    """Carte Pauper-legali (o bannate) entrate con ciascun gruppo di set, anche se mai giocate.

    `entries`: oracle_id -> Printing d'ingresso (sets.entry_map, già limitato alle carte legali o bannate).
    """
    counts: dict[str, int] = {}
    for p in entries.values():
        g = group_of(p.set, sets_info)
        counts[g] = counts.get(g, 0) + 1
    return counts


def due_groups(sets_info: dict, state: dict, today: dt.date, counts: dict[str, int],
               delay: int = config.NEW_SET_DAYS, min_cards: int = config.RELEVANT_SET_MIN_CARDS) -> list[str]:
    baseline = dt.date.fromisoformat(state["baseline"])
    out = []
    for g, n in counts.items():
        s = sets_info.get(g)
        if n < min_cards or not s or g in state.get("done", {}):
            continue
        due = dt.date.fromisoformat(s["released_at"]) + dt.timedelta(days=delay)
        if baseline < due <= today:
            out.append(g)
    return sorted(out, key=lambda g: sets_info[g]["released_at"])


def build_review(group: str, sets_info: dict, prev: dict, cur: dict) -> dict:
    members = {code for code in sets_info if group_of(code, sets_info) == group} | {group}
    new_cards = sorted(([v[0], v[1], v[2]] for o, v in cur["default"].items() if v[3] in members),
                       key=lambda x: (-x[1], x[0]))
    entered = sorted(([v[0], v[1], v[2]] for o, v in cur["default"].items() if o not in prev["default"]),
                     key=lambda x: (-x[1], x[0]))
    left = sorted([v[0], v[1]] for o, v in prev["default"].items() if o not in cur["default"])
    legality = sorted([cur["legal"][o][0], prev["legal"][o][1], cur["legal"][o][1]]
                      for o in cur["legal"] if o in prev["legal"] and prev["legal"][o][1] != cur["legal"][o][1])
    new_unresolved = sorted(set(cur["unresolved"]) - set(prev["unresolved"]))
    s = sets_info[group]
    return {
        "set": group, "nome": s["name"], "uscita": s["released_at"], "data": cur["date"],
        "set_del_gruppo": sorted(members & set(sets_info)), "confronto_con": prev["date"],
        "mazzi_ultimo_anno": cur["decks"],
        "nuove": new_cards, "entrate": entered, "uscite": left, "legalita": legality,
        "non_risolti_nuovi": new_unresolved,
    }


LEGAL_IT = {"l": "legale", "b": "bannata", "n": "non legale"}


def to_markdown(r: dict) -> str:
    lines = [f"# Revisione: {r['nome']} ({r['set'].upper()})", "",
             f"Uscita {r['uscita']}; revisione del {r['data']}, confronto con lo snapshot del {r['confronto_con']}. "
             f"Set del gruppo: {', '.join(x.upper() for x in r['set_del_gruppo'])}. "
             f"Definizione: ultimo anno, almeno 1 mazzo, legale oggi, terre base escluse "
             f"({r['mazzi_ultimo_anno']} mazzi).", ""]
    lines += [f"## a) Carte del set entrate nella lista ({len(r['nuove'])})", ""]
    lines += [f"- {n}: {d} mazzi ({p}%)" for n, d, p in r["nuove"]] or ["- nessuna"]
    lines += ["", f"## b) Entrate nella lista ({len(r['entrate'])})", ""]
    lines += [f"- {n}: {d} mazzi ({p}%)" for n, d, p in r["entrate"]] or ["- nessuna"]
    lines += ["", f"## b) Uscite dalla lista ({len(r['uscite'])})", ""]
    lines += [f"- {n} (prima {d} mazzi)" for n, d in r["uscite"]] or ["- nessuna"]
    lines += ["", f"## c) Cambi di legalità ({len(r['legalita'])})", ""]
    lines += [f"- {n}: {LEGAL_IT[a]} → {LEGAL_IT[b]}" for n, a, b in r["legalita"]] or ["- nessuno"]
    lines += ["", f"## d) Nuovi nomi non risolti ({len(r['non_risolti_nuovi'])})", ""]
    lines += [f"- {n}" for n in r["non_risolti_nuovi"]] or ["- nessuno"]
    lines += ["", "Da fare: aggiungere gli alias in data/manual/aliases.csv "
              "o le esclusioni in data/manual/exclude.csv.", ""]
    return "\n".join(lines)


def summary(r: dict) -> str:
    bans = [f"{n} {LEGAL_IT[b]}" for n, a, b in r["legalita"]]
    parts = [f"{len(r['nuove'])} carte del set nella lista", f"{len(r['entrate'])} entrate",
             f"{len(r['uscite'])} uscite"]
    if bans:
        parts.append("legalità: " + ", ".join(bans[:5]) + (" …" if len(bans) > 5 else ""))
    return "; ".join(parts) + "."


def update_index(r: dict, path: Path = config.REVIEWS / "index.json") -> None:
    """Indice pubblico per la sezione Novità: niente nomi grezzi non risolti."""
    items = json.loads(path.read_text("utf-8")) if path.exists() else []
    items = [x for x in items if x["set"] != r["set"]]
    items.insert(0, {
        "set": r["set"], "nome": r["nome"], "uscita": r["uscita"], "data": r["data"], "sommario": summary(r),
        "nuove": r["nuove"][:40], "entrate": r["entrate"][:40], "uscite": r["uscite"][:40], "legalita": r["legalita"],
    })
    items.sort(key=lambda x: x["data"], reverse=True)
    path.write_text(json.dumps(items, ensure_ascii=False, indent=1) + "\n", "utf-8", newline="\n")


def run_reviews(sets_info: dict, all_entries: dict[str, int], today: dt.date, force: str | None = None,
                issues_dir: Path = config.CACHE / "issues") -> list[dict]:
    """Esegue le revisioni dovute. Restituisce i report; scrive il testo delle Issue in .cache/issues/."""
    state_path = config.REVIEWS / "state.json"
    cards = load_cards()
    cur = snapshot(cards, read_unresolved(), today.isoformat())
    if not state_path.exists():
        write_snapshot(cur)
        state_path.write_text(json.dumps({"baseline": today.isoformat(), "done": {}}, indent=1) + "\n", "utf-8",
                              newline="\n")
        print(f"revisioni: snapshot di partenza del {today.isoformat()} creato")
        return []
    state = json.loads(state_path.read_text("utf-8"))
    groups = due_groups(sets_info, state, today, all_entries)
    if force:
        if force not in sets_info:
            raise SystemExit(f"set sconosciuto: {force}")
        groups = [group_of(force, sets_info)]
    reports = []
    for g in groups:
        prev = latest_snapshot() or cur
        r = build_review(g, sets_info, prev, cur)
        (config.REVIEWS / f"{g}.json").write_text(json.dumps(r, ensure_ascii=False, indent=1) + "\n", "utf-8",
                                                 newline="\n")
        md = to_markdown(r)
        (config.REVIEWS / f"{g}.md").write_text(md, "utf-8", newline="\n")
        update_index(r)
        write_snapshot(cur)
        state.setdefault("done", {})[g] = today.isoformat()
        issues_dir.mkdir(parents=True, exist_ok=True)
        (issues_dir / f"revisione-{g}.md").write_text(f"Revisione: {r['nome']} ({g.upper()})\n{md}", "utf-8")
        reports.append(r)
        print(f"revisione {g}: {summary(r)}")
    state_path.write_text(json.dumps(state, indent=1) + "\n", "utf-8", newline="\n")
    if not reports:
        print("revisioni: nessuna da fare oggi")
    return reports


def stale_alarm(meta: dict, today: dt.date, issues_dir: Path = config.CACHE / "issues",
                token: str | None = None) -> bool:
    """Se l'ultimo torneo è più vecchio della soglia, scrive il testo della Issue con i fork aggiornati di recente."""
    last = dt.date.fromisoformat(meta["last_tournament"])
    days = (today - last).days
    if days <= config.STALE_SOURCE_DAYS:
        print(f"fonte: ok (ultimo torneo {last}, {days} giorni fa)")
        return False
    forks = []
    headers = {"Accept": "application/vnd.github+json", "User-Agent": config.USER_AGENT}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    for repo in ("Badaro/MTGODecklistCache", "Jiliac/MTGODecklistCache"):
        try:
            r = requests.get(f"https://api.github.com/repos/{repo}/forks", params={"per_page": 100, "sort": "newest"},
                             headers=headers, timeout=30)
            forks += [(f["pushed_at"], f["full_name"], f["html_url"]) for f in r.json() if isinstance(f, dict)]
        except requests.RequestException:
            pass
    forks = sorted(set(forks), reverse=True)[:10]
    body = [f"Fonte dati ferma: l'ultimo torneo è del {last} ({days} giorni fa, soglia {config.STALE_SOURCE_DAYS}).",
            "", f"Fonte attuale: {config.SOURCE_URL}", "", "Fork di MTGODecklistCache aggiornati più di recente:", ""]
    body += [f"- [{name}]({url}) — ultimo push {pushed[:10]}" for pushed, name, url in forks] or ["- nessuno trovato"]
    body += ["", "Per cambiare fonte: imposta la variabile PAUPER_INDEX_SOURCE_URL nel workflow (vedi README)."]
    issues_dir.mkdir(parents=True, exist_ok=True)
    (issues_dir / "fonte-ferma.md").write_text("Fonte dati ferma\n" + "\n".join(body) + "\n", "utf-8")
    print(f"fonte: FERMA (ultimo torneo {last}, {days} giorni fa)")
    return True
