"""Campi dei filtri del sito: colori, mana value, riga del tipo e testo delle regole (cards.json v3, texts.json).

Le forme dei dati seguono il bulk oracle_cards reale (verificato il 2026-10-08): le bifronti (transform, modal_dfc)
non hanno `colors` né `oracle_text` al livello principale, solo nelle facce; split, adventure e flip hanno `colors`
al livello principale e il testo nelle facce.
"""

from pauper_index.carddb import CardDB, card_from_json
from pauper_index.outputs import build_texts

from .conftest import oid


def base(name, **kw):
    return {"id": oid("ref:" + name), "oracle_id": oid(name), "name": name, "layout": "normal",
            "legalities": {"pauper": "legal"}, **kw}


def test_normal_card():
    c = card_from_json(base("Lórien Revealed", colors=["U"], cmc=5.0, type_line="Sorcery",
                            oracle_text="Draw three cards.\nIslandcycling {1}", mana_cost="{3}{U}{U}"))
    assert (c.card_colors, c.mv, c.type_line) == ("U", 5.0, "Sorcery")
    assert c.oracle_text == "Draw three cards.\nIslandcycling {1}"


def test_transform_and_mdfc_use_union_of_faces():
    delver = card_from_json(base("Delver of Secrets // Insectile Aberration", layout="transform", cmc=1.0,
                                 type_line="Creature — Human Wizard // Creature — Human Insect",
                                 card_faces=[
                                     {"name": "Delver of Secrets", "colors": ["U"], "oracle_text": "At the beginning"},
                                     {"name": "Insectile Aberration", "colors": ["U"], "oracle_text": "Flying"}]))
    assert delver.card_colors == "U"
    assert delver.oracle_text == "At the beginning\n//\nFlying"
    mdfc = card_from_json(base("Bridgeworks Battle // Tanglespan Bridgeworks", layout="modal_dfc", cmc=3.0,
                               type_line="Sorcery // Land",
                               card_faces=[{"name": "Bridgeworks Battle", "colors": ["G"], "oracle_text": "Fight"},
                                           {"name": "Tanglespan Bridgeworks", "colors": [], "oracle_text": "Enters"}]))
    assert (mdfc.card_colors, mdfc.mv, mdfc.type_line) == ("G", 3.0, "Sorcery // Land")
    two = card_from_json(base("Two Sides", layout="transform",
                              card_faces=[{"name": "A", "colors": ["R"]}, {"name": "B", "colors": ["W"]}]))
    assert two.card_colors == "WR"  # ordine WUBRG


def test_split_uses_top_level_colors_and_face_texts():
    c = card_from_json(base("Fire // Ice", layout="split", colors=["R", "U"], cmc=4.0, type_line="Instant // Instant",
                            card_faces=[{"name": "Fire", "oracle_text": "Fire deals 2 damage"},
                                        {"name": "Ice", "oracle_text": "Tap target permanent."}]))
    assert c.card_colors == "UR"
    assert c.oracle_text == "Fire deals 2 damage\n//\nTap target permanent."


def test_colorless_land_and_color_indicator():
    thopter = card_from_json(base("Ornithopter", colors=[], cmc=0.0, type_line="Artifact Creature — Thopter"))
    assert thopter.card_colors == ""
    # colori della carta, non del costo: Dryad Arbor è verde anche senza costo di mana
    arbor = card_from_json(base("Dryad Arbor", colors=["G"], cmc=0.0, type_line="Land Creature — Forest Dryad"))
    assert (arbor.card_colors, arbor.colors) == ("G", "G")
    # non l'identità di colore: un simbolo nel testo non cambia i colori
    c = card_from_json(base("Prophetic Prism", colors=[], cmc=2.0, type_line="Artifact",
                            oracle_text="{1}, {T}: Add one mana of any color.", mana_cost="{2}"))
    assert c.card_colors == ""


def test_build_texts_follows_cards_order():
    oracle = [base("B card", oracle_text="beta"), base("A card", oracle_text="alpha")]
    db = CardDB(oracle, [])
    order = [oid("A card"), oid("B card")]
    assert build_texts(db, order) == ["alpha", "beta"]
