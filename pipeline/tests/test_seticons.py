"""Simboli delle espansioni: pulizia delle icone, compattazione dei tracciati, sprite incrementale."""

import re

from pauper_index import outputs, seticons


def absolute_points(d: str) -> list[tuple[float, float]]:
    """Punti finali di ogni segmento, in assoluto (per confrontare due tracciati)."""
    pts = []
    cx = cy = sx = sy = 0.0
    for cmd, a in seticons._tokens(d):
        up, rel = cmd.upper(), cmd.islower()
        if up == "Z":
            cx, cy = sx, sy
            pts.append((cx, cy))
            continue
        if up == "H":
            cx = a[0] + (cx if rel else 0)
        elif up == "V":
            cy = a[0] + (cy if rel else 0)
        else:
            x, y = a[-2], a[-1]
            cx, cy = x + (cx if rel else 0), y + (cy if rel else 0)
        if up == "M":
            sx, sy = cx, cy
        pts.append((cx, cy))
    return pts


def test_compact_path_keeps_geometry_without_drift():
    d = ("M10.25 10.25L20.4 10.4h5.33v4.44c1.1 1.1 2.2 2.2 3.3 3.3s1 1 2 2"
         "a1.5 1.5 0 011.5 1.5" + "l.3.3" * 200 + "zm5 5 1 1 1 1z")
    out = seticons.compact_path(d, 0, 2.0)
    a = absolute_points(d)
    b = absolute_points(out)
    assert len(a) == len(b)
    # ogni punto è arrotondato in assoluto: errore massimo mezza unità, senza accumulo nei 200 segmenti
    for (x1, y1), (x2, y2) in zip(a, b, strict=True):
        assert abs(x1 * 2 - x2) <= 0.5 + 1e-9 and abs(y1 * 2 - y2) <= 0.5 + 1e-9


def test_arc_flags_attached_are_parsed():
    out = seticons.compact_path("M0 0a5 5 0 011 1", 1)
    assert "a5 5 0 0 1 1 1" in out


def test_clean_icon_drops_colors_and_invisible_paths():
    svg = (b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><g fill="none" fill-rule="evenodd">'
           b'<g fill="#000" fill-rule="nonzero"><path id="x" style="color:red" d="M0 0h10v10z"/></g>'
           b'<path d="M50 50h1v1z"/></g><script>alert(1)</script></svg>')
    vb, paths = seticons.clean_icon(svg, grid=240)
    assert vb == "0 0 240 120"
    assert len(paths) == 1  # il tracciato con fill="none" non si vede: scartato
    d, evenodd = paths[0]
    assert not evenodd and d == "m0 0h20v20z"
    sym = seticons._symbol("tst", "1", vb, paths)
    assert "script" not in sym and "style" not in sym and "fill=" not in sym.replace("fill-rule", "")


def test_excluded_marks_have_no_icon():
    assert seticons.icon_ref({"icon_svg_uri": "https://svgs.scryfall.io/sets/planeswalker.svg?1"}) is None
    assert seticons.icon_ref({"icon_svg_uri": "https://svgs.scryfall.io/sets/default.svg?1"}) is None
    assert seticons.icon_ref({"icon_svg_uri": "https://svgs.scryfall.io/sets/dci.svg"}) is None
    assert seticons.icon_ref({"icon_svg_uri": "https://svgs.scryfall.io/sets/dmu.svg?179"}) == ("dmu", "179")


def test_sprite_offline_reuses_existing_symbols(tmp_path):
    out = tmp_path / "seticons.svg"
    src = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h5v5z"/></svg>'
    vb, paths = seticons.clean_icon(src)
    out.write_text('<svg xmlns="http://www.w3.org/2000/svg">\n' + seticons._symbol("dmu", "7", vb, paths)
                   + '\n<symbol id="old" viewBox="0 0 1 1" data-v="1"><path d="m0 0h1z"/></symbol>\n</svg>\n', "utf-8")
    info = {
        "dmu": {"icon_svg_uri": "https://svgs.scryfall.io/sets/dmu.svg?8"},  # versione nuova, ma senza rete
        "dmc": {"icon_svg_uri": "https://svgs.scryfall.io/sets/dmu.svg?8"},
        "plst": {"icon_svg_uri": "https://svgs.scryfall.io/sets/planeswalker.svg?8"},
        "new": {"icon_svg_uri": "https://svgs.scryfall.io/sets/new.svg?8"},
    }
    icons = seticons.build_sprite(["dmu", "dmc", "plst", "new"], info, False, out, log=lambda _: None)
    assert icons == {"dmu": "dmu", "dmc": "dmu"}
    text = out.read_text("utf-8")
    assert re.findall(r'<symbol id="([^"]+)"', text) == ["dmu"]  # le icone non più usate si tolgono
    rows = outputs.with_icons([{"c": "dmu"}, {"c": "dmc"}, {"c": "plst"}], icons)
    assert rows == [{"c": "dmu"}, {"c": "dmc", "i": "dmu"}, {"c": "plst", "i": ""}]
