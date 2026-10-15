"""Simboli di mana in un unico sprite SVG per il sito (data/manasymbols.svg).

Ammessi come piccole icone per decisione dell'utente (2026-10-15, vedi CLAUDE.md): i cinque colori, l'incolore e il
mana generico da 0 a 6, dalla symbology di Scryfall (`/symbology`, poi gli SVG su svgs.scryfall.io, senza limiti di
frequenza). A differenza dei simboli dei set mantengono i loro colori (cerchio colorato e segno scuro), quindi non
si ricolorano. Ogni SVG passa da una pulizia a elenco chiuso: solo svg, g, path e circle, colori esadecimali,
fill-rule e spostamenti numerici; tutto il resto (id, stili, script, link) si scarta.

C'è anche un simbolo originale, non di Wizards, per "Multicolore": un cerchio diviso in cinque spicchi.

Lo sprite è committato e si scarica solo se manca o è incompleto: i simboli non cambiano.
"""

import math
import re
import xml.etree.ElementTree as ET
from pathlib import Path

import requests

from . import config

SVG_NS = "{http://www.w3.org/2000/svg}"
# simbolo di Scryfall -> id nello sprite (gli id devono iniziare con una lettera)
SYMBOLS = {"{W}": "W", "{U}": "U", "{B}": "B", "{R}": "R", "{G}": "G", "{C}": "C",
           **{f"{{{n}}}": f"N{n}" for n in range(7)}}
MULTI = "M"
IDS = [*SYMBOLS.values(), MULTI]

_HEX = re.compile(r"#[0-9A-Fa-f]{3}(?:[0-9A-Fa-f]{3})?$")
_NUM = r"-?(?:\d+\.?\d*|\.\d+)"
_TRANSLATE = re.compile(rf"translate\(\s*{_NUM}(?:[\s,]+{_NUM})?\s*\)$")
_PATH = re.compile(r"[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]+$")
_NUMBER = re.compile(rf"{_NUM}$")


def _attrs(el: ET.Element, tag: str) -> str:
    out = []
    fill = el.get("fill")
    if fill is not None and (fill == "none" or _HEX.match(fill)):
        out.append(f'fill="{fill}"')
    if el.get("fill-rule") in ("evenodd", "nonzero"):
        out.append(f'fill-rule="{el.get("fill-rule")}"')
    tr = el.get("transform")
    if tr and _TRANSLATE.match(tr.strip()):
        out.append(f'transform="{tr.strip()}"')
    if tag == "path":
        d = el.get("d") or ""
        if not _PATH.match(d):
            raise ValueError("tracciato non valido")
        out.append(f'd="{" ".join(d.split())}"')
    if tag == "circle":
        for a in ("cx", "cy", "r"):
            v = el.get(a, "0")
            if not _NUMBER.match(v):
                raise ValueError(f"{a} non valido")
            out.append(f'{a}="{v}"')
    return (" " + " ".join(out)) if out else ""


def clean_symbol(svg_bytes: bytes) -> tuple[str, str]:
    """viewBox e contenuto ripulito (solo g, path e circle con attributi ammessi) di un simbolo."""
    try:
        root = ET.fromstring(svg_bytes)
    except ET.ParseError as e:
        raise ValueError(f"SVG non valido: {e}") from e
    if root.tag != SVG_NS + "svg":
        raise ValueError("non è un SVG")
    box = root.get("viewBox", "").replace(",", " ").split()
    if len(box) != 4 or not all(_NUMBER.match(v) for v in box):
        raise ValueError("viewBox mancante")

    def walk(el: ET.Element) -> str:
        parts = []
        for ch in el:
            tag = ch.tag.removeprefix(SVG_NS)
            if tag == "g":
                inner = walk(ch)
                if inner:
                    parts.append(f"<g{_attrs(ch, tag)}>{inner}</g>")
            elif tag in ("path", "circle"):
                parts.append(f"<{tag}{_attrs(ch, tag)}/>")
        return "".join(parts)

    body = walk(root)
    if "<path" not in body and "<circle" not in body:
        raise ValueError("nessun tracciato")
    return " ".join(box), body


# colori degli spicchi: gli stessi dei cerchi dei simboli W, U, B, R, G
WEDGES = ["#F8F6D8", "#C1D7E9", "#CAC5C0", "#E49977", "#A3C095"]


def multicolor_symbol() -> str:
    """Simbolo originale per "Multicolore": cinque spicchi (WUBRG dall'alto, in senso orario) e un bordo scuro."""
    parts = []
    for k, color in enumerate(WEDGES):
        a0 = math.radians(-90 + 72 * k)
        a1 = math.radians(-90 + 72 * (k + 1))
        x0, y0 = 50 + 48 * math.cos(a0), 50 + 48 * math.sin(a0)
        x1, y1 = 50 + 48 * math.cos(a1), 50 + 48 * math.sin(a1)
        parts.append(f'<path fill="{color}" d="M50 50L{x0:.2f} {y0:.2f}A48 48 0 0 1 {x1:.2f} {y1:.2f}z"/>')
    parts.append('<circle fill="none" stroke="#0D0F0F" stroke-width="4" cx="50" cy="50" r="48"/>')
    return f'<symbol id="{MULTI}" viewBox="0 0 100 100">{"".join(parts)}</symbol>'


_SYMBOL = re.compile(r'<symbol id="([A-Z0-9]+)"')


def present(path: Path) -> set[str]:
    return set(_SYMBOL.findall(path.read_text("utf-8"))) if path.exists() else set()


def build_sprite(api, online: bool, out: Path, log=print) -> None:
    """Scrive lo sprite se manca o è incompleto (con la rete); altrimenti lo lascia com'è."""
    if present(out) >= set(IDS):
        log("simboli di mana: già presenti")
        return
    if not online or api is None:
        log("simboli di mana: sprite incompleto e nessuna rete, lasciato com'è")
        return
    uris = {s["symbol"]: s["svg_uri"] for s in api.get("/symbology", cache=False).get("data", [])}
    symbols = []
    for sym, sid in SYMBOLS.items():
        if sym not in uris:
            raise ValueError(f"simbolo {sym} assente dalla symbology")
        r = requests.get(uris[sym], headers={"User-Agent": config.USER_AGENT, "Accept": "image/svg+xml"}, timeout=30)
        r.raise_for_status()
        vb, body = clean_symbol(r.content)
        symbols.append(f'<symbol id="{sid}" viewBox="{vb}">{body}</symbol>')
    symbols.append(multicolor_symbol())
    out.write_text('<svg xmlns="http://www.w3.org/2000/svg">\n' + "\n".join(symbols) + "\n</svg>\n", "utf-8",
                   newline="\n")
    log(f"simboli di mana: {len(symbols)} scritti")
