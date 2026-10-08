"""Nomi e testi delle stampe italiane (ricerca Scryfall lang:it). Forme dei dati verificate sulla ricerca reale
(2026-10-08): `printed_name` e `printed_text` al livello principale, oppure nelle facce per le carte a più facce."""

import datetime as dt

from pauper_index import italian
from pauper_index.carddb import CardDB

from .conftest import oid


def pr(name, it, day, text="", faces=None, lang="it"):
    c = {"oracle_id": oid(name), "name": name, "lang": lang, "released_at": day}
    if faces:
        c["card_faces"] = [{"name": n, "printed_name": p, "printed_text": t} for n, p, t in faces]
    else:
        c["printed_name"] = it
        if text:
            c["printed_text"] = text
    return c


class FakeApi:
    """Risposte della ricerca per query; registra le richieste fatte."""

    def __init__(self, pages: dict[str, list[list[dict]]]):
        self.pages = pages
        self.calls = []

    def get(self, path, params=None, cache=True):
        assert path == "/cards/search" and cache is False
        self.calls.append(params)
        pages = self.pages.get(params["q"])
        if not pages:
            return {"object": "error", "status": 404}
        n = params["page"]
        return {"object": "list", "total_cards": 1, "has_more": n < len(pages), "data": pages[n - 1]}


def test_printed_name_and_text_with_faces():
    c = pr("Delver of Secrets // Insectile Aberration", None, "2011-09-30",
           faces=[("Delver of Secrets", "Scopritore di Segreti", "All'inizio"),
                  ("Insectile Aberration", "Insetto Aberrante", "Volare")])
    assert italian.printed_name(c) == "Scopritore di Segreti // Insetto Aberrante"
    assert italian.printed_text(c) == "All'inizio\n//\nVolare"


def test_merge_keeps_all_distinct_names_newest_first_and_newest_text():
    st = {}
    n = italian.merge(st, [
        pr("Academy Researchers", "Ricercatori d'Accademia", "1999-01-01", "vecchio"),
        pr("Academy Researchers", "Ricercatori dell'Accademia", "2010-07-16", "nuovo"),
        pr("Academy Researchers", "Ricercatori d'Accademia", "2003-01-01"),
        pr("Academy Researchers", "Academy Researchers", "2020-01-01", lang="en"),  # non italiana: ignorata
        pr("Senza nome", "", "2020-01-01"),
    ])
    assert n == 3
    e = st["c"][oid("Academy Researchers")]
    assert e["n"] == ["Ricercatori dell'Accademia", "Ricercatori d'Accademia"]
    assert (e["t"], e["d"]) == ("nuovo", "2010-07-16")
    assert oid("Senza nome") not in st["c"]


def test_full_then_incremental_update(tmp_path):
    path = tmp_path / "italiano.json"
    api = FakeApi({"lang:it": [[pr("Lightning Bolt", "Fulmine", "2010-07-16", "Il Fulmine infligge 3 danni")],
                               [pr("Counterspell", "Contromagia", "2012-01-01")]]})
    st = italian.update(api, {}, dt.date(2026, 10, 1), path=path, log=lambda _: None)
    assert [c["page"] for c in api.calls] == [1, 2]
    assert st["full"] == st["updated"] == "2026-10-01"
    assert italian.load_state(path)["c"][oid("Lightning Bolt")]["n"] == ["Fulmine"]

    # nessun set nuovo e meno di 7 giorni: niente richieste
    api2 = FakeApi({})
    italian.update(api2, {"old": {"code": "old", "released_at": "2026-09-01"}}, dt.date(2026, 10, 3), path=path)
    assert api2.calls == []
    # set uscito dopo l'ultimo aggiornamento: solo le stampe recenti, a partire da 60 giorni prima
    q = "lang:it date>=2026-08-02"
    api3 = FakeApi({q: [[pr("Lightning Bolt", "Saetta", "2026-10-02")]]})
    st = italian.update(api3, {"new": {"code": "new", "released_at": "2026-10-02"}}, dt.date(2026, 10, 3), path=path,
                        log=lambda _: None)
    assert [c["q"] for c in api3.calls] == [q]
    assert st["c"][oid("Lightning Bolt")]["n"] == ["Saetta", "Fulmine"]
    assert st["c"][oid("Lightning Bolt")]["t"] == "Il Fulmine infligge 3 danni"  # la nuova stampa non ha testo
    assert st["full"] == "2026-10-01" and st["updated"] == "2026-10-03"
    # dopo 7 giorni si aggiorna anche senza set nuovi; senza rete lo stato resta com'è
    assert italian.due(st, {}, dt.date(2026, 10, 10)) is not None
    assert italian.due(st, {}, dt.date(2026, 10, 9)) is None
    assert italian.update(None, {}, dt.date(2027, 1, 1), path=path) == italian.load_state(path)


def test_build_names_and_texts():
    oracle = [{"id": oid("r" + n), "oracle_id": oid(n), "name": n, "layout": "normal", "legalities": {}}
              for n in ("Lightning Bolt", "Fire // Ice", "Black Lotus", "Island")]
    db = CardDB(oracle, [])
    st = {}
    italian.merge(st, [pr("Lightning Bolt", "Fulmine", "2010-01-01", "testo"),
                       pr("Fire // Ice", "Fire // Ice", "2020-01-01"),
                       pr("Black Lotus", "Loto Nero", "1994-01-01"), pr("Island", "Isola", "2020-01-01")])
    order = [oid("Fire // Ice"), oid("Lightning Bolt")]
    card_names = [["Black Lotus", "n"], ["Fire // Ice", "l"], ["Island", "l"], ["Lightning Bolt", "l"]]
    played, other = italian.build_names(db, st, order, card_names)
    assert played == [[], ["Fulmine"]]  # nome uguale a quello inglese: nessun nome italiano
    assert other == [[0, "Loto Nero"], [2, "Isola"]]  # indici in cardnames.json, senza le carte giocate
    assert italian.build_texts(st, order) == ["", "testo"]


def test_save_state_one_line_per_card(tmp_path):
    path = tmp_path / "s.json"
    st = {"v": 1, "full": "2026-10-01", "updated": "2026-10-01", "c": {"b": {"n": ["B"], "t": "", "d": ""},
                                                                      "a": {"n": ["A"], "t": "x", "d": "1"}}}
    italian.save_state(st, path)
    lines = path.read_text("utf-8").splitlines()
    assert lines[1].startswith('"a":') and lines[2].startswith('"b":')
    assert italian.load_state(path) == st
