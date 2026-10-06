"""Deduplica, statistiche e lettura dei tornei su fixture minime."""

import datetime as dt
import json
from array import array

import pytest

from pauper_index.dedup import dedupe
from pauper_index.outputs import year_series
from pauper_index.source import (
    Deck,
    NameTable,
    Tournament,
    classify,
    load_tournament,
    normalize_result,
    parse_day,
)
from pauper_index.stats import compute, median_high

D0 = dt.date(2026, 9, 1).toordinal()
NAMES = ["Brainstorm", "Gush", "Island", "Fire // Ice", "Unknown Card"]
KEYMAP = list(range(len(NAMES)))
KEY_OIDS = ["o-brainstorm", "o-gush", "o-island", "o-fireice", None]


def deck(day, main, side=(), result=None):
    def arr(items):
        a = array("H")
        for n, c in items:
            a.extend((NAMES.index(n), c))
        return a
    return Deck(day, result, arr(main), arr(side))


def tour(folder, decks, day=D0, uri="https://www.mtgo.com/decklist/x", rel=None, archive=False):
    family, kind = classify(folder, uri)
    return Tournament(folder, rel or f"{folder}/{day}/{len(decks)}", "T", uri, day, kind, family, archive, decks)


A = [("Brainstorm", 4), ("Island", 16)]
B = [("Gush", 4), ("Island", 16)]


def test_rule1_identical_files_keep_active_folder():
    t1 = tour("mtgo.com", [deck(D0, A), deck(D0, B)])
    t2 = tour("mtgo.com_before_new_data_model", [deck(D0, B), deck(D0, A)], archive=True)
    kept, log = dedupe([t2, t1], KEYMAP)
    assert [t.folder for t in kept] == ["mtgo.com"]
    assert log["regola1_file_identici"][0]["scartata"] == "mtgo.com_before_new_data_model"


def test_rule2_within_family_with_one_day_tolerance():
    live = tour("mtgo.com", [deck(D0, A), deck(D0, B), deck(D0, A)])
    arch = tour("magic.wizards.com", [deck(D0 + 1, A), deck(D0 + 1, [("Fire // Ice", 4)])],
                uri="https://magic.wizards.com/x", archive=True)
    kept, log = dedupe([live, arch], KEYMAP)
    assert sum(len(t.decks) for t in kept) == 4  # 3 live + il mazzo Fire//Ice solo nell'archivio
    assert log["regola2_mazzi_ripetuti"] == [
        {"scartata": "magic.wizards.com", "tenuta": "mtgo.com", "anno": 2026, "mazzi": 1}]


def test_dedupe_does_not_mutate_input():
    live = tour("mtgo.com", [deck(D0, A)])
    arch = tour("magic.wizards.com", [deck(D0, A), deck(D0, B)], uri="https://magic.wizards.com/x", archive=True)
    dedupe([live, arch], KEYMAP)
    assert len(arch.decks) == 2


def test_league_tolerance_only_between_old_model_and_mtgo_com():
    live = tour("mtgo.com", [deck(D0, A)], rel="mtgo.com/pauper-league-1.json")
    arch = tour("mtgo.com_before_new_data_model", [deck(D0 + 5, A), deck(D0 + 5, B)], day=D0 + 5,
                rel="arch/pauper-league-2.json", archive=True)
    assert sum(len(t.decks) for t in dedupe([live, arch], KEYMAP)[0]) == 2
    assert sum(len(t.decks) for t in dedupe([live, arch], KEYMAP, league_tolerance=1)[0]) == 3
    # stessa distanza ma con magic.wizards.com: vale ±1
    wiz = tour("magic.wizards.com", [deck(D0 + 5, A), deck(D0 + 5, B)], day=D0 + 5,
               uri="https://magic.wizards.com/x", rel="wiz/pauper-league-3.json", archive=True)
    assert sum(len(t.decks) for t in dedupe([live, wiz], KEYMAP)[0]) == 3
    # file non League: vale ±1
    chal = tour("mtgo.com_before_new_data_model", [deck(D0 + 5, A), deck(D0 + 5, B)], day=D0 + 5,
                rel="arch/pauper-challenge-4.json", archive=True)
    assert sum(len(t.decks) for t in dedupe([live, chal], KEYMAP)[0]) == 3


def test_copy_of_a_merged_copy_is_merged_too():
    # mtgo.com (D0) <- before_new (D0+5, League ±8) <- magic.wizards.com (D0+5, ±1 dalla copia before_new)
    live = tour("mtgo.com", [deck(D0, A), deck(D0, B)], rel="mtgo.com/pauper-league-1.json")
    arch = tour("mtgo.com_before_new_data_model", [deck(D0 + 5, A), deck(D0 + 5, [("Gush", 1)])], day=D0 + 5,
                rel="arch/pauper-league-2.json", archive=True)
    wiz = tour("magic.wizards.com", [deck(D0 + 5, A), deck(D0 + 5, [("Fire // Ice", 1)])], day=D0 + 5,
               uri="https://magic.wizards.com/x", rel="wiz/pauper-league-3.json", archive=True)
    kept, log = dedupe([live, arch, wiz], KEYMAP)
    assert sum(len(t.decks) for t in kept) == 4  # A, B, Gush, Fire//Ice
    pairs = {(r["scartata"], r["tenuta"]) for r in log["regola2_mazzi_ripetuti"]}
    assert pairs == {("mtgo.com_before_new_data_model", "mtgo.com"), ("magic.wizards.com", "mtgo.com")}


def test_rule2_max_per_folder_not_sum():
    live = tour("mtgo.com", [deck(D0, A), deck(D0, A)])
    arch = tour("magic.wizards.com", [deck(D0, A), deck(D0, A), deck(D0, A), deck(D0, B)],
                uri="https://magic.wizards.com/x", archive=True)
    kept, _ = dedupe([live, arch], KEYMAP)
    fps = [d.fp for t in kept for d in t.decks]
    assert len(fps) == 4  # max(2, 3) mazzi A + 1 mazzo B


def test_rule2_outside_tolerance_is_kept():
    live = tour("mtgo.com", [deck(D0, A)])
    arch = tour("magic.wizards.com", [deck(D0 + 2, A), deck(D0 + 2, B)], day=D0 + 2,
                uri="https://magic.wizards.com/x", archive=True)
    kept, _ = dedupe([live, arch], KEYMAP)
    assert sum(len(t.decks) for t in kept) == 3


def test_rule2_never_across_sources():
    mtgo = tour("mtgo.com_limited_data", [deck(D0, A), deck(D0, B)])
    melee = tour("melee.gg", [deck(D0, A)], uri="https://melee.gg/Tournament/View/1")
    kept, log = dedupe([mtgo, melee], KEYMAP)
    assert sum(len(t.decks) for t in kept) == 3
    assert log["regola2_mazzi_ripetuti"] == []


def test_identical_decks_in_same_file_are_kept():
    t = tour("melee.gg", [deck(D0, A), deck(D0, A), deck(D0, A)], uri="https://melee.gg/Tournament/View/2")
    kept, _ = dedupe([t], KEYMAP)
    assert len(kept[0].decks) == 3


def test_limited_data_copy_of_melee_joins_melee_family():
    assert classify("mtgo.com_limited_data", "https://melee.gg/Tournament/View/1") == ("melee", "p")
    assert classify("mtgo.com_limited_data", "https://www.mtgo.com/decklist/x") == ("mtgo", "m")
    assert classify("CardsRealm", "https://mtg.cardsrealm.com/x") == ("CardsRealm", "p")
    assert classify("manatraders.com", "https://www.manatraders.com/tournaments/1") == ("manatraders.com", "m")


def test_stats_windows_median_and_last_seen():
    old = D0 - 400
    t1 = tour("mtgo.com", [deck(D0, [("Brainstorm", 4), ("Island", 16)], [("Gush", 1)], result="5-0"),
                           deck(D0, [("Brainstorm", 2)], result="5-0"),
                           deck(D0, [("Brainstorm", 3), ("Unknown Card", 2)], result="5-0")])
    t2 = tour("melee.gg", [deck(old, [("Gush", 4)], result=3)], day=old,
              uri="https://melee.gg/Tournament/View/9")
    t3 = tour("melee.gg", [deck(D0 - 10, [("Brainstorm", 1)], result=1),
                           deck(D0 - 10, [("Brainstorm", 4)], result=2)], day=D0 - 10,
              uri="https://melee.gg/Tournament/View/10")
    stats, totals, anchor, ts = compute([t2, t3, t1], KEYMAP, KEY_OIDS, (61, 365, None))
    assert anchor == D0
    assert [x["decks"] for x in totals] == [5, 5, 6]
    b = stats["o-brainstorm"]
    assert b.decks_any == [5, 5, 5]
    assert b.copies[0] == 4 + 2 + 3 + 1 + 4
    assert median_high(b.hist_any[0]) == 3
    g = stats["o-gush"]
    assert g.decks_any == [1, 1, 2] and g.decks_main == [0, 0, 1]
    assert median_high(g.hist_main[2]) == 4
    # ultima apparizione MTGO e cartacea separate; a pari data vince il piazzamento migliore
    assert b.last_seen["m"][0] == D0 and b.last_seen["p"][2] == 1 and b.last_seen["p"][3] == 1
    assert g.last_seen["m"][3:] == (0, 1)
    assert None not in stats
    # mazzi per anno (main+side) su tutto lo storico
    assert g.years == {dt.date.fromordinal(D0).year: 1, dt.date.fromordinal(old).year: 1}
    assert sum(b.years.values()) == 5


def test_year_series_fills_gaps():
    assert year_series({2019: 3, 2021: 1}, 2018, 2021) == [2018, 0, 3, 0, 1]


def test_median_high():
    from collections import Counter
    assert median_high(Counter({1: 1, 4: 1})) == 4
    assert median_high(Counter({2: 3, 4: 1})) == 2
    assert median_high(Counter()) == 0


@pytest.mark.parametrize(("raw", "expected"), [
    ("1st Place", 1), ("2nd Place", 2), ("23rd Place", 23), ("9th Place", 9),
    ("5-0", "5-0"), ("", None), (None, None), ("7", "7"),
])
def test_normalize_result(raw, expected):
    assert normalize_result(raw) == expected


@pytest.mark.parametrize("s", ["2026-09-29", "2026-09-29T23:00:00", "2026-09-29T23:00:00Z",
                               "2026-09-29T23:00:00+00:00"])
def test_parse_day_formats(s):
    assert parse_day(s) == dt.date(2026, 9, 29).toordinal()


@pytest.mark.parametrize(("fn", "excluded"), [
    ("pauper-cube-draft-123-2026-01-01.json", True),
    ("Pauper_Cube_2026-01-01.json", True),
    ("pauper-sealed-league-2026-01-01.json", True),
    ("pauper-2hg-2026-01-01.json", True),
    ("pauper-1k-ticketpalooza-cubecon-dmv-417682-2026-07-11.json", False),
    ("pauper-challenge-32-2026-01-01.json", False),
    ("pauper-unlimited-power-2026.json", False),
])
def test_excluded_filename_whole_word(fn, excluded):
    from pauper_index.source import EXCLUDED_NAME
    assert bool(EXCLUDED_NAME.search(fn)) is excluded


def test_load_tournament_drops_player_data(tmp_path):
    root = tmp_path
    p = root / "Tournaments" / "mtgo.com_limited_data" / "2026" / "pauper-challenge-32-1.json"
    p.parent.mkdir(parents=True)
    p.write_text(json.dumps({
        "Tournament": {"Date": "2026-09-29T00:00:00Z", "Name": "Pauper Challenge 32",
                       "Uri": "https://www.mtgo.com/decklist/pauper-challenge-32-1"},
        "Decks": [{"Date": None, "Player": "SomePlayer", "Result": "1st Place",
                   "AnchorUri": "https://www.mtgo.com/decklist/pauper-challenge-32-1#deck_SomePlayer",
                   "Mainboard": [{"Count": 4, "CardName": "Brainstorm"}], "Sideboard": []},
                  {"Date": None, "Player": "Empty", "Result": "2nd Place", "AnchorUri": "",
                   "Mainboard": [], "Sideboard": []}],
        "Rounds": [], "Standings": []}), "utf-8")
    names = NameTable()
    t = load_tournament(p, root, names)
    assert t.folder == "mtgo.com_limited_data" and t.kind == "m" and len(t.decks) == 1
    assert t.decks[0].result == 1
    blob = repr(t) + repr(names.names)
    assert "SomePlayer" not in blob and "deck_" not in blob
