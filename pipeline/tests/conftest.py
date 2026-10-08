"""Fixture sintetiche in formato Scryfall (solo i campi usati dalla pipeline)."""

import uuid

import pytest

from pauper_index.carddb import CardDB


def oid(name: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "oracle:" + name))


def pid(name: str, set_code: str, n: int = 0) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"print:{name}:{set_code}:{n}"))


def card(name, layout="normal", faces=None, pauper="legal", type_line="Instant", set_type="expansion",
         oracle_name=None):
    o = oid(oracle_name or name)
    c = {"id": pid(name, "ref"), "oracle_id": o, "name": name, "layout": layout, "type_line": type_line,
         "legalities": {"pauper": pauper}, "set_type": set_type}
    if faces:
        c["card_faces"] = [{"name": f, "type_line": type_line} for f in faces]
    return c


def printing(name, set_code="aaa", rarity="common", games=("paper", "mtgo"), released="2020-01-01",
             set_type="expansion", printed_name=None, illustration=None, n=0, faces=None, oracle_name=None,
             lang="en", artist="Artista"):
    p = {"id": pid(name, set_code, n), "oracle_id": oid(oracle_name or name), "name": name, "set": set_code,
         "set_name": set_code.upper(), "set_type": set_type, "collector_number": str(n + 1), "rarity": rarity,
         "games": list(games), "released_at": released, "lang": lang, "artist": artist,
         "illustration_id": illustration or pid(name, "art", n), "image_uris": {}}
    if printed_name:
        p["printed_name"] = printed_name
    if faces:
        p["card_faces"] = [{"name": f} for f in faces]
    return p


ORACLE = [
    card("Delver of Secrets // Insectile Aberration", "transform",
         ["Delver of Secrets", "Insectile Aberration"], type_line="Creature"),
    card("Fire // Ice", "split", ["Fire", "Ice"]),
    card("Bonecrusher Giant // Stomp", "adventure", ["Bonecrusher Giant", "Stomp"], pauper="not_legal"),
    card("Kitsune Mystic // Autumn-Tail, Kitsune Sage", "flip", ["Kitsune Mystic", "Autumn-Tail, Kitsune Sage"]),
    card("Brainstorm"),
    card("Harmonized Trio // Brainstorm", "prepare", ["Harmonized Trio", "Brainstorm"], pauper="not_legal"),
    card("Soltari Emissary", type_line="Creature"),
    card("Sultai Emissary", type_line="Creature"),
    card("Spider-Man, Web-Slinger", type_line="Creature"),
    card("Goblin", "token", type_line="Token Creature", pauper="not_legal", set_type="token"),
    card("Lórien Revealed", type_line="Sorcery"),
    card("Island", type_line="Basic Land — Island"),
    card("Gush", pauper="banned"),
    card("Galvanic Blast"),
    card("Tormod's Crypt", type_line="Artifact"),
    card("1996 World Champion", pauper="not_legal", type_line="Creature"),
    card("Rare Thing", pauper="not_legal"),
]

DEFAULT = [
    printing("Delver of Secrets // Insectile Aberration", "isd", released="2011-09-30",
             faces=["Delver of Secrets", "Insectile Aberration"]),
    printing("Fire // Ice", "apc", rarity="uncommon", released="2001-06-04"),
    printing("Fire // Ice", "mh2", released="2021-06-18"),
    printing("Bonecrusher Giant // Stomp", "eld", rarity="rare"),
    printing("Kitsune Mystic // Autumn-Tail, Kitsune Sage", "chk", released="2004-10-01"),
    printing("Brainstorm", "ice", released="1995-06-03"),
    printing("Brainstorm", "mmq", released="1999-10-04", illustration=pid("Brainstorm", "art", 0), n=1),
    printing("Harmonized Trio // Brainstorm", "sos", rarity="uncommon"),
    printing("Soltari Emissary", "wth", released="1997-06-09"),
    printing("Sultai Emissary", "ktk", released="2014-09-26"),
    printing("Spider-Man, Web-Slinger", "spm", rarity="common", games=("paper",), released="2025-09-26"),
    printing("Spider-Man, Web-Slinger", "om1", games=("mtgo",), released="2025-09-26",
             printed_name="Darval, Whose Web Protects"),
    printing("Goblin", "tm10", set_type="token"),
    printing("Lórien Revealed", "ltr", released="2023-06-23"),
    printing("Island", "lea", released="1993-08-05"),
    printing("Gush", "mmq", released="1999-10-04"),
    printing("Galvanic Blast", "som", released="2010-10-01"),
    printing("Tormod's Crypt", "drk", rarity="uncommon", released="1994-08-01"),
    printing("Tormod's Crypt", "mm2", released="2015-05-22"),
    printing("1996 World Champion", "pcel", rarity="rare", set_type="memorabilia"),
    printing("Rare Thing", "xyz", rarity="rare"),
    printing("Rare Thing", "pxyz", set_type="memorabilia", n=1),
    printing("Rare Thing", "axyz", games=("arena",), n=2),
]


@pytest.fixture(scope="session")
def db() -> CardDB:
    return CardDB(ORACLE, DEFAULT)


@pytest.fixture(scope="session")
def carddb() -> CardDB:
    """Come `db`, per i moduli di test che ridefiniscono `db` con un database finto."""
    return CardDB(ORACLE, DEFAULT)
