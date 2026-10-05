"""Accesso a Scryfall: bulk data JSONL e API con rate limit e cache su disco."""

import gzip
import hashlib
import json
import time
from collections.abc import Iterator
from pathlib import Path
from urllib.parse import urlencode

import requests

from . import config

API = "https://api.scryfall.com"
# Limiti per endpoint (scryfall.com/docs/api/rate-limits): 500 ms per search/named/random/collection,
# 100 ms per il resto. Un 429 blocca l'accesso per 30 secondi.
SLOW_ENDPOINTS = ("/cards/search", "/cards/named", "/cards/random", "/cards/collection")
SLOW_DELAY = 0.55
LOCKOUT_WAIT = 35


def _headers(accept: str = "application/json") -> dict:
    return {"User-Agent": config.USER_AGENT, "Accept": accept}


class Api:
    """Client minimo: attesa tra le richieste, retry su 429/5xx, cache delle risposte."""

    def __init__(self, cache_dir: Path = config.API_CACHE, delay: float = config.SCRYFALL_DELAY):
        self.cache_dir = cache_dir
        self.delay = delay
        self.session = requests.Session()
        self._last = 0.0
        self.requests = 0

    def get(self, path: str, params: dict | None = None, cache: bool = True) -> dict:
        params = params or {}
        key = hashlib.sha1(f"{path}?{urlencode(sorted(params.items()))}".encode()).hexdigest()
        cached = self.cache_dir / f"{key}.json"
        if cache and cached.exists():
            return json.loads(cached.read_text("utf-8"))
        delay = SLOW_DELAY if path.startswith(SLOW_ENDPOINTS) else self.delay
        limited = 0
        for attempt in range(5):
            wait = self._last + delay - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            self._last = time.monotonic()
            self.requests += 1
            r = self.session.get(API + path, params=params, headers=_headers(), timeout=60)
            if r.status_code == 429:
                limited += 1
                if limited > 2:
                    break
                time.sleep(LOCKOUT_WAIT)
                continue
            if r.status_code >= 500:
                time.sleep(2**attempt)
                continue
            break
        if r.status_code not in (200, 404):
            r.raise_for_status()
        data = r.json()
        if cache:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            cached.write_text(json.dumps(data), "utf-8")
        return data


def ensure_bulk(kind: str, api: Api | None, cache_dir: Path = config.SCRYFALL_CACHE) -> tuple[Path, str]:
    """Scarica (se manca) il bulk `kind` più recente. Restituisce percorso e `updated_at`.

    Senza rete (`api=None`) usa l'ultimo file già in cache.
    """
    cache_dir.mkdir(parents=True, exist_ok=True)
    index_file = cache_dir / "bulk.json"
    index = json.loads(index_file.read_text("utf-8")) if index_file.exists() else {}
    if api is None:
        if kind not in index or not (cache_dir / index[kind]["file"]).exists():
            raise RuntimeError(f"bulk {kind} non presente in cache: serve la rete")
        return cache_dir / index[kind]["file"], index[kind]["updated_at"]

    entries = api.get("/bulk-data", cache=False)["data"]
    entry = next(e for e in entries if e["type"] == kind)
    url = entry["jsonl_download_uri"]
    target = cache_dir / url.rsplit("/", 1)[-1]
    if not target.exists():
        part = target.with_suffix(".part")
        with requests.get(url, headers=_headers("*/*"), stream=True, timeout=300) as r:
            r.raise_for_status()
            with open(part, "wb") as f:
                for chunk in r.iter_content(1 << 20):
                    f.write(chunk)
        part.replace(target)
        prefix = target.name.rsplit("-", 1)[0] + "-"
        for old in cache_dir.glob(prefix + "*.jsonl.gz"):
            if old != target:
                old.unlink()
    index[kind] = {"file": target.name, "updated_at": entry["updated_at"]}
    index_file.write_text(json.dumps(index, indent=2), "utf-8")
    return target, entry["updated_at"]


def iter_jsonl(path: Path) -> Iterator[dict]:
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


def fetch_sets(api: Api | None, cache_dir: Path = config.SCRYFALL_CACHE) -> dict[str, dict]:
    """Tutti i set Scryfall per codice (serve `parent_set_code`, assente nelle carte)."""
    f = cache_dir / "sets.json"
    if api is not None:
        data = api.get("/sets", cache=False)["data"]
        cache_dir.mkdir(parents=True, exist_ok=True)
        f.write_text(json.dumps(data), "utf-8")
    elif not f.exists():
        raise RuntimeError("sets.json non presente in cache: serve la rete")
    return {s["code"]: s for s in json.loads(f.read_text("utf-8"))}
