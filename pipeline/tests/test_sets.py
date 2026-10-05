import datetime as dt

from pauper_index.carddb import CardDB
from pauper_index.sets import entry_map, group_of, relevant_sets, validate

from .conftest import card, oid, printing


def test_entry_is_first_common_paper_or_mtgo(db):
    assert db.entry_printing(oid("Fire // Ice")).set == "mh2"  # apc era uncommon
    assert db.entry_printing(oid("Brainstorm")).set == "ice"
    assert db.entry_printing(oid("Tormod's Crypt")).set == "mm2"
    assert db.entry_printing(oid("Spider-Man, Web-Slinger")).set in ("om1", "spm")


def test_entry_ignores_memorabilia_and_arena(db):
    # Rare Thing: rara in carta, common solo in memorabilia e su Arena -> nessun ingresso
    assert db.entry_printing(oid("Rare Thing")) is None


def test_entry_rules_for_funny_acorn_silver_and_future():
    names = ["Black Funny", "Acorn Card", "Silver Card", "Future Card"]
    oracle = [card(n) for n in names]
    default = [printing("Black Funny", "unf", set_type="funny"),
               printing("Acorn Card", "unf", set_type="funny"),
               printing("Silver Card", "ust", set_type="funny"),
               printing("Future Card", "trk", released="2026-11-13")]
    default[1]["security_stamp"] = "acorn"
    default[2]["border_color"] = "silver"
    db = CardDB(oracle, default)
    today = "2026-10-05"
    assert db.entry_printing(oid("Black Funny"), today).set == "unf"
    assert db.entry_printing(oid("Acorn Card"), today) is None
    assert db.entry_printing(oid("Silver Card"), today) is None
    assert db.entry_printing(oid("Future Card"), today) is None
    assert db.entry_printing(oid("Future Card"), "2026-11-13").set == "trk"


def test_validate_flags_mismatches():
    oracle = [card("Legal No Common"), card("Common Not Legal", pauper="not_legal")]
    default = [printing("Legal No Common", rarity="uncommon"), printing("Common Not Legal")]
    db = CardDB(oracle, default)
    v = validate(db, entry_map(db))
    assert v["legali_senza_ingresso"] == ["Legal No Common"]
    assert v["ingresso_ma_non_legali"] == ["Common Not Legal (aaa, expansion)"]


def test_relevant_sets_threshold_and_grouping():
    names = [f"Card {i}" for i in range(7)]
    oracle = [card(n) for n in names] + [card("Banned One", pauper="banned"), card("Not Legal", pauper="not_legal")]
    default = [printing(n, "new", released="2026-08-01") for n in names[:4]]
    default += [printing(n, "nwc", released="2026-08-01") for n in names[4:]]  # sottoinsieme di "new"
    default += [printing("Banned One", "old", released="2025-01-10"), printing("Not Legal", "old")]
    db = CardDB(oracle, default)
    sets_info = {
        "new": {"code": "new", "name": "New", "set_type": "expansion", "released_at": "2026-08-01"},
        "nwc": {"code": "nwc", "name": "New Commander", "set_type": "commander", "released_at": "2026-08-01",
                "parent_set_code": "new"},
        "old": {"code": "old", "name": "Old", "set_type": "expansion", "released_at": "2025-01-10"},
        "anc": {"code": "anc", "name": "Ancient", "set_type": "expansion", "released_at": "2001-01-01"},
    }
    assert group_of("nwc", sets_info) == "new"
    rows = {r["set"]: r for r in relevant_sets(db, entry_map(db), sets_info, {oid("Card 0")},
                                                dt.date(2026, 10, 5), threshold=5)}
    assert set(rows) == {"new", "nwc", "old"}
    assert rows["new"]["carte_ingresso"] == 4 and rows["new"]["carte_gruppo"] == 7
    assert not rows["new"]["rilevante_set"] and rows["new"]["rilevante_gruppo"]
    assert rows["new"]["giocate"] == 1
    assert rows["old"]["carte_ingresso"] == 1  # la bannata conta, la not_legal no
