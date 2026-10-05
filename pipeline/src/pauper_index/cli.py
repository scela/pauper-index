"""python -m pauper_index <comando>

  build      aggiorna fonte e bulk, ricalcola tutto e scrive data/
  sets       set d'ingresso: validazione della regola ed elenco dei set rilevanti (ultimi 2 anni)
  baseline   confronto con baseline/pauper-2026-09-14.csv
  review     revisioni dopo le espansioni (--force SET per forzarne una)
  alarm      allarme "fonte ferma" (scrive il testo della Issue in .cache/issues/)
  changed    exit 0 se data/ ha cambiamenti significativi da committare

Opzioni: --offline (niente rete: usa cache e fuzzy_matches.csv), --no-fetch (non aggiorna la fonte).
"""

import argparse
import csv
import datetime as dt
import json
import sys
from collections import Counter

from . import config
from .build import build, distinct_names, prepare
from .outputs import iso
from .sets import entry_map, relevant_sets, validate
from .stats import compute

BASELINE_FILE = config.BASELINE_DIR / "pauper-2026-09-14.csv"
BASELINE_DATE = dt.date(2026, 9, 14)
BASELINE_NUMBERS = {"tornei": 8496, "mazzi": 204366, "nomi_storico": 4992, "nomi_12_mesi": 3064}


def cmd_build(args) -> None:
    s = build(online=not args.offline, fetch=not args.no_fetch)
    print(json.dumps(s, ensure_ascii=False, indent=2))


def _md_table(header: list[str], rows: list[list]) -> str:
    out = ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)]
    out += ["| " + " | ".join(str(x) for x in r) + " |" for r in rows]
    return "\n".join(out)


def cmd_sets(args) -> None:
    ctx = prepare(online=not args.offline, fetch=False)
    stats, *_ = compute(ctx.kept, ctx.keymap, ctx.key_oids, config.WINDOWS)
    entries = entry_map(ctx.db)
    v = validate(ctx.db, entries)
    rows = relevant_sets(ctx.db, entries, ctx.sets_info, set(stats), dt.date.today(),
                         threshold=config.RELEVANT_SET_MIN_CARDS)
    played = set(stats)
    lines = [
        "# Set d'ingresso: validazione della regola",
        "",
        f"Generato il {dt.date.today().isoformat()}. Regola: prima printing `common` con `games` che contiene "
        "`paper` o `mtgo`, uscita entro oggi; escluse le printing di set memorabilia o token, "
        "con bordo argentato o con timbro acorn (Unfinity).",
        "",
        f"- Carte legali o bannate senza printing d'ingresso: **{len(v['legali_senza_ingresso'])}**"
        f" (giocate: {sum(1 for n in v['legali_senza_ingresso'] if n in {ctx.db.cards[o].name for o in played})})",
        f"- Carte con printing d'ingresso ma `not_legal`: **{len(v['ingresso_ma_non_legali'])}**",
        "",
        "## Legali o bannate senza printing d'ingresso",
        "",
        *[f"- {n}" for n in v["legali_senza_ingresso"]],
        "",
        "## Con printing d'ingresso ma non legali",
        "",
        *[f"- {n}" for n in v["ingresso_ma_non_legali"]],
        "",
        f"## Set degli ultimi 2 anni (soglia {config.RELEVANT_SET_MIN_CARDS} carte)",
        "",
        "`ingresso` = carte che entrano nel Pauper con quel set; `gruppo` = somma sul `parent_set_code`.",
        "",
        _md_table(["uscita", "set", "nome", "tipo", "digitale", "ingresso", "giocate", "gruppo", "tot. gruppo",
                   "rilevante (set)", "rilevante (gruppo)"],
                  [[r["uscita"], r["set"], r["nome"], r["tipo"], "sì" if r["digitale"] else "",
                    r["carte_ingresso"], r["giocate"], r["gruppo"], r["carte_gruppo"],
                    "**sì**" if r["rilevante_set"] else "", "**sì**" if r["rilevante_gruppo"] else ""]
                   for r in rows]),
        "",
    ]
    out = config.REVIEWS / "set-ingresso.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines), "utf-8", newline="\n")
    print("\n".join(lines[:8]))
    print(f"\nscritto {out}")


def cmd_baseline(args) -> None:
    ctx = prepare(online=not args.offline, fetch=False)
    db = ctx.db
    with open(BASELINE_FILE, encoding="utf-8-sig", newline="") as f:
        brows = list(csv.DictReader(f))
    base = {db.by_id[r["Scryfall ID"]] for r in brows if r["Scryfall ID"] in db.by_id}
    cutoff = BASELINE_DATE.toordinal()
    y1 = cutoff - 365

    raw_t = [t for t in ctx.raw if t.day <= cutoff]
    kept_t = [t for t in ctx.kept if t.day <= cutoff]
    stats, totals, _, kept_c = compute(ctx.kept, ctx.keymap, ctx.key_oids, config.WINDOWS,
                                       anchor=cutoff, cutoff=cutoff)
    played = {o for o, s in stats.items() if s.decks_any[1]}
    variants = {
        "giocate 12 mesi": played,
        "giocate 12 mesi, legali oggi": {o for o in played if db.cards[o].pauper == "legal"},
        "giocate 12 mesi, legali o bannate": {o for o in played if db.cards[o].pauper != "not_legal"},
        "giocate 12 mesi, escluse terre base": {o for o in played if not db.cards[o].basic},
    }
    best = min(variants, key=lambda k: len(variants[k] ^ base))
    new = variants[best]

    def info(o):
        s = stats.get(o)
        c = db.cards[o]
        if s is None:
            return [c.name, c.pauper, 0, "mai"]
        return [c.name, c.pauper, s.decks_any[1], iso(s.last)]

    only_base = sorted((info(o) for o in base - new), key=lambda r: (-r[2], r[0]))
    only_new = sorted((info(o) for o in new - base), key=lambda r: (-r[2], r[0]))
    reasons = Counter()
    for o in base - new:
        s = stats.get(o)
        c = db.cards[o]
        if s is None:
            reasons["mai giocata nei dati"] += 1
        elif not s.decks_any[1]:
            reasons["non giocata nei 12 mesi"] += 1
        elif c.pauper != "legal":
            reasons[f"legalità oggi: {c.pauper}"] += 1
        else:
            reasons["altro"] += 1

    nomi_storico = len(distinct_names(kept_t))
    nomi_12 = len(distinct_names(kept_t, y1))
    raw_names_12 = len(distinct_names(raw_t, y1))
    raw_names_all = len(distinct_names(raw_t))
    lines = [
        f"# Confronto con la baseline del {BASELINE_DATE.isoformat()}",
        "",
        f"Dati tagliati al {BASELINE_DATE.isoformat()}; finestra 12 mesi ancorata a quella data.",
        "",
        _md_table(["voce", "baseline", "senza dedup", "con dedup"], [
            ["tornei", BASELINE_NUMBERS["tornei"], len(raw_t), len(kept_t)],
            ["mazzi", BASELINE_NUMBERS["mazzi"], sum(len(t.decks) for t in raw_t),
             sum(len(t.decks) for t in kept_t)],
            ["primo torneo", "2014-05", iso(min(t.day for t in raw_t)), iso(min(t.day for t in kept_t))],
            ["nomi grezzi distinti, storico", BASELINE_NUMBERS["nomi_storico"], raw_names_all, nomi_storico],
            ["nomi grezzi distinti, 12 mesi", BASELINE_NUMBERS["nomi_12_mesi"], raw_names_12, nomi_12],
            ["oracle_id distinti, storico", "", "", len(stats)],
            ["oracle_id distinti, 12 mesi", "", "", len(played)],
            ["mazzi nella finestra 12 mesi", "", "", totals[1]["decks"]],
        ]),
        "",
        f"Righe della List baseline: {len(brows)}; oracle_id distinti: {len(base)}.",
        "",
        "Varianti della definizione (differenza simmetrica con la baseline):",
        "",
        _md_table(["definizione", "carte", "solo baseline", "solo nuova"],
                  [[k, len(v), len(base - v), len(v - base)] for k, v in variants.items()]),
        "",
        f"Variante più vicina: **{best}**.",
        "",
        "Motivi delle carte solo nella baseline: " + ", ".join(f"{k} {v}" for k, v in reasons.most_common()),
        "",
        f"## Solo nella baseline ({len(only_base)})",
        "",
        _md_table(["carta", "legalità oggi", "mazzi 12 mesi", "ultima"], only_base),
        "",
        f"## Solo nella nuova lista ({len(only_new)})",
        "",
        _md_table(["carta", "legalità oggi", "mazzi 12 mesi", "ultima"], only_new),
        "",
    ]
    out = config.REVIEWS / f"baseline-{BASELINE_DATE.isoformat()}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines), "utf-8", newline="\n")
    print("\n".join(lines[:30]))
    print(f"\nscritto {out}")


def cmd_review(args) -> None:
    from .carddb import CardDB
    from .review import group_entries, run_reviews
    from .scryfall import Api, ensure_bulk, fetch_sets, iter_jsonl

    api = None if args.offline else Api()
    oracle, _ = ensure_bulk("oracle_cards", api)
    default, _ = ensure_bulk("default_cards", api)
    sets_info = fetch_sets(api)
    db = CardDB(iter_jsonl(oracle), iter_jsonl(default))
    today = dt.date.fromisoformat(args.today) if args.today else dt.date.today()
    run_reviews(sets_info, group_entries(entry_map(db), sets_info), today, force=args.force)


def cmd_alarm(args) -> None:
    import os

    from .review import stale_alarm

    meta = json.loads((config.DATA / "meta.json").read_text("utf-8"))
    today = dt.date.fromisoformat(args.today) if args.today else dt.date.today()
    stale_alarm(meta, today, token=os.environ.get("GITHUB_TOKEN"))


VOLATILE_META = ("generated_at",)
VOLATILE_SOURCE = ("commit", "commit_date", "days_since_last_tournament")


def _stable_meta(text: str) -> dict:
    m = json.loads(text)
    for k in VOLATILE_META:
        m.pop(k, None)
    for k in VOLATILE_SOURCE:
        m.get("source", {}).pop(k, None)
    return m


def cmd_changed(args) -> None:
    """Exit 0 se data/ contiene cambiamenti significativi rispetto a HEAD, 1 altrimenti.

    Se cambia solo la parte volatile di meta.json (data di generazione, commit della fonte), la ripristina.
    """
    import subprocess

    def git(*a):
        return subprocess.run(["git", *a], cwd=config.ROOT, capture_output=True, text=True, check=False).stdout

    changed = [f for f in git("status", "--porcelain", "--", "data").splitlines() if f.strip()]
    paths = [line[3:].strip() for line in changed]
    others = [p for p in paths if p != "data/meta.json"]
    meta_changed = "data/meta.json" in paths
    if meta_changed and not others:
        old = git("show", "HEAD:data/meta.json")
        new = (config.DATA / "meta.json").read_text("utf-8")
        if old and _stable_meta(old) == _stable_meta(new):
            git("checkout", "--", "data/meta.json")
            print("nessun cambiamento significativo (solo date di generazione)")
            raise SystemExit(1)
    if not paths:
        print("nessun cambiamento")
        raise SystemExit(1)
    print("cambiamenti: " + ", ".join(paths[:20]) + (" …" if len(paths) > 20 else ""))


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(prog="pauper_index", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["build", "sets", "baseline", "review", "alarm", "changed"])
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--no-fetch", action="store_true")
    ap.add_argument("--force", help="review: forza la revisione di questo set (codice Scryfall)")
    ap.add_argument("--today", help="review/alarm: data di riferimento AAAA-MM-GG (per i test)")
    args = ap.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    {"build": cmd_build, "sets": cmd_sets, "baseline": cmd_baseline, "review": cmd_review, "alarm": cmd_alarm,
     "changed": cmd_changed}[args.command](args)
