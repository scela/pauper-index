import subprocess

from pauper_index import deploygate
from pauper_index.deploygate import find_tested


def test_find_tested_skips_cancelled_and_different_code():
    runs = [{"id": 3, "head_sha": "c"}, {"id": 2, "head_sha": "b"}, {"id": 1, "head_sha": "a"}]
    asked = []

    def test_ok(i):
        asked.append(i)
        return i != 2  # l'esecuzione 2 è stata annullata (o è rossa)

    # tutte con lo stesso codice: vale la più recente con il job Test riuscito
    assert find_tested(runs, lambda s: True, test_ok)["id"] == 3
    # c ha codice diverso (non testato), b annullata, a uguale e verde: vale a (caso fc02939 / a07e432)
    asked.clear()
    assert find_tested(runs, lambda s: s != "c", test_ok)["id"] == 1
    assert asked == [2, 1]  # il job Test si chiede solo per i commit uguali
    assert find_tested(runs, lambda s: s == "b", test_ok) is None


def git(repo, *a):
    return subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *a], cwd=repo, check=True,
                          capture_output=True, text=True).stdout.strip()


def commit(repo, files, msg):
    for name, text in files.items():
        p = repo / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, "utf-8")
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", msg)
    return git(repo, "rev-parse", "HEAD")


def same_as_head(repo, sha):
    return subprocess.run(["git", "diff", "--quiet", sha, "HEAD", "--", *deploygate.pathspec()], cwd=repo,
                          check=False).returncode == 0


def test_pathspec_counts_manual_files_but_not_the_generated_ones(tmp_path):
    repo = tmp_path
    git(repo, "init", "-q")
    base = commit(repo, {"web/a.ts": "1", "data/manual/archetypes.csv": "x", "data/manual/fuzzy_matches.csv": "f",
                         "data/cards.json": "{}"}, "codice")
    # dati generati e fuzzy_matches.csv (scritto dal job update): il codice testato resta quello
    commit(repo, {"data/cards.json": '{"v":2}', "data/manual/fuzzy_matches.csv": "f2"}, "dati")
    assert same_as_head(repo, base)
    # archetypes.csv curato a mano: va testato di nuovo
    commit(repo, {"data/manual/archetypes.csv": "y"}, "archetipi")
    assert not same_as_head(repo, base)
    # commit sconosciuto (per esempio dopo un force push): non verificabile, quindi non vale
    assert not same_as_head(repo, "0" * 40)
