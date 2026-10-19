import json

from pauper_index.cli import significant_changes

META = {"generated_at": "2026-10-17T11:40:52+00:00", "last_tournament": "2026-10-11", "decks": 156550,
        "scryfall": {"oracle_cards": "2026-10-17T09:01:58+00:00", "default_cards": "2026-10-17T09:05:48+00:00"},
        "source": {"commit": "686a3f1", "commit_date": "2026-10-12", "status": "ok", "days_since_last_tournament": 6}}
AUTO = {"next": 3, "groups": [{"id": 1, "name": "A + B", "core": ["x"], "created": "2026-10-07", "seen": "2026-10-17"},
                              {"id": 2, "name": "C + D", "core": ["y"], "created": "2026-10-08", "seen": "2026-10-17"}]}


def _check(old: dict, new: dict) -> list[str]:
    old_t = {p: json.dumps(v) for p, v in old.items()}
    new_t = {p: json.dumps(v) for p, v in new.items()}
    return significant_changes(list(new), lambda p: old_t.get(p, ""), new_t.__getitem__)


def _next_day():
    meta = json.loads(json.dumps(META))
    meta["generated_at"] = "2026-10-18T12:06:34+00:00"
    meta["scryfall"] = {"oracle_cards": "2026-10-18T09:01:55+00:00", "default_cards": "2026-10-18T09:06:08+00:00"}
    meta["source"]["days_since_last_tournament"] = 7
    auto = json.loads(json.dumps(AUTO))
    for g in auto["groups"]:
        g["seen"] = "2026-10-18"
    return meta, auto


def test_only_volatile_fields_is_not_a_change():
    # il caso dei commit del 16-18 ottobre: date di generazione, date dei bulk e "seen"
    meta, auto = _next_day()
    assert _check({"data/meta.json": META, "data/reviews/archetipi-auto.json": AUTO},
                  {"data/meta.json": meta, "data/reviews/archetipi-auto.json": auto}) == []


def test_real_changes_are_kept():
    meta, auto = _next_day()
    meta["last_tournament"] = "2026-10-18"
    assert _check({"data/meta.json": META}, {"data/meta.json": meta}) == ["data/meta.json"]
    meta, auto = _next_day()
    auto["groups"].append({"id": 3, "name": "E + F", "core": ["z"], "created": "2026-10-18", "seen": "2026-10-18"})
    assert _check({"data/reviews/archetipi-auto.json": AUTO},
                  {"data/reviews/archetipi-auto.json": auto}) == ["data/reviews/archetipi-auto.json"]
    meta, auto = _next_day()
    auto["groups"][0]["core"] = ["x", "w"]
    assert _check({"data/reviews/archetipi-auto.json": AUTO},
                  {"data/reviews/archetipi-auto.json": auto}) == ["data/reviews/archetipi-auto.json"]


def test_other_files_and_new_files_always_count():
    meta, _ = _next_day()
    assert _check({"data/meta.json": META, "data/cards.json": {"c": 1}},
                  {"data/meta.json": meta, "data/cards.json": {"c": 2}}) == ["data/cards.json"]
    # file nuovo (assente in HEAD), anche se è uno dei file con campi volatili
    assert _check({}, {"data/reviews/archetipi-auto.json": AUTO}) == ["data/reviews/archetipi-auto.json"]


def test_seticons_version_only_is_not_a_change():
    old = '<svg>\n<symbol id="dmu" viewBox="0 0 240 240" data-v="1791777600"><path d="M0 0h5v5z"/></symbol>\n</svg>\n'
    same = old.replace("1791777600", "1792382400")
    drawn = same.replace("h5v5", "h6v6")
    texts = {"old": old, "same": same, "drawn": drawn}
    p = "data/seticons.svg"
    assert significant_changes([p], lambda _: texts["old"], lambda _: texts["same"]) == []
    assert significant_changes([p], lambda _: texts["old"], lambda _: texts["drawn"]) == [p]
