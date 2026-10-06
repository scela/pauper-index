"""Simboli delle espansioni (icone dei set di Scryfall) in un unico sprite SVG per il sito.

Le icone arrivano da `icon_svg_uri` di /sets (svgs.scryfall.io, senza limiti di frequenza). Ogni icona
viene ripulita (solo i tracciati, senza colori, id o stili) e le coordinate vengono arrotondate a una
precisione invisibile alle dimensioni d'uso (circa 1/1000 del lato). Lo sprite ha un `<symbol>` per icona;
il sito lo usa con `<use href="data/seticons.svg#nome">` e il colore viene da `currentColor`.

Lo sprite è committato: a ogni build si scaricano solo le icone nuove o cambiate (versione nell'URL),
le altre si riprendono dallo sprite esistente. Senza rete restano quelle già presenti.
"""

import re
import xml.etree.ElementTree as ET
from pathlib import Path

import requests

from . import config

SVG_NS = "{http://www.w3.org/2000/svg}"
# Marchi, non simboli di espansione: il planeswalker (The List), la "M" generica di Magic (default: World
# Championship, vecchie promo) e il logo DCI. Per questi set niente icona.
EXCLUDED = {"planeswalker", "default", "dci"}


def icon_ref(set_info: dict) -> tuple[str, str] | None:
    """(nome dell'icona, versione) da `icon_svg_uri`, per esempio ("dmu", "1791172800")."""
    uri = set_info.get("icon_svg_uri") or ""
    m = re.search(r"/sets/([a-z0-9_-]+)\.svg(?:\?(\w+))?$", uri)
    if not m or m.group(1) in EXCLUDED:
        return None
    return m.group(1), m.group(2) or ""


# ---------- tracciati ----------

_NUM = re.compile(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")
_ARGS = {"M": 2, "L": 2, "H": 1, "V": 1, "C": 6, "S": 4, "Q": 4, "T": 2, "A": 7, "Z": 0}


def _tokens(d: str):
    """Comandi e argomenti; i flag degli archi possono essere attaccati ("a1 1 0 011 1")."""
    i, n = 0, len(d)
    cmd = None
    while i < n:
        c = d[i]
        if c.isspace() or c == ",":
            i += 1
            continue
        if c.upper() in _ARGS:
            cmd = c
            i += 1
            if c in "Zz":
                yield c, []
            continue
        if cmd is None:
            raise ValueError(f"tracciato non valido: {d[:40]}")
        args = []
        for k in range(_ARGS[cmd.upper()]):
            while i < n and (d[i].isspace() or d[i] == ","):
                i += 1
            if cmd.upper() == "A" and k in (3, 4):
                args.append(float(d[i]))
                i += 1
                continue
            m = _NUM.match(d, i)
            if not m:
                raise ValueError(f"numero atteso in {d[max(0, i - 10):i + 10]!r}")
            args.append(float(m.group()))
            i = m.end()
        yield cmd, args
        if cmd == "M":
            cmd = "L"  # coppie successive a un moveto sono lineto
        elif cmd == "m":
            cmd = "l"


def _fmt(v: float, digits: int) -> str:
    s = f"{round(v, digits):.{digits}f}"
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    if s in ("-0", ""):
        s = "0"
    if s.startswith("0.") and len(s) > 2:
        s = s[1:]
    elif s.startswith("-0.") and len(s) > 3:
        s = "-" + s[2:]
    return s


def _join(nums: list[str]) -> str:
    out = ""
    for s in nums:
        if out and not s.startswith("-") and not (s.startswith(".") and "." in _last_num(out)):
            out += " "
        out += s
    return out


def _last_num(s: str) -> str:
    m = re.search(r"[-+]?[\d.]*$", s)
    return m.group() if m else ""


def compact_path(d: str, digits: int, scale: float = 1.0) -> str:
    """Tracciato equivalente (moltiplicato per `scale`) in coordinate relative, arrotondate senza accumulare
    errori: ogni punto si arrotonda in assoluto e lo spostamento si calcola tra punti già arrotondati."""
    q = 10.0 ** -digits

    def r(v: float) -> float:
        return round(round(v * scale / q) * q, digits)

    cx = cy = 0.0  # punto corrente esatto
    px = py = 0.0  # punto corrente arrotondato
    sx = sy = spx = spy = 0.0  # inizio del sottotracciato
    out: list[str] = []
    last = ""
    for cmd, a in _tokens(d):
        up = cmd.upper()
        rel = cmd != up
        if up == "Z":
            out.append("z")
            last = "z"
            cx, cy, px, py = sx, sy, spx, spy
            continue
        if up == "H":
            pts = [(a[0] + (cx if rel else 0), cy)]
        elif up == "V":
            pts = [(cx, a[0] + (cy if rel else 0))]
        elif up == "A":
            pts = [(a[5] + (cx if rel else 0), a[6] + (cy if rel else 0))]
        else:
            pts = [(a[k] + (cx if rel else 0), a[k + 1] + (cy if rel else 0)) for k in range(0, len(a), 2)]
        rounded = [(r(x), r(y)) for x, y in pts]
        ex, ey = pts[-1]
        rex, rey = rounded[-1]
        if up == "H":
            letter, nums = "h", [_fmt(rex - px, digits)]
        elif up == "V":
            letter, nums = "v", [_fmt(rey - py, digits)]
        elif up == "A":
            letter = "a"
            nums = [_fmt(r(abs(a[0])), digits), _fmt(r(abs(a[1])), digits), _fmt(round(a[2], 1), 1),
                    str(int(a[3])), str(int(a[4])), _fmt(rex - px, digits), _fmt(rey - py, digits)]
        else:
            letter = up.lower()
            nums = [_fmt(v, digits) for x, y in rounded for v in (x - px, y - py)]
        if letter == "a":
            # archi: lettera sempre presente e flag separati da spazi (alcuni lettori non accettano i flag attaccati)
            out.append("a" + " ".join(nums))
        elif letter == "m" or letter != last:
            out.append(letter + _join(nums))
        else:
            # stesso comando: basta continuare la lista dei numeri
            body = _join(nums)
            out.append(body if body.startswith("-") else " " + body)
        last = letter
        if letter == "m":
            sx, sy, spx, spy = ex, ey, rex, rey
        cx, cy, px, py = ex, ey, rex, rey
    return "".join(out)


# ---------- icone ----------

# Ogni icona si riporta a una griglia di GRID unità sul lato maggiore, con coordinate intere: a 24 px CSS su
# uno schermo 2x un'unità vale circa 0,2 pixel, quindi l'arrotondamento non si vede.
GRID = 240


def clean_icon(svg_bytes: bytes, grid: int = GRID) -> tuple[str, list[tuple[str, bool]]]:
    """viewBox e tracciati visibili (d, evenodd) di un'icona; colori, id e stili si scartano."""
    root = ET.fromstring(svg_bytes)
    if root.tag != SVG_NS + "svg":
        raise ValueError("non è un SVG")
    box = [float(v) for v in root.get("viewBox", "").replace(",", " ").split()]
    if len(box) != 4 or min(box[2:]) <= 0:
        raise ValueError("viewBox mancante")
    k = grid / max(box[2:])
    vb = " ".join(str(round(v * k)) for v in box)
    paths: list[tuple[str, bool]] = []

    def walk(el: ET.Element, fill: str, rule: str) -> None:
        fill = el.get("fill", fill)
        rule = el.get("fill-rule", rule)
        tag = el.tag.removeprefix(SVG_NS)
        if tag == "path" and fill != "none" and el.get("d"):
            paths.append((compact_path(el.get("d"), 0, k), rule == "evenodd"))
        if tag in ("svg", "g"):
            for ch in el:
                walk(ch, fill, rule)

    walk(root, "#000", "nonzero")
    if not paths:
        raise ValueError("nessun tracciato")
    return vb, paths


def _symbol(name: str, version: str, vb: str, paths: list[tuple[str, bool]]) -> str:
    body = "".join(f'<path{" fill-rule=\"evenodd\"" if eo else ""} d="{d}"/>' for d, eo in paths)
    return f'<symbol id="{name}" viewBox="{vb}" data-v="{version}">{body}</symbol>'


_SYMBOL = re.compile(r'<symbol id="([a-z0-9_-]+)" viewBox="[^"]*" data-v="(\w*)">.*?</symbol>', re.S)


def read_sprite(path: Path) -> dict[str, tuple[str, str]]:
    """Icone già presenti nello sprite: nome -> (versione, testo del <symbol>)."""
    if not path.exists():
        return {}
    return {m.group(1): (m.group(2), m.group(0)) for m in _SYMBOL.finditer(path.read_text("utf-8"))}


def build_sprite(codes: list[str], sets_info: dict[str, dict], online: bool, out: Path,
                 log=print) -> dict[str, str]:
    """Scrive lo sprite con le icone dei set indicati. Restituisce set -> nome dell'icona (solo quelle presenti)."""
    wanted: dict[str, str] = {}  # icona -> versione
    uri: dict[str, str] = {}
    by_set: dict[str, str] = {}
    for c in codes:
        ref = icon_ref(sets_info.get(c, {}))
        if not ref:
            continue
        name, ver = ref
        by_set[c] = name
        wanted[name] = ver
        uri[name] = sets_info[c]["icon_svg_uri"]
    have = read_sprite(out)
    symbols: dict[str, str] = {}
    session = requests.Session() if online else None
    fetched = failed = 0
    for name in sorted(wanted):
        old = have.get(name)
        if old and (old[0] == wanted[name] or session is None):
            symbols[name] = old[1]
            continue
        if session is None:
            continue
        try:
            r = session.get(uri[name], headers={"User-Agent": config.USER_AGENT, "Accept": "image/svg+xml"}, timeout=30)
            r.raise_for_status()
            vb, paths = clean_icon(r.content)
            symbols[name] = _symbol(name, wanted[name], vb, paths)
            fetched += 1
        except (requests.RequestException, ValueError, ET.ParseError) as e:
            failed += 1
            log(f"icona {name}: {e}")
            if old:
                symbols[name] = old[1]
    text = ('<svg xmlns="http://www.w3.org/2000/svg">\n'
            + "\n".join(symbols[n] for n in sorted(symbols)) + "\n</svg>\n")
    out.write_text(text, "utf-8", newline="\n")
    log(f"icone dei set: {len(symbols)} (scaricate {fetched}, errori {failed})")
    return {c: n for c, n in by_set.items() if n in symbols}
