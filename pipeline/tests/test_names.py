import json
from pathlib import Path

import pytest

from pauper_index.names import clean, norm, split_faces

VECTORS = json.loads((Path(__file__).parent / "fixtures" / "norm_vectors.json").read_text("utf-8"))


@pytest.mark.parametrize(("raw", "expected"), VECTORS)
def test_norm_vectors(raw, expected):
    assert norm(raw) == expected


@pytest.mark.parametrize(("raw", "expected"), [
    ("4 Galvanic Blast", "Galvanic Blast"),
    ("14 Mountain", "Mountain"),
    ("4x Ponder", "Ponder"),
    ("[BOK] Ninja of the Deep Hours", "Ninja of the Deep Hours"),
    ("[A] Counterspell", "Counterspell"),
    ("4 Stormshriek Feral // Flush Out", "Stormshriek Feral // Flush Out"),
    ("Meat Locker && Drowned Diner", "Meat Locker // Drowned Diner"),
    ("  Brainstorm  ", "Brainstorm"),
])
def test_clean(raw, expected):
    assert clean(raw) == expected


def test_split_faces():
    assert split_faces("Fire // Ice") == ["Fire", "Ice"]
    assert split_faces("Fire//Ice") == ["Fire", "Ice"]
    assert split_faces("Summon: Choco/Mog") == ["Summon: Choco/Mog"]
