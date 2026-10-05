"""Orchestrazione: fonte + Scryfall -> risoluzione -> deduplica -> statistiche -> output."""

import datetime as dt
import time
from collections import Counter
from dataclasses import dataclass

from . import config, outputs
from .carddb import CardDB
from .dedup import dedupe
from .names import clean, norm
from .resolve import OnlineLog, Resolution, Resolver, load_aliases, load_excludes
from .scryfall import Api, ensure_bulk, fetch_sets, iter_jsonl
from .sets import entry_map
from .source import NameTable, Tournament, ensure_source, excluded_files, load_all, source_info
from .stats import compute, unresolved_stats

UNRESOLVED_METHODS = ("unresolved", "ambiguous")


@dataclass
class Context:
    db: CardDB
    sets_info: dict
    bulk: dict
    source: dict
    names: NameTable
    resolutions: list[Resolution]
    keymap: list[int]
    key_oids: list[str | None]
    raw: list[Tournament]
    kept: list[Tournament]
    dedup_log: dict
    timings: dict


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def prepare(online: bool = True, fetch: bool = True) -> Context:
    timings = {}
    t0 = time.monotonic()
    api = Api() if online else None
    if fetch:
        log("aggiorno la fonte")
        src = ensure_source()
    else:
        src = source_info()
    src["url"] = config.SOURCE_URL
    timings["fonte"] = round(time.monotonic() - t0, 1)

    t = time.monotonic()
    oracle_path, oracle_upd = ensure_bulk("oracle_cards", api)
    default_path, default_upd = ensure_bulk("default_cards", api)
    sets_info = fetch_sets(api)
    timings["download_scryfall"] = round(time.monotonic() - t, 1)
    t = time.monotonic()
    db = CardDB(iter_jsonl(oracle_path), iter_jsonl(default_path))
    timings["carica_scryfall"] = round(time.monotonic() - t, 1)
    log(f"Scryfall: {len(db.cards)} carte, {len(db.by_id)} printing")

    t = time.monotonic()
    raw, names = load_all()
    timings["carica_tornei"] = round(time.monotonic() - t, 1)
    log(f"fonte: {len(raw)} file, {sum(len(x.decks) for x in raw)} mazzi, {len(names.names)} nomi distinti")

    t = time.monotonic()
    online_log = OnlineLog(config.MANUAL / "fuzzy_matches.csv")
    resolver = Resolver(db, load_aliases(config.MANUAL / "aliases.csv"),
                        load_excludes(config.MANUAL / "exclude.csv"), online_log, api)
    try:
        resolutions = [resolver.resolve(n) for n in names.names]
    finally:
        online_log.save()
    timings["risoluzione"] = round(time.monotonic() - t, 1)
    if api:
        log(f"risoluzione: {api.requests} richieste API")

    key_of: dict[str, int] = {}
    key_oids: list[str | None] = []
    keymap = []
    for n, r in zip(names.names, resolutions, strict=True):
        k = r.oracle_id or "?" + norm(clean(n))
        if k not in key_of:
            key_of[k] = len(key_oids)
            key_oids.append(r.oracle_id)
        keymap.append(key_of[k])

    t = time.monotonic()
    kept, dlog = dedupe(raw, keymap)
    timings["deduplica"] = round(time.monotonic() - t, 1)
    log(f"deduplica: {dlog['dopo']['tournaments']} tornei, {dlog['dopo']['decks']} mazzi")
    bulk = {"oracle_cards": oracle_upd, "default_cards": default_upd}
    return Context(db, sets_info, bulk, src, names, resolutions, keymap, key_oids, raw, kept, dlog, timings)


def distinct_names(tournaments: list[Tournament], since: int | None = None) -> set[int]:
    out = set()
    for t in tournaments:
        for d in t.decks:
            if since is None or d.day > since:
                out.update(d.main[0::2])
                out.update(d.side[0::2])
    return out


def build(online: bool = True, fetch: bool = True) -> dict:
    ctx = prepare(online, fetch)
    db = ctx.db
    t = time.monotonic()
    stats, totals, anchor, kept = compute(ctx.kept, ctx.keymap, ctx.key_oids, config.WINDOWS)
    ctx.timings["statistiche"] = round(time.monotonic() - t, 1)
    entries = entry_map(db)

    head, rows, order = outputs.build_cards(db, stats, kept, entries, ctx.sets_info, config.WINDOWS, totals, anchor)
    outputs.write_lines_json(config.DATA / "cards.json", head, "c", rows)
    phead, prows = outputs.build_printings(db, order, ctx.sets_info)
    outputs.write_lines_json(config.DATA / "printings.json", phead, "p", prows)
    outputs.write_json(config.DATA / "sets.json", outputs.build_sets(db, order, ctx.sets_info))
    outputs.write_json(config.DATA / "names.json", outputs.build_names(db, order))
    outputs.write_json(config.DATA / "allnames.json", outputs.build_all_names(db))
    outputs.write_json(config.DATA / "cardnames.json", outputs.build_card_names(db))

    # report
    unresolved_ids = {i for i, r in enumerate(ctx.resolutions) if r.method in UNRESOLVED_METHODS}
    ustats = unresolved_stats(kept, ctx.names.names, unresolved_ids)
    method_of = {n: r.method for n, r in zip(ctx.names.names, ctx.resolutions, strict=True)}
    outputs.write_csv(
        config.REVIEWS / "unresolved.csv", ["nome", "mazzi", "occorrenze", "prima", "ultima", "motivo"],
        [[n, v[0], v[1], outputs.iso(v[2]), outputs.iso(v[3]), method_of[n]]
         for n, v in sorted(ustats.items(), key=lambda x: (-x[1][0], x[0]))],
    )
    deck_count = Counter()
    for tt in kept:
        for d in tt.decks:
            for nid in set(d.main[0::2]) | set(d.side[0::2]):
                deck_count[nid] += 1
    outputs.write_csv(
        config.REVIEWS / "risoluzione.csv", ["nome", "metodo", "carta", "mazzi"],
        sorted(([n, r.method, r.detail, deck_count[i]]
                for i, (n, r) in enumerate(zip(ctx.names.names, ctx.resolutions, strict=True))
                if r.method not in ("exact",) + UNRESOLVED_METHODS and deck_count[i]),
               key=lambda x: (x[1], -x[3], x[0])),
    )
    outputs.write_json(config.REVIEWS / "dedup.json", ctx.dedup_log, pretty=True)

    occ_total = sum(len(d.main) // 2 + len(d.side) // 2 for tt in kept for d in tt.decks)
    occ_unres = sum(v[1] for v in ustats.values())
    today = dt.date.today()
    days_since = (today - dt.date.fromordinal(anchor)).days
    y1 = anchor - 365
    methods = Counter(r.method for r in ctx.resolutions)
    meta = {
        "generated_at": dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat(),
        "last_tournament": outputs.iso(anchor),
        "tournaments": len(kept),
        "decks": sum(len(tt.decks) for tt in kept),
        "windows": [{"days": w, "decks": x["decks"], "tournaments": x["tournaments"]}
                    for w, x in zip(config.WINDOWS, totals, strict=True)],
        "cards": len(rows),
        "scryfall": ctx.bulk,
        "source": {**ctx.source, "status": "ferma" if days_since > config.STALE_SOURCE_DAYS else "ok",
                   "days_since_last_tournament": days_since},
        "dedup": {"before": ctx.dedup_log["prima"], "after": ctx.dedup_log["dopo"]},
        "resolution": {
            "distinct_names": len(ctx.names.names),
            "methods": dict(sorted(methods.items())),
            "unresolved_occurrences": occ_unres,
            "occurrences": occ_total,
            "unresolved_pct": round(100 * occ_unres / occ_total, 4) if occ_total else 0,
        },
    }
    outputs.write_json(config.DATA / "meta.json", meta, pretty=True)

    sizes = [outputs.size_info(config.DATA / f)
             for f in ("cards.json", "printings.json", "names.json", "allnames.json", "cardnames.json", "sets.json",
                       "meta.json")]
    names_hist = distinct_names(kept)
    names_y1 = distinct_names(kept, y1)
    summary = {
        "meta": meta,
        "sizes": sizes,
        "timings": ctx.timings,
        "file_esclusi_per_nome": excluded_files(config.SOURCE_DIR),
        "nomi_distinti_storico": len(names_hist),
        "nomi_distinti_12_mesi": len(names_y1),
        "oracle_storico": len(stats),
        "oracle_12_mesi": sum(1 for s in stats.values() if s.decks_any[1]),
    }
    return summary
