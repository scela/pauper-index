"""Debutti: categorie, filtro anti-rumore, "al posto di", settimane, registro della legalità e privacy dei giocatori."""

import datetime as dt
import hashlib
import json
from array import array
from collections import Counter
from types import SimpleNamespace

from pauper_index import debuts
from pauper_index.carddb import Card
from pauper_index.debuts import Recent
from pauper_index.source import NameTable, Tournament, load_all, load_tournament

D = dt.date.fromisoformat
ORD = lambda s: D(s).toordinal()  # noqa: E731
NAMES = ["Island", "New Card", "Old Card", "Few Players", "Lonely", "Filler"]
OIDS = [f"oid-{n}" for n in NAMES]
IDX = {n: i for i, n in enumerate(NAMES)}


def make_db(pauper=None, prints=None, entry=None):
    pauper = pauper or {}
    cards = {o: Card(o, n, (n,), "normal", pauper.get(n, "legal"),
                     "Basic Land — Island" if n == "Island" else "Instant", "ref", True)
             for n, o in zip(NAMES, OIDS, strict=True)}
    pr = {f"oid-{n}": [SimpleNamespace(games=frozenset({"paper"}), released_at=d) for d in ds]
          for n, ds in (prints or {}).items()}
    en = {f"oid-{n}": SimpleNamespace(released_at=d) for n, d in (entry or {}).items()}
    return SimpleNamespace(cards=cards, printings=pr, entry_printing=lambda o: en.get(o))


def test_categories():
    db = make_db(prints={"New Card": ["2026-08-14"], "Old Card": ["2005-10-07", "2026-09-02"]},
                 entry={"New Card": "2026-08-14", "Old Card": "2026-09-02"})
    # carta nuova, anche se giocata 3 giorni prima dell'uscita (Giant's Boulder)
    assert debuts.category(db, "oid-New Card", ORD("2026-08-11"), None) == "n"
    # ristampa comune di una carta che prima non era legale (Baleful Strix con il Secret Lair)
    assert debuts.category(db, "oid-Old Card", ORD("2026-09-07"), None) == "l"
    # legale da tempo e mai giocata prima (Tidewater Minion)
    db2 = make_db(prints={"Old Card": ["2005-10-07"]}, entry={"Old Card": "2005-10-07"})
    assert debuts.category(db2, "oid-Old Card", ORD("2026-06-30"), None) == "r"
    # tolta dalle bandite: vince sulle altre
    assert debuts.category(db, "oid-New Card", ORD("2026-08-11"), ORD("2026-10-20")) == "u"
    # oltre i 120 giorni dall'uscita non è più "nuova"
    assert debuts.category(db, "oid-New Card", ORD("2026-08-14") + 121, None) == "r"


def test_legality_register(tmp_path):
    path = tmp_path / "legalita.json"
    db = make_db(pauper={"Old Card": "banned"})
    reg = debuts.update_legality(db, "2026-10-19", path)
    assert reg["since"] == "2026-10-19" and reg["changes"] == [] and reg["banned"] == {"oid-Old Card": "Old Card"}
    before = path.read_text("utf-8")
    debuts.update_legality(db, "2026-10-20", path)
    assert path.read_text("utf-8") == before  # niente cambi: il file non si riscrive
    db = make_db(pauper={"New Card": "banned"})  # Old Card sbloccata, New Card bandita
    reg = debuts.update_legality(db, "2026-11-03", path)
    assert reg["changes"] == [["2026-11-03", "oid-Old Card", "Old Card", "banned", "legal"],
                              ["2026-11-03", "oid-New Card", "New Card", "legal", "banned"]]
    assert debuts.unbanned(reg) == {"oid-Old Card": ORD("2026-11-03")}


def rec(day, main=None, side=None, arch="c1", fam="c1", player=0, ti=0, result=1):
    return Recent(ORD(day) if isinstance(day, str) else day, ti, result, player, main or {}, side or {}, arch, fam)


NEW, OLD, OTHER, X = 1, 2, 3, 5


LAND = [False] * 12
LAND[9] = LAND[10] = LAND[0] = True  # 9, 10: terre non base; 0: Island


def rep_of(card, mine, recent, since, fams=("c1",)):
    return debuts.replaced(card, mine, recent, since, LAND, list(fams))


def test_replaced_both_comparisons_must_agree():
    since = ORD("2026-09-07")
    pre = [rec(since - 10, {OLD: 4, OTHER: 4}) for _ in range(20)]
    mine = [rec(since + 3, {NEW: 4}) for _ in range(20)]
    # nello stesso periodo le liste senza la carta giocano ancora OLD ma non OTHER (calata per un'altra novità)
    without = [rec(since + 3, {OLD: 4, X: 4}) for _ in range(20)]
    ((variant, k, tot, npre, nd, rep),) = rep_of(NEW, mine, pre + mine + without, since)
    assert (variant, k, tot, npre, nd) == ("c1", 20, 40, 20, 0)
    assert rep == [[OLD, 1000, 0, 1000]]  # OTHER cala anche senza la carta: non è attribuita a NEW
    # liste senza la carta meno di 20 (Giant's Boulder in Tron): basta il confronto prima/dopo
    rep = rep_of(NEW, mine, pre + mine + without[:19], since)[0][5]
    assert sorted(r[0] for r in rep) == [OLD, OTHER] and all(r[3] == -1 for r in rep)
    # troppo poche liste prima: la variante c'è, ma nessun "al posto di"
    assert rep_of(NEW, mine, pre[:19] + mine, since) == [["c1", 20, 20, 19, 0, []]]
    # calo sotto i 20 punti: niente
    pre2 = [rec(since - 10, {OLD: 4}) for _ in range(20)]
    mine2 = [rec(since + 3, {NEW: 4, OLD: 4}) for _ in range(18)] + [rec(since + 3, {NEW: 4}) for _ in range(2)]
    assert rep_of(NEW, mine2, pre2 + mine2, since)[0][5] == []


def test_replaced_needs_adoption_and_twenty_decks():
    since = ORD("2026-08-11")
    pre = [rec(since - 10, {OLD: 4}) for _ in range(40)]
    # Surveillance Room in Tron: poche liste della variante (le più recenti), il 4%: una versione diversa del mazzo
    mine = [rec(since + 20, {NEW: 1}) for _ in range(31)]
    others = [rec(since + 3, {OLD: 4}) for _ in range(20)] + [rec(since + 20, {X: 4}) for _ in range(729)]
    assert rep_of(NEW, mine, pre + mine + others, since) == []
    # 25% della variante ma solo 19 mazzi: niente
    mine = [rec(since + 3, {NEW: 4}) for _ in range(19)]
    assert rep_of(NEW, mine, pre + mine + [rec(since + 3, {X: 4}) for _ in range(20)], since) == []
    # mazzo nuovo (nessuna lista della variante prima): stessa soglia, almeno 20 mazzi con la carta, non con 19
    # (Giant's Boulder in "Dispatch + Baleful Strix", 10 mazzi: il gruppo è nato intorno ad altre carte)
    mine = [rec(since + 3, {NEW: 4}, arch="a9", fam="a9") for _ in range(20)]
    assert rep_of(NEW, mine, pre + mine, since, ("a9",)) == [["a9", 20, 20, 0, 1, []]]
    assert rep_of(NEW, mine[:19], pre + mine[:19], since, ("a9",)) == []


def test_replaced_needs_a_shared_color():
    since = ORD("2026-09-07")
    # NEW blu (Plunder the Trollshaws) in Izzet Terror: cala OLD rosso (Lightning Bolt), sostituito da un'altra carta
    # rossa; cala anche OTHER blu; X incolore (artefatto) va con tutte
    colors = [""] * 12
    colors[NEW], colors[OLD], colors[OTHER], colors[X] = "U", "R", "UB", ""
    pre = [rec(since - 5, {OLD: 4, OTHER: 2, X: 1}) for _ in range(20)]
    mine = [rec(since + 3, {NEW: 4}) for _ in range(20)]
    rep = debuts.replaced(NEW, mine, pre + mine, since, LAND, ["c1"], colors)[0][5]
    assert sorted(r[0] for r in rep) == [OTHER, X]
    colors[NEW] = ""  # una carta incolore che debutta va con tutte
    rep = debuts.replaced(NEW, mine, pre + mine, since, LAND, ["c1"], colors)[0][5]
    assert sorted(r[0] for r in rep) == [OLD, OTHER, X]


def test_replaced_in_each_family_and_lands_only_with_lands():
    since = ORD("2026-09-07")
    # Baleful Strix: Dimir Faeries (c7UB) e Dimir Control (c19UB), ciascuna con la sua variante più frequente
    fae_pre = [rec(since - 5, {OLD: 4, 9: 2}, arch="c7UB", fam="c7") for _ in range(20)]
    fae = [rec(since + 3, {NEW: 4, 10: 2}, arch="c7UB", fam="c7") for _ in range(20)]
    ctl_pre = [rec(since - 5, {OTHER: 4}, arch="c19UB", fam="c19") for _ in range(20)]
    ctl = [rec(since + 3, {NEW: 4}, arch="c19UB", fam="c19") for _ in range(20)]
    out = rep_of(NEW, fae + ctl, fae_pre + fae + ctl_pre + ctl, since, ("c7", "c19"))
    assert [(v, [r[0] for r in rep]) for v, *_, rep in out] == [("c7UB", [OLD]), ("c19UB", [OTHER])]  # mai la terra 9
    # una terra (10) si confronta solo con terre: cala la terra 9, non OLD
    fae2 = [rec(since + 3, {10: 2}, arch="c7UB", fam="c7") for _ in range(20)]
    ((*_, rep),) = rep_of(10, fae2, fae_pre + fae2, since, ("c7",))
    assert [r[0] for r in rep] == [9]


def test_last_week_partial():
    sunday = ORD("2026-10-11")
    weeks = {debuts.monday(sunday) - 7 * k: n for k, n in enumerate((900, 1086, 502, 768, 961))}
    assert debuts.week_partial(Counter(weeks), sunday) is False
    assert debuts.week_partial(Counter(weeks), sunday - 1) is True  # di sabato: settimana incompleta
    weeks[debuts.monday(sunday)] = 400  # meno della metà della mediana (864,5) delle 4 settimane prima
    assert debuts.week_partial(Counter(weeks), sunday) is True


def test_replaced_uses_the_zone_of_the_card():
    since = ORD("2026-09-07")
    pre = [rec(since - 5, {X: 4}, {OLD: 2}) for _ in range(20)]
    mine = [rec(since + 1, {X: 4, OLD: 4}, {NEW: 2}) for _ in range(20)]
    rep = rep_of(NEW, mine, pre + mine, since)[0][5]
    assert [r[0] for r in rep] == [OLD]  # OLD esce dal side anche se entra nel main


def tour(day, name, decks_, kind="m"):
    return Tournament("mtgo.com", f"{name}.json", name, f"https://www.mtgo.com/decklist/{name}", day, kind, "mtgo",
                      False, decks_)


def deck(day, cards, player, result=1):
    from pauper_index.source import Deck
    d = Deck(day, result, array("H", [x for n, q in cards.items() for x in (IDX[n], q)]), array("H"))
    d.player = player
    return d


def test_build_filter_watch_weeks_and_privacy(tmp_path):
    anchor = ORD("2026-10-11")  # domenica
    first = ORD("2026-09-28")
    kept = [
        tour(ORD("2026-06-01"), "old", [deck(ORD("2026-06-01"), {"Island": 20, "Old Card": 4, "Filler": 36}, 0)]),
        # New Card: 6 mazzi di 3 giocatori; Few Players: 5 mazzi di 2 giocatori; Lonely: 1 mazzo
        tour(first, "challenge-1", [deck(first, {"Island": 20, "New Card": 4, "Few Players": 1, "Filler": 35}, 0),
                                    deck(first, {"Island": 20, "New Card": 4, "Few Players": 1, "Filler": 35}, 1),
                                    deck(first, {"Island": 20, "New Card": 4, "Filler": 36}, 2)]),
        tour(anchor, "challenge-2", [deck(anchor, {"Island": 20, "New Card": 3, "Few Players": 1, "Filler": 36}, p,
                                          result=r) for p, r in ((0, 3), (1, "5-0"), (0, 1))]
             + [deck(anchor, {"Island": 20, "Lonely": 1, "Filler": 39}, 5)]),
    ]
    firsts = {"oid-Old Card": ORD("2026-06-01"), "oid-New Card": first, "oid-Few Players": first,
              "oid-Lonely": anchor, "oid-Filler": ORD("2026-06-01"), "oid-Island": ORD("2026-06-01")}
    db = make_db(prints={"New Card": ["2026-09-26"]})
    out, review, leg = tmp_path / "debuts.json", tmp_path / "debutti.md", tmp_path / "legalita.json"
    info = debuts.build_debuts(kept, list(range(len(OIDS))), OIDS, db, OIDS, anchor, firsts, {}, {}, "2026-10-19",
                               out=out, review=review, legality=leg, log=lambda m: None)
    assert info == {"carte": 1, "in_osservazione": 1, "sbloccate": 0}
    text = out.read_text("utf-8")
    j = json.loads(text)
    (row,) = j["c"]
    assert row["c"] == IDX["New Card"] and row["k"] == "n" and row["d"] == 6 and row["p"] == 3
    assert row["q"] == [0, 0, 3, 3] and row["z"] == [6, 0, 0] and row["y"] == 2026
    assert j["o"] == [[IDX["Few Players"], "r", "2026-09-28", 5, 2]]  # escluso per i giocatori, con il numero
    # settimane da lunedì 28 settembre e da lunedì 5 ottobre; l'ultima (fino a domenica 11) è completa
    assert row["w0"] == "2026-09-28" and row["w"] == [3, 3] and row["wt"] == [3, 4]
    assert j["lastWeekPartial"] == 0
    # migliori piazzamenti: a parità il più recente; il 3° e il 5-0 restano fuori
    assert [b[1] for b in row["b"]] == [1, 1, 1]
    assert row["b"][0][0] == 2026101100 and j["t"]["2026101100"][1] == "challenge-2"
    # privacy: nel file solo il numero dei giocatori, nessun campo per mazzo o per giocatore
    assert set(row) == {"c", "k", "f", "d", "p", "a", "z", "q", "y", "r", "w0", "w", "wt", "co", "b"}
    assert all(len(b) == 2 for b in row["b"]) and all(len(t) == 4 for t in j["t"].values())
    assert sorted(p.name for p in tmp_path.iterdir()) == ["debuts.json", "debutti.md", "legalita.json"]


def test_loader_keeps_only_a_progressive_number(tmp_path):
    # i nomi dei giocatori diventano numeri progressivi in memoria: nessun nome né impronta nel mazzo
    root = tmp_path / "src"
    p = root / "Tournaments" / "mtgo.com" / "2026" / "pauper-challenge.json"
    p.parent.mkdir(parents=True)
    names = ["Alice_Secret", "bob_hidden", " alice_secret "]
    head = {"Date": "2026-10-11", "Name": "Pauper Challenge", "Uri": "https://www.mtgo.com/x"}
    p.write_text(json.dumps({"Tournament": head,
                             "Decks": [{"Player": n, "Result": "1st Place", "AnchorUri": f"#deck_{n}",
                                        "Mainboard": [{"Count": 4, "CardName": "Island"}], "Sideboard": []}
                                       for n in names]}), "utf-8")
    players: dict[str, int] = {}
    t = load_tournament(p, root, NameTable(), players)
    assert [d.player for d in t.decks] == [0, 1, 0]  # stesso giocatore senza maiuscole e spazi
    for d in t.decks:
        assert not any(isinstance(getattr(d, s), str) for s in d.__slots__)
    # senza dizionario (test e altri usi) il giocatore resta assente
    assert [d.player for d in load_tournament(p, root, NameTable()).decks] == [-1, -1, -1]


def test_no_player_names_nor_fingerprints_in_any_output(tmp_path):
    # dalla fonte al file: 6 mazzi di 3 giocatori; nel file c'è solo il numero 3
    root = tmp_path / "src"
    folder = root / "Tournaments" / "mtgo.com" / "2026"
    folder.mkdir(parents=True)
    who = ["Zorblax_Secret", "Quintessa99", "zorblax_secret", "Mxyzptlk", "Quintessa99", "Mxyzptlk"]
    main = [{"Count": 20, "CardName": "Island"}, {"Count": 4, "CardName": "New Card"},
            {"Count": 36, "CardName": "Filler"}]
    for k, day in enumerate(("2026-10-04", "2026-10-11")):
        (folder / f"pauper-challenge-{k}.json").write_text(json.dumps({
            "Tournament": {"Date": day, "Name": f"Pauper Challenge {k}", "Uri": f"https://www.mtgo.com/c{k}"},
            "Decks": [{"Player": n, "Result": f"{j + 1}th Place", "AnchorUri": f"https://www.mtgo.com/c{k}#deck_{n}",
                       "Mainboard": main, "Sideboard": []} for j, n in enumerate(who[3 * k:3 * k + 3])]}), "utf-8")
    kept, names = load_all(root)
    key_oids = [f"oid-{n}" for n in names.names]
    db = make_db(prints={"New Card": ["2026-10-02"]})
    out = tmp_path / "out"
    out.mkdir()
    firsts = {o: ORD("2026-10-04") if o == "oid-New Card" else ORD("2020-01-01") for o in OIDS}
    debuts.build_debuts(kept, list(range(len(key_oids))), key_oids, db, OIDS, ORD("2026-10-11"), firsts, {}, {},
                        "2026-10-19", out=out / "debuts.json", review=out / "debutti.md",
                        legality=out / "legalita.json", log=lambda m: None)
    j = json.loads((out / "debuts.json").read_text("utf-8"))
    assert [(r["c"], r["d"], r["p"]) for r in j["c"]] == [(IDX["New Card"], 6, 3)]
    for f in out.iterdir():
        text = f.read_text("utf-8")
        low = text.casefold()
        for n in {x.strip() for x in who}:
            key = n.casefold()
            assert key not in low and "deck_" not in low
            for fp in (str(hash(n)), str(hash(key)), hashlib.md5(key.encode()).hexdigest(),
                       hashlib.sha1(key.encode()).hexdigest(), hashlib.sha256(key.encode()).hexdigest()):
                assert fp not in text
    assert sorted(p.name for p in tmp_path.iterdir()) == ["out", "src"]  # nient'altro scritto (né cache né log)
