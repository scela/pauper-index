"""Protezione della pubblicazione programmata (`python -m pauper_index tested`).

Il job update non esegue i test: prima di pubblicare, deploy chiede questo controllo. Si pubblica se, tra le ultime
esecuzioni su push di main, ce n'è una con il job Test riuscito il cui commit ha il codice e i file curati a mano
identici a quelli di HEAD (`git diff --quiet <sha> HEAD -- <percorsi>`). Così:
- un'esecuzione annullata e sostituita da un'altra che ha testato lo stesso codice non ferma la pubblicazione;
- un push che tocca solo data/manual e fa fallire i test non va online, perché quei file contano nel confronto.
Si escludono i file di data/manual che il job update scrive da solo (TESTED_EXCLUDE).
"""

import json
import subprocess
from collections.abc import Callable, Iterable

from . import config

TESTED_PATHS = ("web", "pipeline", ".github/workflows", "data/manual")
# scritti dal job update (build), non a mano: OnlineLog.save in resolve.py
TESTED_EXCLUDE = ("data/manual/fuzzy_matches.csv",)
RUNS = 30  # ultime esecuzioni su push guardate (almeno 20)


def pathspec() -> list[str]:
    return [*TESTED_PATHS, *(f":(exclude){p}" for p in TESTED_EXCLUDE)]


def find_tested(runs: Iterable[dict], same: Callable[[str], bool], test_ok: Callable[[int], bool]) -> dict | None:
    """Prima esecuzione (dalla più recente) con lo stesso codice di HEAD e il job Test riuscito.

    `runs`: esecuzioni con `id` e `head_sha`; `same(sha)`: codice e file curati uguali a HEAD;
    `test_ok(id)`: job Test riuscito. `test_ok` si chiede solo per i commit uguali (una richiesta in meno a GitHub).
    """
    for r in runs:
        if same(r["head_sha"]) and test_ok(r["id"]):
            return r
    return None


def cmd_tested(repo: str) -> None:
    def git(*a) -> subprocess.CompletedProcess:
        return subprocess.run(["git", *a], cwd=config.ROOT, capture_output=True, text=True, check=False)

    def gh(path: str):
        out = subprocess.run(["gh", "api", path], capture_output=True, text=True, check=True).stdout
        return json.loads(out)

    head = git("rev-parse", "HEAD").stdout.strip()
    runs = gh(f"repos/{repo}/actions/workflows/aggiorna.yml/runs?branch=main&event=push&per_page={RUNS}")
    runs = runs["workflow_runs"]

    def same(sha: str) -> bool:
        # 0 = uguali; 1 = diversi; altro (commit sconosciuto, per esempio dopo un force push) = non verificabile
        return git("diff", "--quiet", sha, head, "--", *pathspec()).returncode == 0

    def test_ok(run_id: int) -> bool:
        jobs = gh(f"repos/{repo}/actions/runs/{run_id}/jobs")["jobs"]
        return any(j["name"] == "Test" and j["conclusion"] == "success" for j in jobs)

    hit = find_tested(runs, same, test_ok)
    excl = ", ".join(TESTED_EXCLUDE)
    if hit is None:
        print(f"::error::nessuna delle ultime {len(runs)} esecuzioni su push ha il job Test riuscito con codice e "
              f"file curati uguali a main ({head[:7]}; esclusi: {excl}): pubblicazione fermata, online resta la "
              "versione precedente")
        raise SystemExit(1)
    print(f"test verdi: esecuzione {hit['id']} sul commit {hit['head_sha'][:7]}, con codice e file curati uguali a "
          f"main ({head[:7]}; esclusi: {excl}): si pubblica")
