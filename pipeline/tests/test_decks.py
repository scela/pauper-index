"""Decklist recenti e archetipi (funzione 4): liste unite, privacy, stabilità dei nomi, identificativi stabili."""

import json
from array import array
from types import SimpleNamespace

import pytest

from pauper_index import decks
from pauper_index.carddb import Card
from pauper_index.source import Deck, Tournament

# carte sintetiche: (nome, tipo, colori del costo, mana prodotto)
CARDS = [
    ("Mountain", "Basic Land — Mountain", "", "R"),
    ("Island", "Basic Land — Island", "", "U"),
    ("Snow-Covered Island", "Basic Snow Land — Island", "", "U"),
    ("Lava Dart", "Instant", "R", ""),
    ("Guttersnipe", "Creature", "R", ""),
    ("Fireblast", "Instant", "R", ""),
    ("Sneaky Snacker", "Creature", "UB", ""),  # nel mazzo rosso non si lancia: non deve renderlo UB
    ("Brainstorm", "Instant", "U", ""),
    ("Ponder", "Sorcery", "U", ""),
    ("Counterspell", "Instant", "U", ""),
    ("Spellstutter Sprite", "Creature", "U", ""),
    ("Ninja of the Deep Hours", "Creature", "U", ""),
    ("Elf A", "Creature", "G", ""), ("Elf B", "Creature", "G", ""), ("Elf C", "Creature", "G", ""),
    ("Elf D", "Creature", "G", ""), ("Elf E", "Creature", "G", ""), ("Forest", "Basic Land — Forest", "", "G"),
]
OIDS = [f"oid-{n}" for n, *_ in CARDS]
IDX = {n: i for i, (n, *_) in enumerate(CARDS)}


@pytest.fixture
def db():
    cards = {f"oid-{n}": Card(f"oid-{n}", n, (n,), "normal", "legal", t, "ref", True, c, p) for n, t, c, p in CARDS}
    by_name = {c.name: o for o, c in cards.items()}
    return SimpleNamespace(cards=cards, lookup=lambda n: (by_name.get(n), 0, False))


@pytest.fixture
def paths(tmp_path, monkeypatch):
    monkeypatch.setattr(decks, "REGISTRY", tmp_path / "registro.json")
    monkeypatch.setattr(decks, "ARCHETYPES_CSV", tmp_path / "archetypes.csv")
    csv = "nome,carte,minimo\nRed Madness,Guttersnipe;Lava Dart;Fireblast,2\n"
    (tmp_path / "archetypes.csv").write_text(csv, "utf-8")
    return tmp_path


def deck(day, cards: dict[str, int], side: dict[str, int] | None = None, result=1):
    flat = lambda d: array("H", [x for n, q in d.items() for x in (IDX[n], q)])  # noqa: E731
    return Deck(day, result, flat(cards), flat(side or {}))


RED = {"Mountain": 20, "Lava Dart": 16, "Guttersnipe": 16, "Sneaky Snacker": 8}
BLUE = {"Island": 16, "Snow-Covered Island": 4, "Brainstorm": 10, "Ponder": 10, "Counterspell": 10,
        "Spellstutter Sprite": 6, "Ninja of the Deep Hours": 4}
ELVES = {"Forest": 20, "Elf A": 8, "Elf B": 8, "Elf C": 8, "Elf D": 8, "Elf E": 8}


def tour(day, name, decks_):
    return Tournament("mtgo.com", f"{name}.json", name, f"https://www.mtgo.com/decklist/{name}", day, "m", "mtgo",
                      False, decks_)


def run(kept, db, paths, anchor, out):
    out.mkdir(exist_ok=True)
    keymap = list(range(len(OIDS)))
    decks.build_decks(kept, keymap, OIDS, db, OIDS, anchor, out_dir=out, review_dir=paths, log=lambda m: None)
    return {d: json.loads((out / f"decks-{d}.json").read_text("utf-8")) for d in decks.WINDOWS}


def test_lists_merged_curated_auto_and_privacy(db, paths):
    base = 739000
    kept = [
        tour(base, "challenge-a", [deck(base, RED), deck(base, RED), deck(base, BLUE, {"Counterspell": 2})]
             + [deck(base, BLUE) for _ in range(6)] + [deck(base, ELVES) for _ in range(6)]),
        tour(base + 1, "league-b", [deck(base + 1, RED, result="5-0"), deck(base + 1, {"Mountain": 10})]),
    ]
    out = run(kept, db, paths, base + 1, paths / "out")[61]
    # liste identiche unite, con tutte le apparizioni; il mazzo incompleto (10 carte) è scartato
    assert len(out["l"]) == 4
    red = next(r for r in out["l"] if r[2][1] == 20)
    assert red[0] == "c1" and out["a"]["c1"] == ["Red Madness", "", "c"]
    assert len(red[4]) == 3 and ["5-0" in str(u) for u in red[4]].count(True) == 1
    assert red[1] == "R"  # Sneaky Snacker non conta: nessuna terra produce blu o nero
    blue = [r for r in out["l"] if IDX["Brainstorm"] in r[2][0::2]]
    assert {r[0] for r in blue} == {r[0] for r in blue if r[0].startswith("a")}  # gruppo automatico
    assert len(blue) == 2  # stesso main, side diverso: due liste
    # le terre base normali sono indicate a parte (le Snow-Covered no)
    assert out["basics"] == sorted([IDX["Mountain"], IDX["Island"], IDX["Forest"]])
    # identificativi dei tornei stabili: giorno * 100 + progressivo
    day = lambda o: int(decks.iso(o).replace("-", ""))  # noqa: E731
    assert sorted(out["t"]) == [str(day(base) * 100), str(day(base + 1) * 100)]
    text = (paths / "out" / "decks-61.json").read_text("utf-8")
    assert "Player" not in text and "AnchorUri" not in text and "#deck_" not in text
    # una riga per lista
    assert text.count("\n[") == len(out["l"])


def test_names_stay_stable_from_day_to_day(db, paths):
    base = 739000
    day1 = [tour(base, "t1", [deck(base, BLUE) for _ in range(7)] + [deck(base, ELVES) for _ in range(7)])]
    a = run(day1, db, paths, base, paths / "a")[61]
    registry1 = json.loads(decks.REGISTRY.read_text("utf-8"))
    # il giorno dopo il mazzo blu cambia un po' e arriva un torneo nuovo: stesso archetipo, stesso nome
    blue2 = dict(BLUE, Ponder=6, Counterspell=14)
    day2 = day1 + [tour(base + 1, "t2", [deck(base + 1, blue2) for _ in range(7)])]
    b = run(day2, db, paths, base + 1, paths / "b")[61]
    names_a = {tuple(r[2]): a["a"][r[0]][0] for r in a["l"]}
    names_b = {tuple(r[2]): b["a"][r[0]][0] for r in b["l"]}
    for k in names_a:
        assert names_b[k] == names_a[k]
    key = lambda d: tuple(decks.flat({IDX[n]: q for n, q in d.items()}))  # noqa: E731
    assert names_b[key(blue2)] == names_a[key(BLUE)]
    registry2 = json.loads(decks.REGISTRY.read_text("utf-8"))
    # registro solo in aggiunta: i gruppi esistenti mantengono nome e nucleo
    for g1, g2 in zip(registry1["groups"], registry2["groups"][: len(registry1["groups"])], strict=True):
        assert (g1["id"], g1["name"], g1["core"]) == (g2["id"], g2["name"], g2["core"])
    # la riga di una lista non cambia quando la finestra si sposta (identificativi stabili di tornei e archetipi)
    row_a = next(r for r in a["l"] if IDX["Brainstorm"] in r[2][0::2])
    row_b = next(r for r in b["l"] if r[2] == row_a[2])
    assert row_a == row_b


def test_curated_priority_and_unknown_cards(db, paths):
    (paths / "archetypes.csv").write_text("nome,carte,minimo\nA,Guttersnipe;Lava Dart,2\nB,Guttersnipe;Fireblast,1\n",
                                          "utf-8")
    cur = decks.load_curated(db)
    main = {"oid-Guttersnipe", "oid-Lava Dart"}
    assert decks.curated_match(main, cur) == "A"  # 2 su 2 batte 1 su 2
    assert decks.curated_match({"oid-Fireblast"}, cur) == "B"
    assert decks.curated_match({"oid-Brainstorm"}, cur) is None
    (paths / "archetypes.csv").write_text("nome,carte,minimo\nX,Carta Inesistente,1\n", "utf-8")
    with pytest.raises(ValueError, match="sconosciute"):
        decks.load_curated(db)


def test_tournament_ids_are_stable():
    t = [tour(739000, "a", []), tour(739000, "b", []), tour(739001, "c", [])]
    ids = decks.tournament_ids(t)
    assert ids[1] == ids[0] + 1 and str(ids[2]).endswith("00")
    # il progressivo dipende solo dai tornei dello stesso giorno: togliere i giorni precedenti non cambia nulla
    assert decks.tournament_ids(t[2:]) == ids[2:]


def test_curated_full_name_beats_face(paths, carddb):
    """Una carta chiave si riconosce come nelle decklist: il nome completo vince sulla faccia di una carta
    "prepare" con lo stesso nome (prima "Tolarian Terror" puntava alla carta sbagliata e non trovava nulla)."""
    real = carddb
    (paths / "archetypes.csv").write_text("nome,carte,minimo,colori\nT,Brainstorm,1,1\n", "utf-8")
    cur = decks.load_curated(real)
    oid = real.lookup("Brainstorm")[0]
    assert cur[0].cards == [oid] and real.cards[oid].name == "Brainstorm" and cur[0].colors
    assert decks.curated_match({oid}, cur) == "T"


def test_color_prefix_names():
    cur = [decks.Curated("Faeries", ["x"], 1, True), decks.Curated("Elves", ["y"], 1)]
    reg = {"groups": []}
    assert decks.archetype("c:Faeries", "UB", reg, cur) == ("c1UB", ["Dimir Faeries", "UB", "c"])
    assert decks.archetype("c:Faeries", "U", reg, cur) == ("c1U", ["Mono-Blue Faeries", "U", "c"])
    assert decks.archetype("c:Elves", "G", reg, cur) == ("c2", ["Elves", "", "c"])
    assert decks.color_name("UBRG") == "Four-Color" and decks.color_name("WUBRG") == "Five-Color"
    assert decks.color_name("WBR") == "Mardu" and decks.color_name("URG") == "Temur"
