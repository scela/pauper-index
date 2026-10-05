# Pauper Index

Di tutte le carte giocate in Pauper, quali possiedi, in qualunque printing?

Pauper Index confronta la tua collezione [ManaBox](https://manabox.app) con la lista delle carte giocate nei tornei Pauper (MTGO e cartaceo). La lista è integrata nel sito e si aggiorna da sola **ogni giorno**; tu carichi solo la tua collezione, che resta nel browser.

- **Sito**: https://scela.github.io/pauper-index/
- **Dati**: decklist da [MTGODecklistCache](https://github.com/Jiliac/MTGODecklistCache), carte, legalità e immagini da [Scryfall](https://scryfall.com).
- **Segnalazioni**: massadalbe@hotmail.com

## Come si aggiorna

Il workflow [`Aggiorna e pubblica`](.github/workflows/aggiorna.yml) gira ogni giorno alle 07:23 UTC:

1. scarica le nuove decklist e i dati Scryfall e ricalcola tutto da zero;
2. se i dati sono cambiati fa un commit (`Dati: aggiornamento del …`) e ripubblica il sito;
3. esegue le revisioni dopo le espansioni e controlla che la fonte non sia ferma: in entrambi i casi apre una Issue;
4. se qualcosa fallisce apre una Issue assegnata al proprietario del repository (arriva un'email).

Il sito mostra sempre la data dei dati e avvisa se la fonte non riceve tornei da più di 21 giorni.

**Aggiornamento manuale**: su GitHub, scheda *Actions* → *Aggiorna e pubblica* → *Run workflow*.
**Forzare una revisione**: stesso percorso, scrivendo il codice Scryfall del set (per esempio `hob`) nel campo *forza_revisione*.

## Correggere i dati a mano

- `data/manual/aliases.csv` (`sorgente,corretto`): nomi scritti male o in altre lingue nelle decklist.
- `data/manual/exclude.csv` (`nome,motivo`): voci da ignorare (token, carte ausiliarie).
- `data/manual/fuzzy_matches.csv`: esiti delle ricerche automatiche su Scryfall; cambia `esito` per correggerne uno.

Dopo un commit su `main` il sito si ripubblica da solo; i dati si ricalcolano al giro successivo (o con l'aggiornamento manuale).

## Struttura

| Cartella | Contenuto |
|---|---|
| `pipeline/` | Pipeline Python (`pauper_index`): decklist e dati Scryfall, risoluzione dei nomi, deduplica, statistiche, revisioni |
| `data/` | Dati generati e letti dal sito; `data/manual/` contiene i file curati a mano; `data/reviews/` le revisioni |
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

## Avviso

Pauper Index is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.

Il progetto non è affiliato a Wizards of the Coast, ManaBox o Scryfall.
