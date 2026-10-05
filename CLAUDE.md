# CLAUDE.md — "Ce l'ho? Pauper"

## Scopo

Web app statica: tra le carte giocate in Pauper, quali possiedo (in qualsiasi printing) nella mia collezione ManaBox?
- **Pipeline** Python (GitHub Actions): lista delle carte giocate, con statistiche e legalità, chiave `oracle_id` Scryfall.
- **Frontend** statico (Vite + TS): legge nel browser l'export CSV di ManaBox e lo confronta con la lista.

La specifica completa è in `docs/SPEC.md`. Questo file registra le decisioni prese e gli scostamenti dalla spec: **tienilo aggiornato**.

## Stato

- [x] Fase 0: setup e ispezione dei formati
- [ ] Fase 1: pipeline in locale, test, confronto con la baseline
- [ ] Fase 2: frontend
- [ ] Fase 3: GitHub Actions e deploy
- [ ] Fase 4: rifinitura e README

## Struttura

```
docs/SPEC.md            specifica
reference/              prototipo (ce-lho.html) e script (pauper_sync.py) da portare
reference/private/      export ManaBox personali: IGNORATA da git, non copiarne mai il contenuto
baseline/               pauper-2026-09-14.csv: List ManaBox della ricerca precedente (carte giocate negli ultimi 12 mesi)
pipeline/               pacchetto Python celho_pipeline (Fase 1)
data/                   output committati, letti dal frontend; data/manual/ contiene i file curati a mano
web/                    frontend (Fase 2)
.cache/                 IGNORATA: clone della fonte, bulk Scryfall, cache HTTP
```

## Ambiente e comandi

Sviluppo su Windows 11 (PowerShell, Git for Windows); la CI gira su Ubuntu.
- **Python 3.14** sia in locale sia in CI (stessa versione minore). Su Windows usa `python` o `py`: `python3` apre lo stub del Microsoft Store.
- Node 24.

```powershell
python -m venv .venv; .\.venv\Scripts\Activate.ps1; pip install -e "pipeline[dev]"   # Fase 1
.\.venv\Scripts\python -m pytest pipeline
```

## Convenzioni

- Fine riga LF nel repo (`.gitattributes`); `.ps1` in CRLF.
- Testi della UI e della documentazione in italiano; codice e identificatori in inglese.
- **Formati verificati su file reali, mai inventati.**
- **Mai dati personali nel repo**, e mai i nomi dei giocatori presenti nella fonte (campo `Player`) negli output.
- Fixture dei test sintetiche.

## Fonte dati (verificata in Fase 0, 2026-10-05)

**Repo**: `https://github.com/Jiliac/MTGODecklistCache.git`, fork di Badaro (archiviato, fermo al 2025-06). Il fork fbettega non esiste più.

**Clone** (circa 420 MB su disco con lo sparse-checkout):
```
git clone --filter=blob:none --no-checkout --depth 1 <url> .cache/source
git -C .cache/source sparse-checkout init --no-cone
```
Poi `.git/info/sparse-checkout` deve contenere **due** pattern:
```
/Tournaments/**/*[Pp]auper*.json
/Tournaments-Archive/**/*[Pp]auper*.json
```
Il secondo pattern è uno **scostamento dalla spec**: lo storico 2014–2022 sta in `Tournaments-Archive/`. Senza quella cartella i dati partono dal 2015-11, invece che dal 2014-05, e mancano circa 2.950 file.

Nell'albero tutti i file Pauper contengono `pauper` minuscolo o con l'iniziale maiuscola: il pattern li prende tutti (verificato con `git ls-tree`).

**Cartelle**:

| Cartella | Contenuto |
|---|---|
| `Tournaments/mtgo.com` | MTGO fino al 2024-06-19 |
| `Tournaments/mtgo.com_limited_data` | **Non è Limited**: è la continuazione di mtgo.com dal 2024-06-20, con League e Challenge fino a oggi. Contiene anche copie di alcuni tornei melee.gg e CardsRealm. |
| `Tournaments/melee.gg`, `CardsRealm`, `topdeck.gg`, `manatraders.com` | Tornei cartacei e online di terze parti |
| `Tournaments-Archive/magic.wizards.com` | 2014-05 – 2022 |
| `Tournaments-Archive/mtgo.com_before_new_data_model` | 2015 – 2023 |
| `Tournaments-Archive/melee.gg_manual_scraping` | 2022 – 2023 |

**Selezione**:
- `pauper` nel nome del file, senza distinzione di maiuscole;
- esclusione di cube, limited, draft, sealed e 2HG **solo sul nome del file**, mai sul percorso.

**Schema JSON** (uguale in tutte le cartelle):
```
{ Tournament: { Date, Name, Uri, [Formats], [Id, JsonFile, ForceRedownload] },
  Decks: [ { Date, Player, Result, AnchorUri, Mainboard: [{Count, CardName}], Sideboard: [...] } ],
  Rounds, Standings, [Bracket] }
```
- `Tournament.Date` ha quattro formati: `YYYY-MM-DD`, `…THH:MM:SS`, `…Z`, `…+HH:MM`.
- `Deck.Date` è `null` in circa 26.500 mazzi: in quel caso si usa `Tournament.Date`.
- 239 mazzi hanno il Mainboard vuoto.

**Duplicati**:
- Le cartelle di archivio replicano gli stessi tornei MTGO, e `mtgo.com_limited_data` replica alcuni tornei di melee.gg e CardsRealm.
- Lo stesso `Uri` **non** basta come chiave. I tornei a squadre hanno un file per posto con lo stesso Uri e mazzi diversi, e alcune League MTGO o eventi melee ricorrenti riusano l'Uri con contenuti diversi.
- Regola di deduplica: vedi le decisioni in sospeso.

## Scryfall (verificato in Fase 0)

- `GET https://api.scryfall.com/bulk-data` con User-Agent descrittivo e `Accept: application/json`.
- Ogni voce ha `type`, `updated_at`, `jsonl_download_uri` e `compressed_size`. **Non** ci sono più `download_uri` né `size`.
- I file sono **JSONL compressi con gzip** (un oggetto per riga): si leggono in streaming con `gzip` e `json` della libreria standard, senza `ijson`.

| File | Compresso | Contenuto | Tempo di parsing |
|---|---|---|---|
| `oracle_cards` | 25 MB | 38.706 carte | circa 3 s |
| `default_cards` | 79 MB | 118.587 printing | circa 6 s |
| `all_cards` | 395 MB | tutte le lingue | non usato |

- In `default_cards`, 83 printing non hanno `oracle_id` al livello principale (reversible card: l'id sta in `card_faces`).

## Decisioni prese

- Ancora delle finestre temporali (61, 365, 730 giorni, storico): la data dell'ultimo torneo, non la data di oggi.
- Copie tipiche: mediana per ogni finestra.
- Statistiche separate per main e per main più side.
- Report dei non risolti in `data/reviews/unresolved.csv`, invece di `data/review/`.
- Fuzzy match committati in `data/manual/fuzzy_matches.csv`.
- Nomi in altre lingue risolti con l'API search `lang:any` e una cache, senza scaricare `all_cards`.
- `printings.json` con gli UUID completi: la stima è di 0,41 MB con gzip sulle carte della baseline, quindi non serve troncarli.
- Prototipo:
  - sostituire `window.claude.use('downloads')` con un download Blob;
  - niente Google Fonts (servire il font dal sito o usare quello di sistema);
  - IndexedDB al posto di `localStorage`;
  - i ruoli diventano "mie carte" e "ignora".
- Set d'ingresso: prima printing `rarity == common` con `games` che contiene `paper` o `mtgo`, esclusi i `set_type` memorabilia e token. Si raggruppa per `parent_set_code`, da valutare sull'elenco reale.

## Decisioni in sospeso

- Regola di deduplica dei tornei e dei mazzi tra cartelle: proposta nel report della Fase 0.
