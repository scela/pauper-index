"""Prezzi indicativi: allineati a printings.json, in centesimi, 0 se assenti."""

from pauper_index import prices


def test_cents():
    assert prices.cents("1.23") == 123
    assert prices.cents("0.1") == 10
    assert prices.cents(None) == 0
    assert prices.cents("") == 0
    assert prices.cents("x") == 0


def test_build_prices_aligned_to_printings():
    printings = {"p": [[["a", "lea", "1"], ["b", "ice", "2"]], [["c", "m10", "3"]], []]}
    bulk = [
        {"id": "b", "prices": {"eur": "0.35", "eur_foil": "2.10", "usd": "9"}},
        {"id": "a", "prices": {"eur": None, "eur_foil": None}},
        {"id": "z", "prices": {"eur": "5"}},  # printing che non serve
        {"id": "c"},  # senza prezzi
    ]
    head, rows = prices.build_prices(printings, iter(bulk), "2026-10-07T21:05:42.958+00:00")
    assert head == {"v": 1, "date": "2026-10-07"}
    assert rows == [[0, 0, 35, 210], [0, 0], []]


def test_write_prices(tmp_path):
    import gzip
    import json
    (tmp_path / "printings.json").write_text(json.dumps({"v": 2, "p": [[["a", "lea", "1"]]]}), "utf-8")
    bulk = tmp_path / "default.jsonl.gz"
    with gzip.open(bulk, "wt", encoding="utf-8") as f:
        f.write(json.dumps({"id": "a", "prices": {"eur": "1.5", "eur_foil": "3"}}) + "\n")
    info = prices.write_prices(bulk, "2026-10-08T00:00:00Z", data_dir=tmp_path)
    assert info == {"printing": 1, "con_prezzo": 1, "data": "2026-10-08"}
    out = json.loads((tmp_path / "prices.json").read_text("utf-8"))
    assert out == {"v": 1, "date": "2026-10-08", "p": [[150, 300]]}
