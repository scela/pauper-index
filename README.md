# Pauper Index

Di tutte le carte giocate in Pauper, quali possiedi, in qualunque printing?

Pauper Index confronta la tua collezione [ManaBox](https://manabox.app) con la lista delle carte giocate nei tornei Pauper (MTGO e cartaceo). La lista è integrata nel sito e si aggiorna da sola ogni settimana; tu carichi solo la tua collezione, che resta nel browser.

- **Sito**: in arrivo su GitHub Pages (Fase 3).
- **Dati**: decklist da [MTGODecklistCache](https://github.com/Jiliac/MTGODecklistCache), carte, legalità e immagini da [Scryfall](https://scryfall.com).

## Struttura

| Cartella | Contenuto |
|---|---|
| `pipeline/` | Pipeline Python (`pauper_index`): scarica le decklist e i dati Scryfall, risolve i nomi, deduplica, calcola le statistiche |
| `data/` | Dati generati e letti dal sito; `data/manual/` contiene alias ed esclusioni curati a mano |
| `web/` | Sito statico (Vite + TypeScript) |
| `docs/` | Specifica e idee per il futuro |

## Provarlo in locale (Windows, PowerShell)

```powershell
cd web
npm ci
npm run build
npm run preview      # poi apri http://localhost:4173/
```

Per rigenerare i dati serve Python 3.14:

```powershell
python -m venv .venv; .\.venv\Scripts\Activate.ps1; pip install -e "pipeline[dev]"
python -m pauper_index build
```

La guida completa (alias, esclusioni, aggiornamento manuale, revisioni) arriverà con la Fase 4.

## Avviso

Pauper Index is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.

Il progetto non è affiliato a Wizards of the Coast, ManaBox o Scryfall.
