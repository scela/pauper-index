# CLAUDE.md — Pauper Index

## Scopo

Web app statica: tra le carte giocate in Pauper, quali possiedo (in qualsiasi printing) nella mia collezione ManaBox?
- **Pipeline** Python (GitHub Actions): lista delle carte giocate, con statistiche e legalità, chiave `oracle_id` Scryfall.
- **Frontend** statico (Vite + TS): legge nel browser l'export CSV di ManaBox e lo confronta con la lista.

La specifica completa è in `docs/SPEC.md`. Questo file registra le decisioni prese e gli scostamenti dalla spec: **tienilo aggiornato**.

**Nome**: il sito si chiama **Pauper Index** (la spec usava il nome provvisorio "Ce l'ho? Pauper"). Il repository GitHub si chiamerà `pauper-index`. Gli identificatori seguono il nome:
- pacchetto Python `pauper_index` (`python -m pauper_index …`);
- pacchetto npm `pauper-index-web`;
- database IndexedDB `pauper-index` e chiavi localStorage `pauper-index:`;
- User-Agent `PauperIndex/0.1`;
- variabili d'ambiente `PAUPER_INDEX_*`.

## Stato attuale (2026-10-07)

- **Online**: sito https://pauperindex.com (dominio personalizzato; www e il vecchio https://scela.github.io/pauper-index/ reindirizzano lì), repository pubblico https://github.com/scela/pauper-index. Aggiornamento automatico ogni giorno alle 07:23 UTC, più l'avvio manuale (Actions → "Aggiorna e pubblica" → Run workflow).
- **Fasi**:
  - [x] Fase 0: setup e ispezione dei formati
  - [x] Fase 1: pipeline in locale, test, confronto con la baseline
  - [x] Fase 2: frontend (con il layout rivisto dopo la fase)
  - [x] Fase 3: GitHub Actions, deploy su Pages, keepalive, allarmi
  - [ ] Fase 4: rifinitura e README completo
- **Funzioni aggiunte dopo la Fase 3** (una alla volta, con approvazione dopo ciascuna):
  - [x] Funzione 1: interfaccia in italiano e inglese (vedi "Lingue")
  - [x] Funzione 2: controllo rapido di una carta (vedi "Controllo rapido")
  - [x] Funzione 3: filtro per espansione (vedi "Filtro per espansione")
  - [x] "Carica altri" (10 carte alla volta) e "Rispolvera una carta" (vedi le sezioni omonime), prima della funzione 4
  - [x] 2026-10-07: simboli delle espansioni (vedi "Simboli delle espansioni"), stampa del set nella vista per espansione e "Rispolvera" spostata nella pagina "Carta dimenticata"
  - [x] 2026-10-07: riepiloghi coerenti con l'elenco (vedi "Riepiloghi ed elenco") e pulsante "Rispolvera una carta" in rilievo, con le ragnatele
  - [x] 2026-10-07: "Carta dimenticata" in testata come pulsante compatto (vedi "Testata")
  - [x] 2026-10-07: nome "Pauper Index" in New Rocker, scelto dall'utente (vedi "Testata")
  - [ ] Ragnatele realistiche (scena, pulsante grande, testata) e carta in 3D: 3 stili proposti in `.cache/screenshots/ragnatele-confronto.png` (A polverosa a strati, B filo sottile, C groviglio; prototipo in `.cache/cobweb/`), **in attesa della scelta dell'utente**; la carta in 3D si fa dopo
  - [ ] Funzione 4: mazzi che puoi costruire (vedi "Prossimi passi")
- **Opzioni tolte su richiesta**: "Escludi terre base" (le terre base sono sempre escluse) e "Conta le copie" (una carta è posseduta se ne hai almeno una copia).
- **Test** (tutti verdi dopo il link della testata alla pagina principale, 2026-10-07): 96 pytest, 58 Vitest, 90 Playwright (più 2 saltati di proposito) sui quattro progetti desktop/mobile × IT/EN.
- **Dependabot**: unita la PR #1 (pytest 8.4.2 → 9.1.1), con tutti i test verdi.
- **Issue**: #4 (test intermittente in CI) chiusa con la correzione del blur nei campi con suggerimenti.

## Prossimi passi

In quest'ordine, ciascuno **solo dopo il via dell'utente**, fermandosi alla fine con un report:

1. ~~Donazioni~~, ~~dominio personalizzato~~ e ~~logo~~: fatti il 2026-10-06 (vedi "Logo", "Donazioni" e "Dominio").
2. **Funzione 4, "Mazzi che puoi costruire"** (richiesta dell'utente, da implementare **dopo aver spiegato la soluzione scelta per gli archetipi** e aver avuto l'approvazione):
   - **Dati**: decklist degli ultimi 61 giorni, con un'opzione per periodi più lunghi se le dimensioni lo permettono. Nessun nome di giocatore. Le liste identiche si uniscono, mostrando quante volte compaiono. Si caricano solo quando si apre la sezione; vanno misurate le dimensioni.
   - **Archetipi**: la fonte non li indica. Valutare se esiste una classificazione open source degli archetipi Pauper con licenza compatibile; altrimenti raggruppare i mazzi simili tramite le carte più caratteristiche, e usare quelle carte come nome provvisorio del gruppo.
   - **Completamento**: percentuale delle carte del mazzo possedute, tenendo conto delle copie (per ogni carta il minimo tra copie possedute e richieste). Le terre base normali sono escluse dal calcolo e sempre disponibili. Opzione solo main / main più side.
   - **Visualizzazione**: elenco ordinato per completamento, con percentuale, carte mancanti con quantità, data, torneo, piazzamento e link al torneo; filtro per completamento minimo.
   - **Export**: carte mancanti in formato "1 Nome" (lista acquisti) e decklist completa in testo importabile in ManaBox.
   - **Calcolo nel browser**; se è pesante, in un web worker (oggi la CSP ha `worker-src 'none'`: va aperta a `'self'`).
   - Testi in IT e EN.
3. **Fase 4**: rifinitura e README completo.

Idee per dopo, non pianificate: `docs/IDEE.md`.

## Regole di lavoro (decise dall'utente)

**Privacy**:
- `reference/private/` contiene dati personali (export ManaBox reali): si apre **solo** per capire il formato dell'export e per i test in locale. Nessun suo contenuto finisce in file committati, fixture comprese: le fixture sono sintetiche. I test locali (`web/tests/private.test.ts`) stampano solo conteggi.
- Prima di ogni push che aggiunge file: nessun file di `reference/private/` e nessuna riga dei file privati nei commit.
- Mai i nomi dei giocatori (`Player`) né `AnchorUri` negli output.
- Email dei commit: solo l'indirizzo noreply (vedi "Repository e privacy dei commit").

**Cartelle**: non cercare né aprire file fuori dalla cartella del progetto (Desktop, Download o altre cartelle personali). Se manca un file, si chiede all'utente. I file temporanei vanno nello scratchpad della sessione o in `.cache/` (ignorata).

**Test**:
- Se un test fallisce perché il comportamento è cambiato **di proposito**, si può aggiornare il test.
- Se fallisce per un comportamento che **potrebbe essere un difetto**, si corregge il codice, non il test.
- Se non è chiaro quale dei due casi sia, ci si ferma e si chiede all'utente.
- In ogni report vanno elencati i test modificati, ciascuno con il motivo in una riga.

**Dependabot**: le sue Pull Request attivano il job `test` (evento `pull_request`: solo test, nessuna pubblicazione e nessuna Issue). Si controllano e si uniscono (squash) **solo se tutti i test passano**; nei report si dice cosa è stato unito.

**Modo di lavorare**: una fase o una funzione alla volta; alla fine ci si ferma con un report (cosa è stato fatto, test modificati, PR unite, cosa verificare). Ogni testo nuovo dell'interfaccia va in IT e in EN.

## Struttura

```
docs/SPEC.md            specifica dell'utente (non modificarla)
docs/IDEE.md            idee da valutare dopo la prima versione
reference/              prototipo (ce-lho.html) e script (pauper_sync.py) da cui si è partiti
reference/private/      export ManaBox personali: IGNORATA da git, non copiarne mai il contenuto
baseline/               pauper-2026-09-14.csv: List ManaBox della ricerca precedente (carte giocate negli ultimi 12 mesi), committata
pipeline/               pacchetto Python pauper_index e test
data/                   output committati, letti dal frontend; data/manual/ contiene i file curati a mano
web/                    frontend (Vite + TypeScript)
.github/                workflow aggiorna.yml, dependabot.yml, keepalive.txt
.cache/                 IGNORATA: clone della fonte, bulk Scryfall, cache HTTP, screenshot
```

**File principali**:
- Pipeline (`pipeline/src/pauper_index/`): `cli.py` (comandi), `build.py` (orchestrazione), `source.py` (fonte e classificazione), `dedup.py`, `resolve.py` (nomi → carte), `carddb.py` (Scryfall, indice dei nomi, set d'ingresso), `stats.py`, `outputs.py` (JSON per il sito), `sets.py`, `seticons.py` (simboli delle espansioni), `review.py` (revisioni, snapshot, allarme), `scryfall.py` (client con limiti di frequenza), `config.py`.
- Frontend (`web/src/`): `main.ts` (stato, eventi, rendering), `lib/` (logica pura e testata: `compare`, `view` (filtri dell'elenco e nota del riepilogo), `data`, `csv`, `text`, `quick`, `sets`, `exports`, `format`, `store`, `norm`, `dom`), `ui/` (`sheet` scheda e ventaglio, `about` Informazioni, `quick` controllo rapido, `setpicker` espansione, `seticon` simboli dei set, `dust` pagina "Carta dimenticata"), `i18n/` (`it.ts`, `en.ts`, `index.ts`), `style.css`; `index.html`; `vite.config.ts` (dati pubblicati e CSP).
- Test: `pipeline/tests/`, `web/tests/` (Vitest), `web/e2e/smoke.spec.ts` (Playwright).
- Automazione: `.github/workflows/aggiorna.yml`.
- Documentazione: questo file, `README.md` (avvio manuale, file manuali, comandi locali), `docs/IDEE.md`.

## Ambiente e comandi

Sviluppo su Windows 11 (PowerShell, Git for Windows); la CI gira su Ubuntu.
- **Python 3.14** sia in locale sia in CI (stessa versione minore). Su Windows usa `python` o `py`: `python3` apre lo stub del Microsoft Store.
- Node 24.

```powershell
# Pipeline (dalla radice del repo)
python -m venv .venv; .\.venv\Scripts\Activate.ps1; pip install -e "pipeline[dev]"
.\.venv\Scripts\python -m pauper_index build      # aggiorna fonte e bulk, ricalcola, scrive data/
.\.venv\Scripts\python -m pauper_index review     # revisioni dei set scadute (--force SET, --today AAAA-MM-GG)
.\.venv\Scripts\python -m pauper_index alarm      # allarme "fonte ferma"
.\.venv\Scripts\python -m pauper_index changed    # cambiamenti significativi in data/ (usato dalla CI)
.\.venv\Scripts\python -m pauper_index sets       # report dei set d'ingresso
.\.venv\Scripts\python -m pauper_index baseline   # confronto con la baseline
#   build: --offline (niente rete, usa cache e fuzzy_matches.csv), --no-fetch (non aggiorna la fonte)
.\.venv\Scripts\python -m pytest pipeline; .\.venv\Scripts\ruff check pipeline

# Frontend (cartella web)
cd web; npm ci                       # lockfile: web/package-lock.json
npm run dev                          # sviluppo su http://localhost:5173 (senza CSP)
npm run build; npm run preview       # build di produzione con CSP su http://localhost:4173
npm test                             # Vitest (logica, sicurezza, i18n, test locali su reference/private)
npx playwright install chromium; npm run e2e   # Playwright sulla build: desktop e mobile, IT e EN
npm run screenshots                  # con preview attivo: schermate in .cache/screenshots/
npm run dust-frames                  # con preview attivo: fotogrammi dell'animazione "Rispolvera" in .cache/screenshots/
node scripts/feature-shots.mjs <etichetta>   # con preview attivo: espansioni e "Carta dimenticata", desktop/mobile/scuro
node scripts/dust-button-shots.mjs <etichetta>   # con preview attivo: pulsante "Rispolvera", desktop/mobile, chiaro/scuro
node scripts/header-shots.mjs <etichetta>        # con preview attivo: testata, desktop/mobile/mobile piccolo, chiaro/scuro, IT/EN, con focus
npm run icons                        # rigenera logo, favicon, icone PNG e og-image da logo/logo.svg

# Stato della CI
gh run list --workflow aggiorna.yml --limit 5; gh pr list
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
- esclusione di cube, limited, draft, sealed e 2HG **solo sul nome del file e come parola intera** (separata da `-`, `_`, spazio o punto), mai sul percorso. "pauper-1k-ticketpalooza-**cubecon**-dmv" è un torneo Pauper constructed giocato alla convention CubeCon (`Formats: "Pauper"`, 306 mazzi in due eventi) e non va escluso. Al 2026-10-05 nessun file viene escluso.

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
- Regola di deduplica: vedi "Deduplica" più sotto.

**Cosa contengono i dati MTGO** (verificato in Fase 1):
- **League**: da sempre solo le liste 5-0 (`Result` nella forma `5-0`); `Standings` è vuoto.
- **Challenge, dal 2024-06-20**: solo i primi 32 mazzi, anche quando gli iscritti erano di più (per esempio `Standings` con 67 righe e 32 mazzi). Prima, la mediana era di 64 mazzi per Challenge.

Quindi le percentuali MTGO recenti sovrastimano i mazzi vincenti. Va spiegato nella pagina Informazioni.

**Stato del progetto**: il README della fonte lo dichiara non più mantenuto attivamente (scraper melee.gg rotto dal 2025-03-19 secondo il README; nei fatti i file melee arrivano ancora). L'allarme "fonte ferma" è **prioritario**.

**`Result`**: due forme, `"Nth Place"` (`1st`, `2nd`, `3rd`, `9th`…) oppure il record `"W-L"` (League, `5-0`). Si normalizza in `{rank: N}` o `{record: "5-0"}`, e il valore grezzo si conserva se non corrisponde a nessuna delle due forme.

**Privacy**: `AnchorUri` contiene il nome del giocatore in tutti i link mtgo.com (`#deck_<giocatore>`) e in molti magic.wizards.com (`#<giocatore>_…`). Gli altri link (melee, moxfield, cardsrealm) puntano a pagine personali. **Non si salva mai `AnchorUri`**: solo `Tournament.Uri`.

**MTGO o cartaceo**: si classifica in base all'host di `Tournament.Uri`. `mtgo.com`, `magic.wizards.com` e `manatraders.com` (Manatraders Series, giocate su MTGO) contano come MTGO; tutto il resto conta come "cartaceo e altre piattaforme".

## Deduplica (approvata)

1. **File identici**: se due file hanno lo stesso multinsieme di mazzi (main e side), se ne tiene uno solo. Hanno la precedenza le cartelle attive, poi l'archivio.
2. **Stesso mazzo nello stesso giorno, con tolleranza di ±1 giorno**: si applica **solo dentro una famiglia di copie della stessa fonte**:
   - famiglia MTGO: `mtgo.com_limited_data` > `mtgo.com` > `mtgo.com_before_new_data_model` > `magic.wizards.com`;
   - famiglia melee: `melee.gg` > `melee.gg_manual_scraping`;
   - le altre cartelle sono famiglie a sé.

   Un file di `mtgo.com_limited_data` il cui `Tournament.Uri` non è mtgo.com (copie di melee o CardsRealm) appartiene alla famiglia del suo host.

   Un mazzo si scarta solo se lo stesso mazzo è già stato tenuto **da un'altra cartella della stessa famiglia**, entro ±1 giorno, e quel mazzo non è già stato abbinato a un altro mazzo della stessa cartella. In pratica vale il massimo per cartella, non la somma. **Mai tra fonti diverse.**

   I mazzi identici dentro lo stesso file sono giocatori diversi e si contano tutti.

   **Eccezione approvata in Fase 2: ±8 giorni** solo tra file **League** di `mtgo.com_before_new_data_model` e di `mtgo.com`. L'archivio data le League alla pubblicazione settimanale, da −6 a +8 giorni rispetto a mtgo.com.

   **Abbinamento transitivo**: quando un mazzo viene scartato, la sua data resta registrata sul mazzo tenuto. Una terza cartella può abbinarsi a quella data, con la tolleranza della propria coppia. Per esempio, la copia in magic.wizards.com si abbina entro ±1 giorno alla copia in before_new_data_model, che a sua volta si abbina entro ±8 giorni a mtgo.com.
3. **Log** in `data/reviews/dedup.json`: unioni per coppia di cartelle e per anno.

**Impatto** (fonte al 2026-10-04):

| | Tornei | Mazzi |
|---|---|---|
| Senza deduplica | 8.596 | 206.836 |
| Con deduplica | 7.062 | 155.432 |
| 12 mesi, senza deduplica | 1.221 | 33.999 |
| 12 mesi, con deduplica | 1.178 | 32.848 |

Le carte dei 12 mesi (3.084) non cambiano.

## Scryfall (verificato in Fase 0)

- `GET https://api.scryfall.com/bulk-data` con User-Agent descrittivo e `Accept: application/json`.
- **Limiti di frequenza** (scryfall.com/docs/api/rate-limits):
  - `/cards/search`, `/cards/named`, `/cards/random` e `/cards/collection`: **500 ms** tra una richiesta e l'altra; tutti gli altri endpoint: 100 ms. I 50–100 ms della spec valgono solo per i secondi.
  - Un 429 blocca l'accesso per 30 secondi, e insistere può portare al ban. Il client usa 550 ms per gli endpoint lenti; dopo un 429 aspetta 35 secondi e si arrende dopo due tentativi.
  - I file su `*.scryfall.io` (bulk e immagini) non hanno limiti di frequenza.
- **Regole d'uso dei dati**:
  - niente loghi Scryfall né endorsement implicito;
  - niente paywall;
  - non "ripubblicare o fare da proxy" ai dati senza aggiungere valore. Noi pubblichiamo solo il sottoinsieme che serve al confronto.
- Ogni voce ha `type`, `updated_at`, `jsonl_download_uri` e `compressed_size`. **Non** ci sono più `download_uri` né `size`.
- I file sono **JSONL compressi con gzip** (un oggetto per riga): si leggono in streaming con `gzip` e `json` della libreria standard, senza `ijson`.

| File | Compresso | Contenuto | Tempo di parsing |
|---|---|---|---|
| `oracle_cards` | 25 MB | 38.706 carte | circa 3 s |
| `default_cards` | 79 MB | 118.587 printing | circa 6 s |
| `all_cards` | 395 MB | tutte le lingue | non usato |

- In `default_cards`, 83 printing non hanno `oracle_id` al livello principale (reversible card: l'id sta in `card_faces`).
- **Nomi alternativi solo nelle printing**: le printing MTGO di OM1 hanno un `printed_name` diverso (per esempio "Darval, Whose Web Protects" = "Spider-Man, Web-Slinger"). L'indice dei nomi usa quindi anche `printed_name` e `flavor_name` di `default_cards`.
- **Layout `prepare`** (set SOS): la seconda faccia porta il nome di una carta esistente (per esempio "Harmonized Trio // Brainstorm"). Priorità nell'indice: nome completo di una carta giocabile > nome di una faccia > `printed_name`/`flavor_name`. Si escludono gli `art_series`.
- **Nomi in altre lingue**: `GET /cards/search?q=lang:any !"<nome>"` trova il nome stampato in qualsiasi lingua, anche senza accenti. Con le virgolette ma senza `!` non funziona.
- **Immagini**: `https://cards.scryfall.io/{small|normal|large}/{front|back}/{id[0]}/{id[1]}/{id}.jpg?{ts}`. Funzionano anche senza `?ts`, quindi l'URL si ricava dallo Scryfall ID di qualsiasi printing, anche di quelle non presenti in `default_cards` (lingue diverse).

## Pipeline: tempi

I comandi sono in "Ambiente e comandi". `sets` scrive `data/reviews/set-ingresso.md`, `baseline` scrive `data/reviews/baseline-2026-09-14.md`.

Tempi in locale: build offline circa 26 s; prima build online circa 90 s (circa 120 richieste Scryfall a 0,55 s, poi in cache).

## Output della pipeline (`data/`)

Tutti in UTF-8 con LF. I JSON lunghi hanno una riga per elemento, per avere diff leggibili.

**`cards.json`** (v2): `{v, anchor, w, tot, sets, t, yt, c}`
- `anchor`: data dell'ultimo mazzo; le finestre sono ancorate qui.
- `w`: `[61, 365, 730, 0]`, dove 0 = storico.
- `tot[i]`: `[mazzi, tornei]` della finestra i.
- `sets`: `{codice: [nome, uscita, set_type]}` dei set d'ingresso.
- `t`: tornei citati dalle ultime apparizioni, `[data, nome, Tournament.Uri, "m"|"p"]`.
- `c`: una carta per riga, ordinate per nome:
  - `o` oracle_id; `n` nome; `l` legalità `l|b|n`; `b` 1 se terra base; `e` set d'ingresso (solo per le carte legali o bannate);
  - `s[i]`: `0` oppure `[mazzi main+side, mazzi main, copie totali, mediana copie main+side, mediana copie main]`;
  - `f` / `z`: prima e ultima apparizione;
  - `lm` / `lp`: ultima apparizione MTGO e cartacea, `[indice in t, risultato (rank intero o "5-0"), copie main, copie side]`;
  - `r`: indice della printing di riferimento in `printings.json`;
  - `y` (v2, per "Rispolvera una carta"): mazzi per anno su tutto lo storico, `[primo anno, mazzi, …]` dal primo all'ultimo anno in cui è giocata (anni vuoti = 0).
- `yt` (v2): mazzi totali per anno, `[primo anno, mazzi, …]`; serve a calcolare la quota per anno. `y` e `yt` aggiungono circa 0,12 MB grezzi e **0,04 MB con gzip**.

**`printings.json`**: `{v, sets: {codice: [nome, uscita]}, artists: [...], p}`
- `p[i]`: printing della carta i di `cards.json`, nella forma `[scryfall_id, set, numero, indice artista, gruppo illustrazione, retro 0|1, rarità c|u|r|m|s|b, (lingua se non en)]` (versione 2: la rarità è stata aggiunta con il filtro per espansione).
- Il gruppo illustrazione numera gli `illustration_id` distinti della carta, e serve al ventaglio.
- **Scostamento dalla spec**: non è una mappa id → carta, perché il frontend se la costruisce da qui. Così gli UUID non sono duplicati e i dati per le immagini stanno in un solo file.
- URL delle immagini: `cards.scryfall.io/{small|normal|large}/{front|back}/{id[0]}/{id[1]}/{id}.jpg`.

**`names.json`**: `{nome normalizzato: indice carta}` (nome, facce, `printed_name`/`flavor_name`), senza le chiavi ambigue. La normalizzazione è `names.norm`; i vettori di prova sono in `pipeline/tests/fixtures/norm_vectors.json`.

**`allnames.json`** (aggiunto in Fase 2): array dei nomi normalizzati di **tutte** le carte giocabili, circa 36.000 voci (250 KB compressi). Il frontend lo scarica solo quando il testo incollato contiene righe senza Scryfall ID e non presenti nella lista. Così distingue "carta mai giocata in Pauper" da "nome non riconosciuto".

**`cardnames.json`** (aggiunto con la funzione 2): `[[nome, legalità l|b|n], …]` di tutte le carte giocabili in carta o su MTGO (escluse quelle solo Arena), ordinate per nome. Circa 33.800 voci, 246 KB compressi. Serve ai suggerimenti del controllo rapido; si scarica solo al primo uso del campo.

**`sets.json`** (aggiunto con la funzione 3): `[{c, n, d, t, p?, g?, i?}]`, cioè codice, nome, uscita, `set_type`, set padre, `g: 1` se solo digitale, `i` icona nello sprite (assente = il codice stesso; per esempio `"star"` per le icone condivise; `""` = nessuna icona). Contiene i set in cui è stampata almeno una carta giocata, più i loro set padre, dal più recente. Circa 500 set, **8 KB compressi**; si scarica al primo uso del filtro.

**`seticons.svg`** (aggiunto il 2026-10-07): sprite con un `<symbol id="nome" viewBox data-v>` per ogni icona dei set di `sets.json` (vedi "Simboli delle espansioni"). 333 icone, **285 KB grezzi, 102 KB con gzip**; si scarica solo quando si apre il selettore o si sceglie un'espansione.

**`meta.json`**: generazione, ultimo torneo, totali per finestra, date dei bulk, commit della fonte, stato (`ok`/`ferma`), deduplica, statistiche di risoluzione.

**`reviews/`** (non mostrato nel sito: contiene testo grezzo delle decklist):
- `unresolved.csv`, `risoluzione.csv` (ogni match non esatto, con il numero di mazzi);
- `dedup.json`;
- `set-ingresso.md`;
- `baseline-2026-09-14.md`.

**`manual/`**:
- `aliases.csv` (`sorgente,corretto`);
- `exclude.csv` (`nome,motivo`);
- `fuzzy_matches.csv`: esiti delle ricerche online, generato e committato. Si può correggere a mano: si cambia `esito` (`accettato` o altro) e la CI non rifà la ricerca.

**Dimensioni** (2026-10-05):

| File | Grezzo | gzip |
|---|---|---|
| `cards.json` | 1,38 MB (v2, con `y`) | 0,40 MB |
| `printings.json` | 1,46 MB | 0,70 MB |
| `names.json` | 0,13 MB | 0,05 MB |
| `seticons.svg` (2026-10-07) | 0,29 MB | 0,10 MB |

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
- **Set d'ingresso** (validato in Fase 1): prima printing con
  - `rarity == common`;
  - `games` che contiene `paper` o `mtgo`;
  - `released_at` ≤ oggi.

  Si escludono le printing di set `memorabilia` o `token`, con `border_color == silver` o con `security_stamp == acorn`. I set `funny` **non** si escludono in blocco: le common di Unfinity senza acorn sono legali. Il set d'ingresso si assegna solo alle carte che Scryfall dà legali o bannate; la legalità di Scryfall resta la fonte autorevole. Con questa regola nessuna carta legale resta senza set d'ingresso.
- **Set rilevanti e revisioni** (approvato in Fase 2):
  - **una revisione per gruppo di set**, raggruppati per `parent_set_code` (per esempio Spider-Man = om1 + spe + spm, Foundations = fdn + j25);
  - il gruppo è rilevante se rende Pauper-legali almeno 5 carte in totale;
  - il ritardo di 60 giorni si conta dalla **data di uscita del set principale** (il codice del gruppo).

- Ultima apparizione: due record separati, MTGO e cartaceo. Ognuno contiene data, nome del torneo, tipo di fonte, piazzamento normalizzato, copie in main e in side, `Tournament.Uri`. Mai `AnchorUri` né `Player`.

## Requisiti aggiuntivi (decisi dopo la Fase 0)

### Immagini delle carte (dati in Fase 1, interfaccia in Fase 2)
- **Miniature nei risultati**:
  - per le carte possedute: la printing posseduta, ricavata dallo Scryfall ID dell'export; se le printing possedute sono più di una, si mostrano tutte;
  - per le carte mancanti: la printing di riferimento.
- **Ventaglio** al passaggio del cursore, al tocco o con il focus da tastiera:
  - mostra le printing con artwork diversi, raggruppate per `illustration_id`;
  - se gli artwork sono più di 7, ne mostra 7 più un pulsante "Mostra tutte" che apre una griglia;
  - la carta attiva è sempre interamente visibile;
  - sotto la carta attiva: set, anno, numero di collezione, artista e ultima apparizione;
  - le printing possedute sono segnate con un bordo o un'etichetta.
- **Regole di Scryfall sulle immagini**:
  - non coprire né tagliare artista e copyright;
  - non deformare, non desaturare, non ricolorare: niente carte in grigio per quelle mancanti;
  - niente watermark.
- **Caricamento**: dal CDN `cards.scryfall.io`, formato `small` nella lista e `normal`/`large` nel ventaglio, sempre lazy. Per le bifronte si mostra il fronte, con la possibilità di girarla.
- **Dati salvati dalla pipeline** per le printing delle carte giocate: id, set, numero, `illustration_id`, data, artista, facce, percorso delle immagini. Si misurano le dimensioni; se crescono troppo, i dettagli delle printing si caricano solo quando servono.

### Legale e trasparenza (sito gratuito, usato anche da amici)
- **Pagina "Informazioni"**, raggiungibile da ogni schermata, con:
  - il testo **esatto** della Fan Content Policy di Wizards, letto da `company.wizards.com/en/legal/fancontentpolicy`;
  - la non affiliazione con Wizards, ManaBox e Scryfall;
  - i crediti (Scryfall, MTGODecklistCache e i siti di origine);
  - i limiti dei dati (vedi "Cosa contengono i dati MTGO") e la data dell'aggiornamento;
  - come segnalare un errore.
- **Nessun logo né simbolo** di Wizards (simboli di mana compresi), ManaBox o Scryfall. **Eccezione** (decisa dall'utente il 2026-10-07): i **simboli delle espansioni** sono ammessi solo come piccole icone per identificare i set (selettore "Espansione" e rarità nella vista per espansione). Restano esclusi simboli di mana, logo di Magic, logo di Wizards e retro delle carte; per questo la pipeline non usa le icone `planeswalker` (The List), `default` (la "M" generica di Magic) e `dci` (logo DCI).
- **Nota privacy**: nessun account, nessun cookie, nessuna analytics; la collezione resta nel browser; GitHub Pages può registrare dati tecnici di accesso; le immagini arrivano dai server di Scryfall.

### Sicurezza
- **Mai `innerHTML` con dati esterni** (CSV, nomi, report): si usa `textContent` o un escaping centralizzato. Va aggiunto un test con un CSV malevolo.
- **CSP con meta tag**:
  - nessuno script esterno;
  - `connect-src 'self'`;
  - `img-src 'self' https://cards.scryfall.io`;
  - font serviti dal sito stesso.
- Dipendenze npm e Python al minimo, con lockfile.
- Actions di terze parti fissate per SHA; Dependabot attivo.
- Permessi minimi nei workflow; nessun segreto.
- Pulsante **"Cancella i miei dati"**, che svuota IndexedDB e localStorage.
- Il report dei non risolti (testo grezzo delle decklist) **non va mostrato nel sito**.

### Uso da parte di altri
- Deve funzionare con l'export di qualsiasi utente ManaBox: singoli Binder o collezione intera, qualsiasi lingua, con messaggi chiari se il file non viene riconosciuto.
- Manifest per "Aggiungi a schermata Home".

### Ultima apparizione (dati in Fase 1, interfaccia in Fase 2)
- I dati sono descritti nelle decisioni prese.
- Interfaccia: l'ultima apparizione si mostra sotto la carta, nel ventaglio e nella scheda. Si può ordinare e filtrare per data (per esempio "non più vista da oltre 6 mesi").

Idee da valutare dopo la prima versione: `docs/IDEE.md`.

## Frontend (Fase 2)

**Layout** (rivisto su richiesta dopo la Fase 2: una sola funzione principale):
1. **In alto**: titolo, riga dei dati ("Dati al …", con l'avviso se la fonte è ferma) e area di caricamento (file CSV o testo incollato). Dopo il caricamento l'area diventa la riga "Collezione: N carte · Sostituisci". "Sostituisci" riapre l'area, e il caricamento successivo **rimpiazza** la collezione.
2. **Filtri** su una o due righe: periodo (menu con il numero di carte per periodo), minimo mazzi, espansione, solo legali, conta anche il side, ricerca. Ogni modifica aggiorna subito i risultati. Su mobile le opzioni stanno su una riga scorrevole.
   **Terre base** (Plains, Island, Swamp, Mountain, Forest, Wastes e le sei Snow-Covered, cioè le carte con flag `b` in `cards.json`): **sempre escluse** dalla lista e dai risultati, senza opzione nell'interfaccia (decisione dopo la Fase 2). Restano nei dati della pipeline: serviranno al calcolo dei mazzi costruibili, dove contano come sempre disponibili.
3. **Risultati**:
   - intestazione "Possiedi N carte giocate in Pauper";
   - di default **solo le carte possedute** (anche parziali), dalle più giocate;
   - prima del caricamento: tutte le carte del periodo;
   - colonne: carta (con le tue printing e i Binder sotto il nome), copie, mazzi, ultima apparizione, ingresso;
   - ordinamento e filtro delle date a destra dell'intestazione.
4. **In fondo, raccolto**: "Mostra anche le mancanti", "Esporta e copia", "Importazione: N righe, M non riconosciute" (con le righe espandibili), "Binder inclusi: X di Y · modifica" (ruoli Inclusa/Esclusa, proxy), "Novità", "Cancella i miei dati". Tutte le sezioni usano `<details>`.
5. **Piè di pagina**: una riga breve sulla Fan Content Policy con il link a Informazioni. Il testo **esatto** dell'avviso sta per esteso solo nella pagina Informazioni, che contiene anche "Come funziona" e la privacy (spostate dalla pagina principale).

Tolti: la barra a segmenti (heatmap), la sezione "Cosa conta", i preset a schede, gli avvisi ridondanti.

**Immagini**: se una miniatura non si carica (per esempio uno Scryfall ID sconosciuto), si usa la printing di riferimento (`data-fallback`).

**Screenshot di controllo**: `npm run screenshots` (con `npm run preview` attivo) salva in `.cache/screenshots/` le viste prima e dopo il caricamento, desktop e mobile. Di default usa la collezione sintetica; con `-- percorso.csv` usa un altro file.

**Struttura di `web/`** (Vite + TypeScript, nessun framework):
- `src/lib/`: logica pura e testata:
  - `norm` (porting esatto di `names.norm`);
  - `csv` (dal prototipo) e `text` (testo incollato);
  - `data` (caricamento e indici);
  - `compare` (abbinamento, definizione della lista, confronto);
  - `exports`, `format`, `store`;
  - `dom`: `h()`, l'unico modo di creare elementi; il testo passa sempre da `textContent`.
  - `quick` (controllo rapido) e `sets` (gruppi di set e rarità per set), aggiunti con le funzioni 2 e 3.
- `src/ui/`: `sheet` (scheda e ventaglio), `about` (Informazioni), `quick` e `setpicker` (campi con suggerimenti). `src/i18n/`: dizionari. `src/main.ts`: stato, eventi, rendering.
- `tests/`: Vitest. `private.test.ts` gira solo se trova `reference/private/esempio-testo.txt` e stampa solo conteggi. `e2e/`: Playwright, progetti desktop e "mobile" (iPhone 13 emulato su Chromium). `tests/fixtures/`: dati sintetici.
- `vite.config.ts`, con un plugin che:
  - in sviluppo serve `/data/*` da `../data`;
  - in build copia in `dist/data/` **solo** `cards`, `printings`, `names`, `allnames`, `cardnames`, `sets`, `seticons.svg`, `meta` e `reviews/index.json` (elenco `PUBLIC_DATA`). I report interni (`unresolved.csv`, `risoluzione.csv`, `dedup.json`, `set-ingresso.md`, `baseline-*.md`, `reviews/<set>.*`) restano fuori dal sito. **Un nuovo file di dati va aggiunto a `PUBLIC_DATA`**, altrimenti nel sito dà 404 (è successo con `sets.json`);
  - inietta la CSP (meta tag) **solo in build**, perché il dev server di Vite usa stili inline.

**Decisioni**:
- **Font di sistema** al posto di Geist: nessuna richiesta esterna. Unica eccezione (2026-10-07): il nome "Pauper Index" in New Rocker ridotto, servito dal sito (vedi "Testata").
- **CSP**: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://cards.scryfall.io data:; connect-src 'self'; font-src 'self'; manifest-src 'self'; worker-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'`. `<meta name="referrer" content="no-referrer">`, così le richieste di immagini a Scryfall non rivelano la pagina.
- **Ruoli dei gruppi**: solo "Inclusa" o "Esclusa" (in "Binder inclusi"). Binder di tipo `deck` o `list` sono esclusi di default; il testo incollato è un gruppo "Testo incollato" che conta come posseduto.
- **Abbinamento di una riga**:
  1. Scryfall ID (`printings.json`);
  2. set + numero;
  3. nome (`names.json`, poi faccia frontale, poi `A/B` → `A // B`).

  Le righe con uno Scryfall ID sconosciuto (printing in altre lingue) si abbinano per nome, ma la miniatura usa il loro ID.
- **Riepilogo dell'importazione**: righe lette, carte della lista, carte mai giocate in Pauper (Scryfall ID o nome in `allnames.json`), righe non riconosciute (elencate), righe senza set e numero (immagine di riferimento, segnalata anche nella scheda).
- **"Conta le copie"**: opzione **tolta** su richiesta dell'utente (dopo la funzione 2). Una carta è posseduta se ne hai almeno una copia; export "1 Nome" e List riallineata con quantità 1. Le copie tipiche (mediana) restano solo come informazione, nella scheda e nel controllo rapido.
- **Ventaglio**: un artwork per `illustration_id`, preferendo la printing posseduta, poi la più recente in inglese. Al massimo 7, più "Mostra tutte" che apre una griglia in un `<dialog>`. Le carte sono **distanziate e ruotate di pochi gradi, senza sovrapporsi**, per non coprire artista e copyright (regole di Scryfall). La carta attiva è mostrata intera e più grande.
- **Persistenza**: IndexedDB (database `pauper-index`) per la collezione; localStorage solo per tema, ordinamento e filtro, con prefisso `pauper-index:`. "Cancella i miei dati" elimina il database e **solo** le chiavi `pauper-index:`: su GitHub Pages l'origine è condivisa con gli altri siti dello stesso utente, quindi niente `localStorage.clear()`.
- **Tabella**: 10 righe alla volta (vedi "Carica altri"). Ordinamento per percentuale di mazzi, nome, ultima apparizione (recente o meno recente). Filtro "viste negli ultimi 6 mesi / non viste da oltre 6 mesi", rispetto alla data dei dati.
- **Segnalare un errore**: link `mailto:massadalbe@hotmail.com` nella pagina Informazioni (`REPORT_EMAIL` in `web/src/ui/about.ts`).
- **Icone**: generate da `logo/logo.svg` con `npm run icons` e committate (vedi "Logo"). Nessun simbolo di Wizards.

## Automazione e pubblicazione (Fase 3)

**Workflow** `.github/workflows/aggiorna.yml`, uno solo con quattro job:
- `test`: a ogni push su `main` (pipeline, web, data, workflow): pytest, ruff, Vitest, build, Playwright.
- `update`: **ogni giorno alle 07:23 UTC** e con avvio manuale (`workflow_dispatch`, campo `forza_revisione`). Passi:
  1. `build` (ricalcolo completo; il clone della fonte resta in `actions/cache`);
  2. `review`;
  3. `alarm`;
  4. commit solo se `changed` trova cambiamenti significativi;
  5. Issue per revisioni e allarmi;
  6. keepalive.
- `deploy`: dopo `test` o `update`; build di `web/` da `main` e pubblicazione su GitHub Pages (HTTPS obbligatorio).
- `notify`: se un job fallisce apre una Issue assegnata al proprietario, che riceve l'email. In più GitHub manda la sua email di "workflow failed" a chi ha creato il workflow programmato.

**Runner**: `ubuntu-26.04` esplicito su tutti i job (dal 2026-10-07). `ubuntu-latest` passa a Ubuntu 26 tra il 19 ottobre e il 19 novembre 2026, a scaglioni; l'etichetta esplicita evita esecuzioni miste. Prima del cambio i job `test` e `update` sono stati provati su `ubuntu-26.04` con un workflow temporaneo su un ramo (Ubuntu 26.04.1 LTS: 96 pytest, Vitest, build, 90 Playwright, build completa dei dati; ramo poi cancellato).

**Regole**:
- Actions fissate per SHA, aggiornate da Dependabot (`.github/dependabot.yml`: Actions, npm, pip).
- Permessi minimi per job; `permissions: {}` a livello di workflow. Nessun segreto oltre a `GITHUB_TOKEN`.
- I commit fatti con `GITHUB_TOKEN` non avviano altri workflow: per questo `deploy` è nello stesso workflow di `update`.
- **`changed`** (`python -m pauper_index changed`): ignora i campi volatili di `meta.json` (`generated_at`, `source.commit`, `source.commit_date`, `source.days_since_last_tournament`). Se cambiano solo quelli, ripristina il file e non fa commit. Quindi `generated_at` nel sito è la data dell'**ultimo cambiamento dei dati**.
- **Allarme "fonte ferma"**: `alarm` gira ogni giorno, anche senza dati nuovi. Se l'ultimo torneo è più vecchio di 21 giorni apre la Issue "Fonte dati ferma", con i fork di MTGODecklistCache aggiornati di recente, ma solo se non ce n'è già una aperta. Il sito calcola l'avviso anche da solo, dalla data dell'ultimo torneo, perché senza dati nuovi non c'è un nuovo commit.
- **Workflow programmati nei repository pubblici**: GitHub li disattiva dopo 60 giorni senza attività nel repository (docs "Disabling and enabling a workflow"; cosa conti come attività non è specificato). Due difese:
  1. a ogni esecuzione `gh api -X PUT …/actions/workflows/aggiorna.yml/enable`;
  2. se l'ultimo commit su `main` ha almeno 45 giorni, commit di `.github/keepalive.txt`.

**Revisioni** (`pauper_index/review.py`, `python -m pauper_index review [--force SET]`):
- Al primo avvio crea lo snapshot di partenza (`data/snapshots/2026-10-05.json`) e `data/reviews/state.json` (`baseline`, `done`). I gruppi già scaduti prima della partenza non si recuperano.
- Un gruppo (`parent_set_code`) con almeno 5 carte Pauper-legali entrate si rivede quando oggi ≥ uscita del set principale + 60 giorni. Il prossimo: The Hobbit (HOB), dal 2026-10-13.
- Ogni revisione scrive `data/reviews/<set>.json` e `.md` (report completo, con i nuovi nomi non risolti), aggiorna `data/reviews/index.json` (pubblico, **senza** nomi grezzi) e crea un nuovo snapshot. Il report va anche in una Issue.
- Definizione di default per i confronti: ultimo anno, almeno 1 mazzo, legale oggi, terre base escluse.
- Nel sito si pubblica dalla cartella reviews **solo** `index.json`.

## Lingue (funzione 1, dopo la Fase 3)

- **Dizionari** in `web/src/i18n/`:
  - `it.ts` è la fonte delle chiavi;
  - `en.ts` è tipizzato `Record<Key, Msg>`, quindi chiavi mancanti o in più fanno fallire la build;
  - segnaposto `{nome}`; plurali `{ one, other }` scelti con `Intl.PluralRules`.
- **Regola**: ogni nuovo testo dell'interfaccia (anche errori, riepiloghi, aria-label, nomi dei file di export) va **in entrambi i dizionari**. Mai stringhe visibili scritte nel codice. Le nuove funzioni nascono già in IT e EN.
- **Funzioni**: `t(key, vars)` per la lingua corrente; `translate(lang, key, vars)` (usata anche dai test); `tNodes()` per testi con link al posto di un segnaposto.
- **Formattazione**: `fmtDate` / `fmtInt` / `fmtPct` / `fmtResult` usano `Intl` con `it-IT` o `en-US`. Le date sono in UTC, così il fuso del browser non sposta il giorno. I piazzamenti sono "3°" in italiano e "3rd" in inglese.
- **Lingua iniziale**:
  1. `localStorage` `pauper-index:lang`;
  2. altrimenti italiano se una delle lingue del browser è `it*`;
  3. altrimenti inglese.

  Il selettore IT/EN è in testata (`aria-pressed`). "Cancella i miei dati" cancella anche la scelta.
- **Testi statici** di `index.html`: attributi `data-i18n` (testo), `data-i18n-ph` (placeholder), `data-i18n-aria`, `data-i18n-title`, `data-i18n-content` (meta description). Nelle etichette con campi il testo sta in uno `<span>`.
- **Etichette delle celle su mobile**: `data-label` tradotto, mostrato con `content: attr(data-label)`. Niente testi nel CSS.
- **I nomi delle carte restano in inglese**, come su Scryfall. Il gruppo "Testo incollato" si traduce quando viene mostrato (`source === '__pasted__'`).
- **Avviso Fan Content Policy**: il testo ufficiale inglese (`#fcp`, `lang="en"`) è uguale nelle due lingue e compare una sola volta, in fondo alla pagina Informazioni; in italiano c'è solo una riga di sintesi. Il piè di pagina delle altre viste ha una riga breve per lingua.
- **Novità**: le revisioni hanno titoli ed elenchi tradotti. Il `sommario` generato dalla pipeline è in italiano e si mostra solo in italiano.
- **Test**:
  - `tests/i18n.test.ts`: stesse chiavi, nessun testo vuoto, stessi segnaposto, formattazione, scelta della lingua;
  - Playwright con quattro progetti (`desktop-it`, `desktop-en`, `mobile-it`, `mobile-en`, scelti con `locale`), con i testi attesi presi dagli stessi dizionari.

## "Carica altri" (prima della funzione 4)

- Ogni elenco di carte mostra **10 carte** (`PAGE` in `main.ts`); sotto, "Mostrate N di M" (`#shownCount`, `res.shown`) e il pulsante "Carica altri" (`#more`, `res.loadMore`), che ne aggiunge altre 10. Vale per la vista collezione, la vista per espansione e le mancanti; varrà anche per i mazzi della funzione 4.
- Ordinamento, filtri, ricerca, riepiloghi ed export lavorano sempre sulla lista completa (`S.results` / `S.view`); ogni cambio di filtro, ordinamento o ricerca riparte da 10.
- Dopo "Carica altri" il focus va sulla prima carta aggiunta, **senza** aprire la scheda (`focusNoSheet`).

## Rispolvera una carta: pagina "Carta dimenticata" (riprogettata il 2026-10-07)

- **Pagina a sé** (`#viewDust`, hash `#carta-dimenticata`), raggiungibile dalla testata con la voce "Carta dimenticata" / "Forgotten card" (`#navDust`, prima di Informazioni; `aria-current="page"` sulla voce attiva). Non è più nella zona del controllo rapido. Contiene:
  - il titolo e la frase "Riscopri una carta che si giocava in Pauper ma che non compare in nessun mazzo da oltre un anno" (`dust.lead`);
  - il pulsante grande "Rispolvera una carta" / "Dust off a card" (`#dustBtn`), che dopo la prima pesca diventa "Rispolverane un'altra"; sotto, solo con la collezione, l'interruttore "Pesca tra tutte le carte" (`#dustAll`);
  - la **scena** (`#dustResult .dust-scene`), con la carta al centro e i dettagli accanto (sotto su mobile).
- **Pulsante** (rifatto il 2026-10-07, perché la scritta non sembrava da premere):
  - pieno di colore (sfumatura dell'accento), in rilievo (bordo inferiore `--btn-ledge` che si abbassa alla pressione), alto 68 px (72 px e largo quanto lo schermo su mobile), testo 1,25 rem;
  - icona originale di un piumino (manico, ghiera, tre piume), che oscilla al passaggio del mouse;
  - tre **ragnatele originali** agli angoli (`buttonWeb` in `ui/dust.ts`, SVG generato a caso, fili `--btn-web`: bianchi in tema chiaro, scuri in tema scuro). Al passaggio del mouse oscillano; alla pressione vengono spazzate via (classe `sweep`, 320 ms) **prima** che parta la pesca e l'animazione della carta, e si riformano dopo (classe `regrow`);
  - focus da tastiera: contorno di 3 px nel colore del testo, staccato di 5 px. Contrasto del testo: 6,4:1 in chiaro, 7,8:1 in scuro;
  - con `prefers-reduced-motion` niente movimento: le ragnatele restano ferme e la pesca parte subito.
- Prima della pesca la scena mostra una **cornice vuota** (`button.dust-empty`, nessuna immagine né retro di carta) con polvere e ragnatele ferme (`dustCover(true)`, classe `still`, visibile anche con `prefers-reduced-motion`) e la scritta "Tocca per rispolverare": anche la cornice si tocca per pescare.
- Logica in `lib/dust.ts` (testata), interfaccia e animazione in `ui/dust.ts`.
- **Carte ammesse** (`dustPool`): legali oggi, non terre base, almeno `DUST_MIN_DECKS = 20` mazzi (main+side) nello storico, nessuna apparizione negli ultimi `DUST_QUIET_DAYS = 365` giorni contati dalla data dei dati. Al 2026-10-06: **203 carte**.
- **Pesca**: con la collezione tra le carte possedute (interruttore "Pesca tra tutte le carte"); senza collezione tra tutte. Nessuna ripetizione nella sessione (oracle_id in sessionStorage `pauper-index:dusted`, cancellato anche da "Cancella i miei dati"); quando sono finite si ricomincia, con un avviso. Se nessuna carta posseduta è dimenticata, la scena lo dice (prima, al primo clic non compariva nulla: corretto).
- **Dettagli**: immagine (la printing posseduta, altrimenti quella di riferimento; un clic apre gli artwork), mazzi nello storico tra prima e ultima apparizione, **anno di massima diffusione** in percentuale dei mazzi di quell'anno (`y` / `yt`), ultima apparizione più recente tra MTGO e cartaceo con il link al torneo, possesso. Tolti i pulsanti "Chiudi" e "Rispolverane un'altra" dentro il risultato, perché c'è il pulsante grande.
- **Animazione** (circa 1,5 s, invariata): copertura `.dust-cover` con velo di polvere (rumore SVG), granelli, fiocchi e tre ragnatele generate a caso, spazzati via con una maschera diagonale. Solo elementi sovrapposti: l'immagine non ha mai filtri (regole di Scryfall); a fine animazione la copertura viene rimossa. Parte quando l'immagine è caricata. Con `prefers-reduced-motion` nessuna copertura sulla carta. CSP invariata: i valori casuali passano da `style.setProperty`.
- Fotogrammi di controllo: `npm run dust-frames` (desktop e mobile, 5 istanti più la fine, dalla pagina `#carta-dimenticata`).

## Testata (2026-10-07)

- **"Carta dimenticata"** (`#navDust`, classe `navdust`) è un pulsante compatto nello stile del pulsante grande della pagina:
  - pieno di colore, in rilievo (`--btn-ledge`), con l'icona del piumino e una piccola ragnatela fissa nell'angolo in alto a destra (`.nd-web`), che oscilla al passaggio del mouse;
  - sulla propria pagina appare premuto (`aria-current="page"`);
  - focus: contorno di 3 px nel colore del testo;
  - con `prefers-reduced-motion` niente movimento.
- Nome accessibile da `aria-label` (`nav.dust`). Fino a 400 px di larghezza compare l'etichetta breve (`nav.dustShort`: "Dimenticata" / "Forgotten") al posto di quella piena.
- **Logo e nome** (`#home`, `href="/"`, nome accessibile `nav.home`: "Pauper Index, pagina principale" / "Pauper Index, home page"): da qualsiasi sezione (Informazioni, Carta dimenticata, in futuro Mazzi) e dalla pagina principale stessa **ricaricano** la pagina principale. La collezione si ripristina da IndexedDB; prima di navigare si azzera "Ultima apparizione" (`pauper-index:seen`), l'unico filtro dell'elenco ricordato nel browser, mentre ricerca e "Solo quelle che possiedi" ripartono comunque azzerati. Aspetto invariato: manina, leggera trasparenza e logo appena ruotato al passaggio del mouse (fermo con `prefers-reduced-motion`), contorno di focus di 3 px.
- **"Informazioni"** (`.navlink`) è un link discreto: colore attenuato, sottolineato solo al passaggio del mouse o sulla propria pagina.
- **Font del nome: New Rocker** (scelto dall'utente il 2026-10-07 tra Grenze Gotisch, Fruktur, Pirata One, Metal Mania, New Rocker e Germania One; scartati i due Unifraktur, dove la "I" diventa "J").
  - Usato **solo** per "Pauper Index" nel titolo della testata (`h1 .brand`) e nell'og-image; il resto del sito resta nel font di sistema.
  - **Licenza**: SIL OFL 1.1 con Reserved Font Name "New Rocker". La versione ridotta è una "Modified Version", quindi il suo nome interno è **"Pauper Index Title"** (anche in CSS) e "New Rocker" compare solo in copyright e licenza. Testo della licenza in `web/public/fonts/OFL-NewRocker.txt`, pubblicato anche nel sito accanto al font.
  - **File**: `web/public/fonts/pauper-index-title.woff2`, 7,6 KB, con i soli glifi di "Pauper Index" (11, più `.notdef`). Il grosso del peso è il testo della licenza, lasciato dentro il font. Servito dal sito con `font-display: swap` e `<link rel="preload">`; CSP invariata (`font-src 'self'`).
  - **Rigenerare** (solo se cambia il testo del titolo): `web/scripts/title-font.py` con fonttools in un ambiente virtuale temporaneo (fonttools non è una dipendenza del progetto); sorgente `NewRocker-Regular.ttf` dal repository google/fonts. Il testo da coprire è la costante `TEXT`: un carattere nuovo nel titolo non sarebbe coperto.
  - **og-image**: `npm run icons` carica lo stesso file con `FontFace` per disegnare "Pauper Index"; "pauperindex.com" resta nel font di sistema.

## Riepiloghi ed elenco (2026-10-07)

- **Regola**: ogni riepilogo conta esattamente l'insieme che l'elenco può mostrare; se i filtri dell'elenco ne mostrano un altro, lo si dice.
- **Difetto corretto**: con Edge of Eternities, periodo "Storico" e "Non viste da oltre 6 mesi" il titolo diceva 69 carte e l'elenco ne mostrava 13. Il titolo conta `S.results` (periodo, minimo mazzi, solo legali, side, gruppo di set con i set nascosti se attivati), mentre l'elenco applicava dopo altri filtri che il titolo ignorava: ricerca, "Ultima apparizione" (ricordata nel browser tra una visita e l'altra) e "Solo quelle che possiedi". Gruppo di set e set nascosti erano già contati allo stesso modo in titolo ed elenco.
- **Ora** (`lib/view.ts`): `restrictToSet` e `visible` sono la sola catena di filtri, usata dall'elenco; `shownNote(titolo, elenco)` confronta i due insiemi. Se sono diversi, sotto il titolo compare `#filterNote`: "13 mostrate con i filtri attivi: non viste da oltre 6 mesi" (motivi: ricerca, ultima apparizione, solo quelle che possiedi, comprese le mancanti), con "Togli questi filtri", che azzera ricerca, ultima apparizione e "Solo quelle che possiedi".
- Insieme del titolo: nella vista collezione le carte possedute ("Possiedi N"); altrimenti tutta la lista ("N carte giocate", "In questo set: N"). Con "Mostra anche le mancanti" l'elenco contiene anche le mancanti, e la nota lo dice.
- **Menu Periodo**: con un'espansione scelta i conteggi ("Storico · 69 carte") sono quelli dell'espansione (`presetCounts` con `keep`); prima erano quelli di tutte le carte.
- Controllati gli altri riepiloghi:
  - "ne possiedi M (K in questa espansione)" conta sulla stessa lista;
  - in "Carta dimenticata" il numero di "nessuna delle tue carte… ({n} in tutto)" è l'insieme da cui si pesca;
  - gli export lavorano sulla lista completa (decisione già presa), non sull'elenco filtrato.
- **Difetto trovato con il test**: dopo aver usato il campo "Espansione", il primo `pointerdown` fuori dal campo richiudeva le opzioni sotto il campo e spostava il layout sotto il cursore, quindi il clic finiva su un altro elemento (per esempio la casella "Mostra anche le mancanti" non si spuntava). Ora la chiusura avviene su `click`.

## Pagina Informazioni (riscritta il 2026-10-06)

- Obiettivo: si legge in 30 secondi, ogni concetto compare una sola volta. Struttura in `ui/about.ts`:
  1. una frase su cosa fa il sito; "Come si usa" in 3 passi con icone SVG originali (carica, filtri, carta con spunta), in griglia su desktop e in colonna su mobile;
  2. "I dati": una frase con la data dell'ultimo aggiornamento (`meta.generated_at`);
  3. "Domande frequenti": 5 `<details>` chiusi (giocata in Pauper, precisione delle percentuali, privacy, segnalare un errore, sostenere il sito);
  4. in fondo un unico blocco legale piccolo (`.legal`): testo ufficiale della Fan Content Policy in inglese (`#fcp`, una sola volta), sintesi in una riga **solo in italiano** (`about.legal.summary`, vuota in inglese), non affiliazione con ManaBox e Scryfall, crediti con i link.
- Tolti: la traduzione italiana integrale dell'avviso, le ripetizioni e le spiegazioni tecniche, ora nel README ("Come funziona nel dettaglio"). Nella pagina Informazioni il piè di pagina del sito è nascosto, perché il blocco legale e la FAQ sulle donazioni lo sostituiscono.
- Screenshot prima/dopo: `node scripts/about-shots.mjs <etichetta>` (con preview attivo) in `.cache/screenshots/informazioni-*.png`.

## Controllo rapido di una carta (funzione 2)

- **Campo in cima alla pagina** (`#quickInput`): schema ARIA *combobox*, con `aria-expanded`, `aria-activedescendant` e opzioni `role="option"`. Si usa con frecce, Invio (sceglie la prima o quella attiva), Esc (chiude i suggerimenti; al secondo Esc svuota il campo) o tocco. Al focus il testo viene selezionato, così la carta successiva si scrive sopra. Testo a 16 px (niente zoom su iPhone), righe dei suggerimenti alte almeno 44 px.
- **Suggerimenti** (`lib/quick.ts`, `suggest`), in ordine:
  1. il nome inizia con la ricerca;
  2. una parola (anche di una faccia) inizia con la ricerca;
  3. tutte le parole cercate sono inizi di parola ("light bol");
  4. la ricerca compare ovunque (da 3 caratteri).

  A parità vengono prima le carte giocate, poi i nomi più corti; al massimo 8. Prima che arrivi `cardnames.json` si suggeriscono solo le carte giocate. Un **nome esatto** mostra il risultato subito, senza scegliere.
- **Risultato**:
  - *carta giocata*: immagine (la printing posseduta se c'è, altrimenti quella di riferimento), legalità, percentuale e numero di mazzi nel periodo scelto con le copie tipiche, ultima apparizione MTGO e cartacea con il link al torneo, set d'ingresso, "Tutti gli artwork" (apre la scheda con il ventaglio);
  - *carta mai giocata*: "Mai giocata in Pauper" con la legalità;
  - *con la collezione*: copie possedute, printing e Binder, da `collectionIndex`. Il possesso è **per carta e per nome**, quindi vale anche per carte escluse dai filtri o mai giocate.
- **Aggiornamento**: il risultato si aggiorna quando cambiano filtri, lingua o collezione.
- **Correzioni alla scheda della tabella**, trovate con questa funzione:
  - Esc chiude solo lo strato più in alto (prima la griglia "Mostra tutte", poi la scheda);
  - dopo una chiusura esplicita, né il ritorno del focus né il mouse fermo sulla riga riaprono la scheda; si riapre solo uscendo e rientrando con il mouse.

## Filtro per espansione (funzione 3)

- **Campo "Espansione"** nella barra dei filtri (`#setInput`, combobox come il controllo rapido): ricerca per nome o codice, anche dei set collegati, con le espansioni dalla più recente. Al focus mostra l'elenco intero. Esc chiude l'elenco; un secondo Esc (o la × del campo) toglie il filtro.
- **Gruppi** (`lib/sets.ts`): il set principale è l'antenato senza padre lungo `parent_set_code`, come per le revisioni. Per esempio DMU raggruppa DMC e, se attivati, le promo PDMU.
- **Nascosti di default, attivabili con un'opzione sotto il campo** (`isHiddenSet`): set di tipo promo, memorabilia, token e alchemy, set solo digitali, Secret Lair, The List, e i set il cui padre è Secret Lair o The List. Se la ricerca non trova nulla tra i set visibili, l'elenco propone "Cerca anche tra promo, Secret Lair…", perché l'opzione sotto il campo è coperta dall'elenco aperto.
- **Vista per espansione**:
  - la lista (con i filtri attivi) si restringe alle carte con almeno una stampa nei set del gruppo, **a qualsiasi rarità**: la legalità è della carta. Anche gli export seguono la selezione;
  - riepilogo in testa: "In questo set: N carte giocate in Pauper", più " · ne possiedi M (K in questa espansione)" con la collezione (decisione all'approvazione della funzione 3). M conta le carte possedute **in qualsiasi stampa**, K solo quelle di cui possiedi una stampa dei set del gruppo; quella stampa ha il bordo sulla miniatura;
  - immagine: la stampa del set principale (preferendo la comune), poi la comune, poi la prima;
  - etichetta: "Comune qui", oppure "{Rarità} qui · comune in {set d'ingresso} ({anno})". Basta una stampa comune nel gruppo perché la carta sia "comune qui";
  - senza collezione si esplora; con la collezione si vedono **tutte** le carte, con "mancante" sulle altre, e c'è l'opzione "Solo quelle che possiedi". L'opzione "Mostra anche le mancanti" in fondo si nasconde, perché qui non serve.
- **Stampa del set** (corretto il 2026-10-07): la miniatura di ogni riga e la carta attiva della scheda sono **sempre** la stampa del set selezionato (`displayPrint`), con o senza collezione.
  - Prima la miniatura usava la printing posseduta se era nel gruppo (anche di un set collegato, o in un'altra lingua). La scheda apriva la printing posseduta o quella di riferimento, perché il ventaglio sceglie un artwork per `illustration_id` preferendo la posseduta e poi la più recente in inglese: in Masters 25, per esempio, la scheda di Nihil Spellbomb mostrava la stampa di The List. Ora `openSheet` riceve `focusId`: `fanItems` sceglie quella stampa nel suo gruppo di illustrazione e la mette per prima, e la carta attiva è lei.
  - Le tue printing restano secondarie: bordo ed etichetta "Tua" solo se possiedi **proprio quella stampa** (stesso Scryfall ID, stessa printing o stesso set e numero), più l'elenco delle printing possedute sotto il nome.
  - **Miniature più grandi**: 112 px (88 px su mobile) contro i 40 px della vista collezione, `loading="lazy"`, con `srcset` small/normal per gli schermi ad alta densità.
  - **Simbolo del set** accanto all'etichetta di rarità, colorato secondo la rarità di quella stampa (vedi "Simboli delle espansioni"), con testo alternativo "Set · Rarità". Il testo resta: "Comune qui"; "{Rarità} · comune qui in {set}" se questa stampa non è comune ma un'altra del gruppo sì; altrimenti "{Rarità} qui · comune in {set d'ingresso} ({anno})".

- **Controllo rapido, corretto il 2026-10-07**: se `cardnames.json` arrivava dopo la scelta di una carta con Invio, il caricamento riapriva l'elenco dei suggerimenti (test intermittente). Ora i suggerimenti si aggiornano all'arrivo dei nomi solo se l'elenco è ancora aperto; c'è un test con la risposta ritardata.
- **Campi con suggerimenti** (controllo rapido ed espansione): la chiusura dell'elenco dopo il blur è differita (per permettere il clic su un suggerimento), ma viene **annullata** se il campo torna attivo prima che scatti. Prima un timer vecchio poteva chiudere l'elenco appena riaperto e svuotare il campo; il difetto è stato trovato da un test intermittente in CI.

## Simboli delle espansioni (2026-10-07)

- **Scelta: sprite servito dal sito**, non `svgs.scryfall.io`. Motivi:
  - **CSP invariata**: il file è sullo stesso dominio e si usa con `<svg><use href="data/seticons.svg#nome">`, come il logo. Con le icone remote serviva aggiungere `https://svgs.scryfall.io` a `img-src`;
  - **colori**: con `<use>` il tracciato eredita `currentColor`, quindi il simbolo segue il tema scuro e prende i colori di rarità. Un `<img>` SVG remoto non si può ricolorare (servirebbero filtri CSS);
  - **privacy**: nessuna richiesta in più verso Scryfall, quindi la nota privacy non cambia. Aggiornati solo i crediti: "carte, immagini e simboli delle espansioni".
- **Pipeline** (`seticons.py`, chiamato da `build`): per ogni set di `sets.json` legge `icon_svg_uri` da `/sets` e scarica l'icona (`svgs.scryfall.io`, senza limiti di frequenza). Poi la **ripulisce** (solo i tracciati visibili, con `fill-rule`; niente colori, id, stili, script; i tracciati con `fill="none"` si scartano) e la riporta a una griglia di 240 unità, con coordinate intere e relative, arrotondate in assoluto (nessun errore che si accumula; a 24 px su schermo 2x un'unità vale circa 0,2 px). Si passa da 644 KB / 276 KB gzip a 285 KB / 102 KB gzip.
  - **Incrementale**: lo sprite è committato; si riscarica solo un'icona nuova o con la versione cambiata (`?ts` dell'URL, salvato in `data-v`). Senza rete restano le icone già presenti.
  - Icone escluse perché sono marchi: `planeswalker`, `default`, `dci`. Per quei set `i: ""` e il sito non mostra nulla.
- **Sito** (`ui/seticon.ts`, `setIcon`):
  - nel selettore accanto a ogni nome, decorativa (`aria-hidden`), perché il nome è scritto accanto;
  - dentro il campo dopo la scelta, con `role="img"` e `aria-label` = nome del set;
  - nella vista per espansione accanto alla rarità, con `aria-label` "Set · Rarità".

  Il nome dell'icona è validato (`[a-z0-9_-]`).
- **Colori di rarità** (variabili `--rar-*`, chiaro / scuro): comune `#18202B` / `#E5E9EF` (colore del testo), non comune `#5C6875` / `#B3BFCC`, rara `#8C6A0E` / `#E3C063`, mitica `#BF4510` / `#F38A4A`, speciale e bonus `#6A3E9E` / `#BC9DEA`. Contrasto di almeno 4,5:1 sullo sfondo delle schede.

## Logo (2026-10-06)

- **Originale**: `logo/logo.svg` (dell'utente, un solo tracciato `#555555`). Nessun elemento di Wizards (simboli di mana, logo di Magic, retro delle carte, planeswalker).
- **`npm run icons`** (`web/scripts/icons.mjs`) genera tutto da lì, senza dipendenze in più: tracciato compattato (coordinate relative, viewBox ritagliato), PNG disegnate in un canvas di Chromium e salvate come PNG indicizzate con zlib al massimo.
  - `public/logo.svg`: `<symbol id="logo">` con `fill="currentColor"`, usato in testata con `<svg class="logo"><use href="/logo.svg#logo">`; il colore viene da `--logo` (`#555555` chiaro, `#C9CFD8` scuro), quindi segue anche il tema scelto a mano;
  - `public/icon.svg`: favicon con `prefers-color-scheme` (stessi due colori);
  - `apple-touch-icon.png` (180, quadrato pieno), `icon-192/512.png` (angoli arrotondati), `icon-maskable-512.png` (logo al 56%, dentro l'area sicura), `og-image.png` (1200×630, logo + "Pauper Index" in New Rocker + dominio): tutte su sfondo scuro `#1B2028` con il logo `#C9CFD8`.
- **Varianti scelte dall'utente**: in tema scuro il logo diventa grigio chiaro senza riquadro; icone della schermata Home su sfondo scuro. Il testo dell'og-image usa il font di sistema della macchina che rigenera (Segoe UI su Windows).

## Donazioni (2026-10-06)

- Link semplice a https://ko-fi.com/pauperindex (`DONATE_URL` in `web/src/ui/about.ts`): una riga nel piè di pagina (`.donate`, chiavi `donate.lead` + `donate.link`) e la sezione "Sostenere il sito" in Informazioni (`about.support*`). Nessuno script né widget, CSP invariata; nessun banner, popup o funzione riservata a chi dona.

## Dominio (2026-10-06)

- **pauperindex.com** (registrar Porkbun, DNS Porkbun): 4 record A e 4 AAAA di GitHub Pages sul dominio principale, CNAME `www` → `scela.github.io`, MX e SPF di Porkbun per l'inoltro email, TXT `_github-pages-challenge-scela` (dominio verificato nell'account). Nessun record CAA.
- Dominio impostato nelle impostazioni di Pages via API (`gh api -X PUT repos/scela/pauper-index/pages -f cname=pauperindex.com`); con il deploy da Actions **non serve** il file `CNAME`. GitHub reindirizza `www` e `scela.github.io/pauper-index/` al dominio principale.
- **Attenzione**: dopo il cambio del dominio il sito resta in 404 finché non c'è un **nuovo deploy** (rilanciare solo il job di deploy di una vecchia esecuzione fallisce per "Multiple artifacts named github-pages": serve un'esecuzione nuova, per esempio Run workflow).
- `base` di Vite: `/`; manifest con `start_url` e `scope` `/`; link canonico e meta Open Graph assoluti su `https://pauperindex.com/` (descrizione OG in italiano e inglese nella stessa frase, perché i crawler non eseguono JavaScript).

## Repository e privacy dei commit

- Repository pubblico https://github.com/scela/pauper-index, sito https://pauperindex.com (Pages da GitHub Actions, HTTPS obbligatorio).
- Email dei commit: **solo** l'indirizzo noreply `132697821+scela@users.noreply.github.com`, impostato nella configurazione **locale** del repository. Prima del primo push la storia è stata riscritta (con l'autorizzazione dell'utente) per togliere l'email personale; i commit del bot usano `41898282+github-actions[bot]@users.noreply.github.com`.
- Prima di ogni push che tocca file nuovi: nessun file di `reference/private/` e nessuna riga dei file privati nei commit.
