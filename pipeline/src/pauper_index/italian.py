"""Nomi (e testo delle regole) delle stampe italiane, dalla ricerca di Scryfall (`lang:it`), senza il bulk all_cards.

Stato committato in data/reviews/italiano.json (non pubblicato), per oracle_id:
  {"n": [nomi italiani distinti, dal più recente], "t": testo della stampa italiana più recente, "d": sua data}
più `full` (data dell'ultimo scaricamento completo) e `updated` (ultimo aggiornamento).

Aggiornamento (vedi CLAUDE.md, "Nomi italiani"):
  - completo solo a richiesta (`python -m pauper_index italian --full`): circa 300 pagine di ricerca, 3 minuti;
  - incrementale durante `build`, quando esce un set nuovo o al più tardi dopo 7 giorni: solo le stampe uscite
    dai 60 giorni prima dell'ultimo aggiornamento in poi (`lang:it date>=…`), poche pagine.
Le traduzioni delle stampe vecchie non cambiano, quindi l'incrementale basta; i nomi si uniscono, mai rimossi.
"""

import datetime as dt
import json
from collections.abc import Callable
from pathlib import Path

from . import config
from .carddb import CardDB

STATE = config.REVIEWS / "italiano.json"
REFRESH_DAYS = 7
OVERLAP_DAYS = 60


def _faces(c: dict) -> list[dict]:
    return c.get("card_faces") or []


def printed_name(c: dict) -> str:
    """Nome stampato: quello principale o, per le carte a più facce, le facce unite con " // "."""
    faces = [f.get("printed_name") for f in _faces(c)]
    if faces and all(faces):
        return " // ".join(faces)
    return (c.get("printed_name") or "").strip()


def printed_text(c: dict) -> str:
    if c.get("printed_text"):
        return c["printed_text"]
    return "\n//\n".join(f.get("printed_text") or "" for f in _faces(c)).strip()


def oracle_of(c: dict) -> str | None:
    return c.get("oracle_id") or (_faces(c) or [{}])[0].get("oracle_id")


def search_pages(api, query: str, log: Callable[[str], None] = print):
    """Tutte le stampe di una ricerca, pagina per pagina (rispetta il limite di 500 ms dell'endpoint)."""
    page = 1
    while True:
        data = api.get("/cards/search", {"q": query, "unique": "prints", "order": "released", "dir": "asc",
                                         "page": page}, cache=False)
        if data.get("object") != "list":  # 404: nessuna stampa
            return
        yield from data.get("data") or []
        if page % 50 == 0:
            log(f"italiano: pagina {page} di circa {-(-data.get('total_cards', 0) // 175)}")
        if not data.get("has_more"):
            return
        page += 1


def merge(state: dict, prints) -> int:
    """Aggiunge le stampe italiane allo stato. Restituisce quante stampe sono state lette."""
    cards = state.setdefault("c", {})
    n = 0
    for c in prints:
        if c.get("lang") != "it":
            continue
        oid = oracle_of(c)
        name = printed_name(c)
        if not oid or not name:
            continue
        n += 1
        day = c.get("released_at") or ""
        e = cards.setdefault(oid, {"n": [], "t": "", "d": ""})
        # nomi distinti, dal più recente: la traduzione può cambiare tra un'edizione e l'altra
        if name in e["n"]:
            if day >= e["d"]:
                e["n"].remove(name)
                e["n"].insert(0, name)
        elif day >= e["d"]:
            e["n"].insert(0, name)
        else:
            e["n"].append(name)
        text = printed_text(c)
        if day >= e["d"]:
            e["d"] = day
            if text:
                e["t"] = text
        elif text and not e["t"]:
            e["t"] = text
    return n


def load_state(path: Path = STATE) -> dict:
    return json.loads(path.read_text("utf-8")) if path.exists() else {}


def save_state(state: dict, path: Path = STATE) -> None:
    """Una riga per carta, ordinate per oracle_id: diff leggibili."""
    path.parent.mkdir(parents=True, exist_ok=True)
    head = {k: v for k, v in state.items() if k != "c"}
    body = ",\n".join(json.dumps(k, ensure_ascii=False) + ":" + json.dumps(v, ensure_ascii=False, separators=(",", ":"))
                      for k, v in sorted(state.get("c", {}).items()))
    head_s = json.dumps(head, ensure_ascii=False, separators=(",", ":"))[:-1]
    path.write_text(f'{head_s},"c":{{\n{body}\n}}}}\n', "utf-8", newline="\n")


def due(state: dict, sets_info: dict, today: dt.date) -> str | None:
    """Motivo per un aggiornamento incrementale, o None. Senza stato serve lo scaricamento completo."""
    last = state.get("updated")
    if not last:
        return None
    if (today - dt.date.fromisoformat(last)).days >= REFRESH_DAYS:
        return f"ultimo aggiornamento il {last}"
    new = sorted(s["code"] for s in sets_info.values() if last < (s.get("released_at") or "") <= today.isoformat())
    return f"set nuovi: {', '.join(new[:5])}" if new else None


def update(api, sets_info: dict, today: dt.date | None = None, full: bool = False, path: Path = STATE,
           log: Callable[[str], None] = print) -> dict:
    """Aggiorna lo stato (completo o incrementale) se serve; senza rete (`api=None`) lo lascia com'è."""
    today = today or dt.date.today()
    state = load_state(path)
    if api is None:
        return state
    if full or not state.get("full"):
        log("italiano: scaricamento completo (lang:it)")
        state = {"v": 1}
        n = merge(state, search_pages(api, "lang:it", log))
        state["full"] = state["updated"] = today.isoformat()
    else:
        why = due(state, sets_info, today)
        if not why:
            return state
        since = dt.date.fromisoformat(state["updated"]) - dt.timedelta(days=OVERLAP_DAYS)
        log(f"italiano: aggiornamento incrementale ({why}), stampe dal {since}")
        n = merge(state, search_pages(api, f"lang:it date>={since.isoformat()}", log))
        state["updated"] = today.isoformat()
    log(f"italiano: {n} stampe lette, {len(state.get('c', {}))} carte con nome italiano")
    save_state(state, path)
    return state


def _its(e: dict | None, name: str) -> list[str]:
    return [x for x in (e or {}).get("n", []) if x.casefold() != name.casefold()]


def build_names(db: CardDB, state: dict, order: list[str], card_names: list[list[str]]) -> tuple[list, list]:
    """Nomi italiani distinti (dal più recente) diversi da quello inglese, in due file:

    - data/itnames.json, `c[i]`: della carta i di cards.json ([] se non ce ne sono): ricerca nell'elenco, scheda,
      controllo rapido;
    - data/itnames-other.json, `o`: [indice in cardnames.json, nomi…] delle altre carte giocabili in carta o su MTGO:
      solo per il controllo rapido.
    Niente nomi inglesi ripetuti: il sito li ha già in cards.json e cardnames.json.
    """
    cards = state.get("c", {})
    played = set(order)
    c = [_its(cards.get(o), db.cards[o].name) for o in order]
    by_name = {card.name: oid for oid, card in db.cards.items() if card.playable}
    others = []
    for i, (name, _legal) in enumerate(card_names):
        oid = by_name.get(name)
        if not oid or oid in played:
            continue
        its = _its(cards.get(oid), name)
        if its:
            others.append([i, *its])
    return c, others


def build_texts(state: dict, order: list[str]) -> list[str]:
    """Testo italiano (stampa più recente) delle carte di cards.json, nello stesso ordine; "" se non c'è."""
    cards = state.get("c", {})
    return [(cards.get(o) or {}).get("t", "") for o in order]
