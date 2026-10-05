#!/usr/bin/env python3
"""
pauper_sync.py - Confronta una List di ManaBox con uno o piu' Binder
ignorando la printing (set, collector number, foil). Lavora sugli export CSV di ManaBox.

Uso:
    python3 pauper_sync.py pauper_list.csv binder1.csv [binder2.csv ...]

Output (nella cartella corrente):
    pauper_nomi.txt         tutte le carte della List, una per riga ("1 Nome"), per import testuale
    posseduto.txt           carte della List che possiedi in almeno una printing
    mancanti.txt            carte della List che non possiedi in nessuna printing
    pauper_riallineata.csv  la List ricostruita: per ogni carta posseduta usa una printing
                            presente nei tuoi Binder (cosi' il filtro "In Collection" la
                            riconosce); le carte non possedute mantengono la printing originale

ATTENZIONE: esporta i singoli Binder, NON "All collection": quell'export include anche
le List (compresa "pauper") e ogni carta risulterebbe posseduta.
"""
import csv
import sys


def find_col(fieldnames, *candidates):
    lookup = {f.strip().casefold(): f for f in fieldnames if f}
    for c in candidates:
        if c in lookup:
            return lookup[c]
    return None


def card_key(name):
    # Case-insensitive; per le double-faced usa solo la faccia frontale ("A // B" -> "a")
    return name.split("//")[0].strip().casefold()


def get(row, col):
    return (row.get(col) or "").strip() if col else ""


def load(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        fields = reader.fieldnames or []
    cols = {
        "name": find_col(fields, "name", "card name"),
        "set": find_col(fields, "set code"),
        "num": find_col(fields, "collector number", "card number"),
        "foil": find_col(fields, "foil"),
        "qty": find_col(fields, "quantity"),
        "sid": find_col(fields, "scryfall id"),
        "lang": find_col(fields, "language"),
    }
    if not cols["name"]:
        sys.exit(f"[{path}] colonna del nome non trovata. Intestazioni lette: {fields}")
    return rows, cols


def write_names(path, names):
    with open(path, "w", encoding="utf-8") as f:
        f.writelines(f"1 {n}\n" for n in sorted(names, key=str.casefold))


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)

    list_rows, lc = load(sys.argv[1])

    # nome normalizzato -> (riga, colonne) della prima printing trovata nei Binder
    owned = {}
    for path in sys.argv[2:]:
        rows, bc = load(path)
        for r in rows:
            k = card_key(get(r, bc["name"]))
            if k:
                owned.setdefault(k, (r, bc))

    seen, all_names, have, missing, realigned = set(), [], [], [], []
    for r in list_rows:
        name = get(r, lc["name"])
        k = card_key(name)
        if not k or k in seen:
            continue
        seen.add(k)
        all_names.append(name)
        if k in owned:
            have.append(name)
            src, sc = owned[k]
        else:
            missing.append(name)
            src, sc = r, lc
        realigned.append({
            "Name": get(src, sc["name"]),
            "Set code": get(src, sc["set"]),
            "Collector number": get(src, sc["num"]),
            "Foil": get(src, sc["foil"]),
            "Language": get(src, sc["lang"]),
            "Scryfall ID": get(src, sc["sid"]),
            "Quantity": get(r, lc["qty"]) or "1",
        })

    write_names("pauper_nomi.txt", all_names)
    write_names("posseduto.txt", have)
    write_names("mancanti.txt", missing)

    fieldnames = list(realigned[0].keys()) if realigned else ["Name"]
    with open("pauper_riallineata.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(realigned)

    print(f"Carte uniche nella List:         {len(seen)}")
    print(f"Possedute (qualsiasi printing):  {len(have)}")
    print(f"Mancanti:                        {len(missing)}")


if __name__ == "__main__":
    main()
