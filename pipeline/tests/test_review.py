import datetime as dt
import json

import pytest

from pauper_index import review

SETS = {
    "new": {"code": "new", "name": "New Set", "released_at": "2026-08-01", "set_type": "expansion"},
    "nwc": {"code": "nwc", "name": "New Commander", "released_at": "2026-08-01", "parent_set_code": "new"},
    "old": {"code": "old", "name": "Old Set", "released_at": "2026-01-10", "set_type": "expansion"},
    "tiny": {"code": "tiny", "name": "Tiny", "released_at": "2026-08-01", "set_type": "expansion"},
}


def cards(rows):
    # rows: (oid, name, legal, decks_last_year, entry, basic)
    c = []
    for o, n, lg, d, e, b in rows:
        row = {"o": o, "n": n, "l": lg, "s": [0, [d, d, d, 4, 4] if d else 0, 0, [d, d, d, 4, 4]], "e": e}
        if b:
            row["b"] = 1
        c.append(row)
    return {"anchor": "2026-10-01", "tot": [[10, 1], [100, 5], [200, 9], [500, 20]], "c": c}


def test_snapshot_uses_default_definition():
    snap = review.snapshot(cards([("a", "A", "l", 5, "new", 0), ("b", "B", "b", 9, "old", 0),
                                  ("c", "Island", "l", 50, "lea", 1), ("d", "D", "l", 0, "old", 0)]),
                           ["zz"], "2026-10-05")
    assert set(snap["default"]) == {"a"}  # B bannata, Island terra base, D non giocata nell'ultimo anno
    assert snap["default"]["a"] == ["A", 5, 5.0, "new"]
    assert snap["legal"]["b"] == ["B", "b"]
    assert snap["unresolved"] == ["zz"]


def test_due_groups_after_delay_and_baseline():
    counts = {"new": 7, "old": 6, "tiny": 2}
    state = {"baseline": "2026-09-01", "done": {}}
    assert review.due_groups(SETS, state, dt.date(2026, 9, 29), counts) == []  # new: 2026-09-30
    assert review.due_groups(SETS, state, dt.date(2026, 9, 30), counts) == ["new"]
    # old è scaduto prima dello snapshot di partenza: non si recupera; tiny è sotto soglia
    assert review.due_groups(SETS, {"baseline": "2026-09-01", "done": {"new": "x"}}, dt.date(2026, 12, 1), counts) == []


def test_group_entries_uses_parent_set():
    class P:
        def __init__(self, s):
            self.set = s
    assert review.group_entries({"a": P("new"), "b": P("nwc"), "c": P("old")}, SETS) == {"new": 2, "old": 1}


def test_build_review_and_index(tmp_path):
    prev = review.snapshot(cards([("a", "A", "l", 5, "old", 0), ("g", "Gone", "l", 3, "old", 0),
                                  ("x", "X", "l", 9, "old", 0)]), ["old typo"], "2026-09-01")
    cur = review.snapshot(cards([("a", "A", "l", 6, "old", 0), ("n", "Newbie", "l", 20, "nwc", 0),
                                 ("x", "X", "b", 9, "old", 0)]), ["old typo", "new typo"], "2026-10-05")
    r = review.build_review("new", SETS, prev, cur)
    assert r["nuove"] == [["Newbie", 20, 20.0]]
    assert r["entrate"] == [["Newbie", 20, 20.0]]
    assert sorted(x[0] for x in r["uscite"]) == ["Gone", "X"]
    assert r["legalita"] == [["X", "l", "b"]]
    assert r["non_risolti_nuovi"] == ["new typo"]
    md = review.to_markdown(r)
    assert "X: legale → bannata" in md and "new typo" in md
    idx = tmp_path / "index.json"
    review.update_index(r, idx)
    data = json.loads(idx.read_text("utf-8"))
    assert data[0]["set"] == "new" and "non_risolti_nuovi" not in data[0]  # niente nomi grezzi nel sito
    assert "1 carte del set nella lista" in data[0]["sommario"]


@pytest.fixture
def no_network(monkeypatch):
    class R:
        def json(self):
            return [{"pushed_at": "2026-10-01T00:00:00Z", "full_name": "someone/MTGODecklistCache",
                     "html_url": "https://github.com/someone/MTGODecklistCache"}]
    monkeypatch.setattr(review.requests, "get", lambda *a, **k: R())


def test_stale_alarm(tmp_path, no_network):
    meta = {"last_tournament": "2026-09-01"}
    assert review.stale_alarm(meta, dt.date(2026, 9, 22), tmp_path) is False
    assert review.stale_alarm(meta, dt.date(2026, 9, 23), tmp_path) is True
    text = (tmp_path / "fonte-ferma.md").read_text("utf-8")
    assert text.startswith("Fonte dati ferma\n") and "someone/MTGODecklistCache" in text
