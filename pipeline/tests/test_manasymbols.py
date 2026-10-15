"""Sprite dei simboli di mana: pulizia a elenco chiuso, multicolore originale, niente download inutili."""

import xml.etree.ElementTree as ET

import pytest

from pauper_index import manasymbols


def test_clean_keeps_shapes_and_colors():
    svg = (b"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>"
           b"<g transform='translate(0 -1)' fill='none'><circle fill='#CAC5C0' cx='50' cy='50.998' r='50'/>"
           b"<path d='M55 11v64h1z' fill='#0D0F0F' id='x' style='color:red'/></g></svg>")
    vb, body = manasymbols.clean_symbol(svg)
    assert vb == "0 0 100 100"
    assert body == ('<g fill="none" transform="translate(0 -1)"><circle fill="#CAC5C0" cx="50" cy="50.998" r="50"/>'
                    '<path fill="#0D0F0F" d="M55 11v64h1z"/></g>')


def test_clean_drops_everything_else():
    svg = (b'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xl="http://www.w3.org/1999/xlink" viewBox="0 0 100 100">'
           b'<script>alert(1)</script><a xl:href="javascript:x"><path d="M0 0h1z"/></a>'
           b'<path d="M0 0h1z" fill="url(#evil)" onload="x()" transform="rotate(4) scale(9)"/>'
           b'<image href="https://example.com/x.png"/><style>*{}</style></svg>')
    vb, body = manasymbols.clean_symbol(svg)
    assert body == '<path d="M0 0h1z"/>'
    for bad in ("script", "alert", "href", "url(", "onload", "rotate", "image", "style"):
        assert bad not in body


def test_clean_rejects_invalid():
    with pytest.raises(ValueError):
        manasymbols.clean_symbol(b"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><g/></svg>")
    with pytest.raises(ValueError):
        manasymbols.clean_symbol(b"<svg xmlns='http://www.w3.org/2000/svg'><path d='M0 0z'/></svg>")
    with pytest.raises(ValueError):
        manasymbols.clean_symbol(b"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'>"
                                 b"<path d='M0 0\"/><script>'/></svg>")


def test_multicolor_is_original_five_wedges():
    sym = manasymbols.multicolor_symbol()
    root = ET.fromstring(f'<svg xmlns="http://www.w3.org/2000/svg">{sym}</svg>')
    s = root[0]
    assert s.get("id") == "M"
    assert [p.get("fill") for p in s if p.tag.endswith("path")] == manasymbols.WEDGES


def test_build_skips_when_complete(tmp_path):
    out = tmp_path / "manasymbols.svg"
    out.write_text("<svg>" + "".join(f'<symbol id="{i}"></symbol>' for i in manasymbols.IDS) + "</svg>", "utf-8")

    class NoApi:
        def get(self, *a, **k):
            raise AssertionError("nessuna richiesta se lo sprite è completo")

    manasymbols.build_sprite(NoApi(), True, out, log=lambda *_: None)
    manasymbols.build_sprite(None, False, tmp_path / "manca.svg", log=lambda *_: None)
    assert not (tmp_path / "manca.svg").exists()
