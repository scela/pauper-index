"""Font del nome "Pauper Index" (testata e og-image): New Rocker ridotto ai soli caratteri del titolo.

New Rocker è sotto SIL Open Font License 1.1 con Reserved Font Name "New Rocker": la versione ridotta è
una "Modified Version", quindi il nome interno del font cambia in "Pauper Index Title". Copyright e
licenza restano nella tabella dei nomi; il testo della licenza è in public/fonts/OFL-NewRocker.txt.

Uso (fonttools non è una dipendenza del progetto: si installa in un ambiente temporaneo):
    python -m venv <tmp>/ft; <tmp>/ft/Scripts/pip install fonttools brotli
    <tmp>/ft/Scripts/python web/scripts/title-font.py <NewRocker-Regular.ttf>
Il file sorgente è https://github.com/google/fonts/blob/main/ofl/newrocker/NewRocker-Regular.ttf
"""

import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

TEXT = "Pauper Index"
FAMILY = "Pauper Index Title"
OUT = Path(__file__).resolve().parents[1] / "public" / "fonts" / "pauper-index-title.woff2"


def main(src: str) -> None:
    font = TTFont(src)
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["kern", "liga"]
    opts.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]  # copyright, nomi, versione, licenza
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(text=TEXT)
    sub.subset(font)
    # Reserved Font Name: la versione modificata non può chiamarsi "New Rocker"
    names = {1: FAMILY, 2: "Regular", 3: f"{FAMILY} Regular; subset", 4: f"{FAMILY} Regular",
             6: FAMILY.replace(" ", "") + "-Regular"}
    for rec in list(font["name"].names):
        if rec.nameID in (16, 17, 21, 22):
            font["name"].removeNames(nameID=rec.nameID)
        elif rec.nameID in names:
            rec.string = names[rec.nameID]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    font.save(OUT)
    left = [r.toUnicode() for r in font["name"].names if "rocker" in r.toUnicode().lower() and r.nameID not in (0, 13, 14)]
    print(OUT, OUT.stat().st_size, "byte", "nomi con 'New Rocker' fuori da copyright/licenza:", left)


if __name__ == "__main__":
    main(sys.argv[1])
