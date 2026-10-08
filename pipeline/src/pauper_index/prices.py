"""Prezzi indicativi in euro: Cardmarket (`prices.eur`, `prices.eur_foil`) dal bulk default_cards di Scryfall.

Uscita: data/prices.json, allineato a data/printings.json (stesse carte, stesse printing, stesso ordine):
  {v, date, p}: p[i] = [eur, eur_foil, eur, eur_foil, …] in centesimi, una coppia per printing della carta i;
  0 = prezzo assente. La data è l'aggiornamento del bulk.
Si genera dagli Scryfall ID di printings.json, quindi si può rigenerare da sola (comando `prices`) con un bulk più
recente, senza ricalcolare il resto.
"""

import json
from pathlib import Path

from . import config
from .outputs import write_lines_json
from .scryfall import iter_jsonl


def cents(value) -> int:
    try:
        return max(0, round(float(value) * 100)) if value else 0
    except (TypeError, ValueError):
        return 0


def build_prices(printings: dict, cards, updated_at: str) -> tuple[dict, list]:
    """`printings`: contenuto di printings.json; `cards`: oggetti del bulk default_cards."""
    wanted = {p[0] for plist in printings["p"] for p in plist}
    found: dict[str, tuple[int, int]] = {}
    for c in cards:
        if c.get("id") in wanted:
            pr = c.get("prices") or {}
            found[c["id"]] = (cents(pr.get("eur")), cents(pr.get("eur_foil")))
    rows = [[x for p in plist for x in found.get(p[0], (0, 0))] for plist in printings["p"]]
    return {"v": 1, "date": (updated_at or "")[:10]}, rows


def write_prices(default_path: Path, updated_at: str, data_dir: Path = config.DATA) -> dict:
    printings = json.loads((data_dir / "printings.json").read_text("utf-8"))
    head, rows = build_prices(printings, iter_jsonl(default_path), updated_at)
    write_lines_json(data_dir / "prices.json", head, "p", rows)
    n = sum(len(r) // 2 for r in rows)
    priced = sum(1 for r in rows for k in range(0, len(r), 2) if r[k] or r[k + 1])
    return {"printing": n, "con_prezzo": priced, "data": head["date"]}
