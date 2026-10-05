import pytest

from celho_pipeline.names import norm
from celho_pipeline.resolve import OnlineLog, Resolver

from .conftest import oid


@pytest.fixture
def resolver(db, tmp_path):
    aliases = {norm("Thormod's Crypt"): "Tormod's Crypt", norm("piroblast"): "Brainstorm"}
    return Resolver(db, aliases, {norm("Excluded Thing")}, OnlineLog(tmp_path / "online.csv"))


@pytest.mark.parametrize("raw", [
    "Delver of Secrets", "Delver of Secrets // Insectile Aberration", "delver of secrets",
    "Delver of Secrets/Insectile Aberration", "Insectile Aberration", "4 Delver of Secrets",
])
def test_dfc_same_oracle(resolver, raw):
    assert resolver.resolve(raw).oracle_id == oid("Delver of Secrets // Insectile Aberration")


@pytest.mark.parametrize("raw", ["Fire // Ice", "Fire//Ice", "Fire / Ice", "fire // ice"])
def test_split(resolver, raw):
    assert resolver.resolve(raw).oracle_id == oid("Fire // Ice")


def test_split_single_face_resolves_by_face(resolver):
    r = resolver.resolve("Fire")
    assert r.oracle_id == oid("Fire // Ice")
    assert r.method == "face"


def test_adventure_and_flip(resolver):
    assert resolver.resolve("Bonecrusher Giant").oracle_id == oid("Bonecrusher Giant // Stomp")
    assert resolver.resolve("Kitsune Mystic").oracle_id == oid("Kitsune Mystic // Autumn-Tail, Kitsune Sage")


def test_full_name_beats_face_of_other_card(resolver):
    # "Brainstorm" è anche la seconda faccia di una carta prepare: vince la carta col nome completo
    r = resolver.resolve("Brainstorm")
    assert r.oracle_id == oid("Brainstorm")
    assert r.method == "exact"


def test_never_merge_existing_names(resolver):
    a = resolver.resolve("Soltari Emissary").oracle_id
    b = resolver.resolve("Sultai Emissary").oracle_id
    assert a == oid("Soltari Emissary") and b == oid("Sultai Emissary") and a != b


def test_alias_and_typographic_apostrophe(resolver):
    r = resolver.resolve("Thormod’s Crypt")
    assert r.oracle_id == oid("Tormod's Crypt")
    assert r.method == "alias"


def test_exclusion_and_tokens(resolver):
    assert resolver.resolve("Excluded Thing").method == "excluded"
    r = resolver.resolve("Goblin")
    assert r.oracle_id is None and r.method == "nonplayable"


def test_printed_name_alias(resolver):
    r = resolver.resolve("Darval, Whose Web Protects")
    assert r.oracle_id == oid("Spider-Man, Web-Slinger")
    assert r.method == "alt"


def test_diacritics(resolver):
    assert resolver.resolve("Lorien Revealed").oracle_id == oid("Lórien Revealed")


def test_name_starting_with_number_is_not_stripped(resolver):
    assert resolver.resolve("1996 World Champion").oracle_id == oid("1996 World Champion")


def test_unresolved_offline(resolver):
    r = resolver.resolve("Explosao Elemental do Azul")
    assert r.oracle_id is None and r.method == "unresolved"


def test_online_log_is_reused(db, tmp_path):
    log = OnlineLog(tmp_path / "online.csv")
    log.put("Galvanik Blast", "fuzzy", "accettato", "Galvanic Blast", oid("Galvanic Blast"))
    log.put("Brainstrom", "fuzzy", "scartato: troppo diverso", "Brainstorm", oid("Brainstorm"))
    log.save()
    r = Resolver(db, {}, set(), OnlineLog(tmp_path / "online.csv"))
    assert r.resolve("Galvanik Blast").oracle_id == oid("Galvanic Blast")
    assert r.resolve("Brainstrom").oracle_id is None


class FakeApi:
    def __init__(self, search=None, named=None):
        self.search, self.named, self.calls = search or {}, named or {}, []

    def get(self, path, params=None, cache=True):
        self.calls.append((path, params))
        if path == "/cards/search":
            return self.search.get(params["q"], {"object": "error"})
        return self.named.get(params["fuzzy"], {"object": "error"})


def _card_obj(name):
    return {"object": "card", "name": name, "oracle_id": oid(name)}


def test_foreign_name_via_search(db, tmp_path):
    api = FakeApi(search={'lang:any !"Lorien Revelada"': {"object": "list", "data": [_card_obj("Lórien Revealed")]}})
    log = OnlineLog(tmp_path / "o.csv")
    r = Resolver(db, {}, set(), log, api).resolve("Lorien Revelada")
    assert r.oracle_id == oid("Lórien Revealed") and r.method == "foreign"
    assert log.get(norm("Lorien Revelada"))["esito"] == "accettato"


def test_fuzzy_accepts_close_common(db, tmp_path):
    api = FakeApi(named={"Galvanik Blast": _card_obj("Galvanic Blast")})
    r = Resolver(db, {}, set(), OnlineLog(tmp_path / "o.csv"), api).resolve("Galvanik Blast")
    assert r.oracle_id == oid("Galvanic Blast") and r.method == "fuzzy"


def test_fuzzy_rejects_card_without_common(db, tmp_path):
    api = FakeApi(named={"Rare Thingg": _card_obj("Rare Thing")})
    log = OnlineLog(tmp_path / "o.csv")
    r = Resolver(db, {}, set(), log, api).resolve("Rare Thingg")
    assert r.oracle_id is None
    assert log.get(norm("Rare Thingg"))["esito"] == "scartato: nessuna printing common"


def test_fuzzy_rejects_distant_match(db, tmp_path):
    api = FakeApi(named={"Negar": _card_obj("Gush")})
    log = OnlineLog(tmp_path / "o.csv")
    assert Resolver(db, {}, set(), log, api).resolve("Negar").oracle_id is None
    assert log.get(norm("Negar"))["esito"] == "scartato: troppo diverso"


def test_existing_name_never_goes_online(db, tmp_path):
    api = FakeApi()
    Resolver(db, {}, set(), OnlineLog(tmp_path / "o.csv"), api).resolve("Sultai Emissary")
    assert api.calls == []
