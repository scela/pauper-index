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

## Stato attuale (2026-10-19)

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
  - [x] 2026-10-07: ragnatele realistiche (combinazione dei 3 stili proposti, scelta dall'utente) e carta in 3D (vedi "Ragnatele" e "Carta in 3D")
  - [x] 2026-10-07: "Carta dimenticata" fluida e più breve, circa 0,9 s (vedi "Carta dimenticata: fluidità")
  - [x] 2026-10-07: "Rimuovi collezione" con Annulla (vedi "Rimuovi collezione")
  - [x] Funzione 4: mazzi che puoi costruire, completata il 2026-10-15. Piano approvato il 2026-10-07 (vedi "Funzione 4: mazzi"):
    - [x] punto 0: filtri che nascondono carte mai salvati, espansione ricordata (commit `2c261a1`)
    - [x] passo 2: pipeline e archetipi, nomi secondo le convenzioni della comunità (commit `380c54a`, 2026-10-08). Restano gruppi automatici, da nominare quando l'utente decide (righe nuove in fondo al CSV): nomi decisi il 2026-10-15 e applicati nel passo 4 (Golgari Gardens, Ruby Storm); "Respite + Tangle" non è Food Gardens e resta automatico (passo 3b del restyling)
    - [x] prima del passo 3 (2026-10-08): scheda più rapida al passaggio del mouse e prezzi indicativi in euro (vedi "Scheda al passaggio del mouse" e "Prezzi indicativi")
    - [x] prima del passo 3 (2026-10-08): filtri per colore, costo di mana, tipo e testo delle regole, nel pannello "Filtri" (vedi "Filtri per colore, costo, tipo e testo")
    - [x] prima del passo 3 (2026-10-08): ricerca anche con i nomi italiani e filtro sul testo anche in italiano (vedi "Nomi italiani")
    - [x] passo 3 (2026-10-08): sezione "Mazzi" nel sito, completamento, export nel formato di MTG Arena (vedi "Sezione Mazzi")
    - [x] passo 4 (2026-10-15): archetipi Golgari Gardens e Ruby Storm, nomi della decklist secondo il layout (formato MTG Arena), Invio in anticipo nel controllo rapido, test della "Carta dimenticata" indipendente dal carico, misure del calcolo dei mazzi (vedi "Funzione 4: rifinitura")
  - [x] Pagina iniziale su smartphone e Carta dimenticata (2026-10-15/16), piano approvato il 2026-10-15 (vedi "Pagina iniziale e Carta dimenticata"); dopo, i passi 4–5 dei Mazzi:
    - [x] A1: difetti (carte e copie della collezione, valore "almeno" con righe senza printing)
    - [x] A2: testata su una riga, menu compatto, famiglia di pulsanti, libro di Mazzi (ex passo 6 dei Mazzi), riga dei dati corta (vedi "Testata (2026-10-15)")
    - [x] A3: caricamento (frase, due pulsanti, aiuto per l'export di ManaBox, riga della collezione) — **controllo con screenshot dopo A2 e A3**
    - [x] A4: campo unico "Cerca una carta" con la scheda arricchita (vedi "Cerca una carta")
    - [x] A5: filtri su una riga ("Ultima apparizione" nel pannello), righe compatte, misure prima/dopo
    - [x] B: Carta dimenticata, soglia dei mazzi storici (riquadro numerico; vedi "Carta dimenticata: soglia dei mazzi")
  - [x] Restyling della sezione Mazzi, piano approvato il 2026-10-15 (vedi "Restyling dei Mazzi"):
    - [x] passo 1: Golgari Gardens con le liste Gardens di "Defile + Crypt Rats", mancanti con i nomi della decklist, ridisegno della pagina Mazzi senza perdere focus e decklist aperte
    - [x] passo 2: simboli di mana (vedi "Simboli di mana")
    - [x] passo 3: pipeline (tier, carte simbolo, lista tipica, nomi dei mazzi bianchi), vedi "Tier e carte simbolo" — report
    - [x] passo 3b: Food Gardens, famiglie Ephemerate, Control (titolo "Dimir Control") e Synthesizer, colonna `famiglia` (vedi "Tier e carte simbolo")
    - [x] passo 4 (2026-10-16): tier list e pagina dell'archetipo (vedi "Tier list e pagina dell'archetipo")
    - [x] passo 5 (2026-10-16): filtri della tier list e della pagina dell'archetipo — report con screenshot
    - [x] passo 6: testata (fatta nel passo A2 della pagina iniziale, vedi "Testata (2026-10-15)")
    - [x] passo 7 (2026-10-19): rifinitura, dopo le correzioni del 2026-10-19 (vedi "Correzioni del 2026-10-19") — report finale
  - [x] 2026-10-10: conteggio anonimo delle visite e degli eventi con GoatCounter, senza cookie (vedi "Conteggio delle visite")
- **Opzioni tolte su richiesta**: "Escludi terre base" (le terre base sono sempre escluse) e "Conta le copie" (una carta è posseduta se ne hai almeno una copia).
- **Test** (2026-10-19, dopo il passo 7 dei Mazzi): 127 pytest, 98 Vitest, 223 Playwright (più 13 saltati di proposito: i test col mouse e quelli solo desktop non girano su mobile, quelli del primo schermo e della tier list su iPhone SE girano solo su mobile, il test del conteggio sul dominio pubblicato solo su desktop-it) sui quattro progetti desktop/mobile × IT/EN.
- **Dependabot**: unita la PR #1 (pytest 8.4.2 → 9.1.1), con tutti i test verdi. Il 2026-10-15, tutte con i test verdi in CI: #8 (actions/setup-node 7.0.0 → 7.1.0), #9 (ruff 0.16.10 → 0.17.0), #10 (iniconfig 2.3.0 → 2.3.1), #12 (@playwright/test 1.63.0 → 1.64.0, vite 8.3.2 → 8.3.4, vitest 5.0.3 → 5.0.4). La #12 ha sostituito la #11, chiusa da Dependabot al rebase su `main` dopo GoatCounter.
- **Test intermittenti in locale** (2026-10-15): risolti nel passo 4. "brainst" + Invio in `analytics.spec.ts` era un difetto del codice (Invio prima dei suggerimenti), corretto senza toccare il test; "Carta dimenticata: passaggio fluido" misurava il tempo a orologio, ora controlla le durate dichiarate delle animazioni.
- **Issue**: #4 (test intermittente in CI) chiusa con la correzione del blur nei campi con suggerimenti. 2026-10-19: chiuse #16 (CI fallita del 16/10, vedi "Correzioni del 2026-10-19") e #7 (revisione di The Hobbit, nulla da decidere).

## Prossimi passi

In quest'ordine, ciascuno **solo dopo il via dell'utente**, fermandosi alla fine con un report:

1. ~~Donazioni~~, ~~dominio personalizzato~~ e ~~logo~~: fatti il 2026-10-06 (vedi "Logo", "Donazioni" e "Dominio").
2. ~~**Funzione 4, "Mazzi che puoi costruire"**~~: completata il 2026-10-15 (vedi "Sezione Mazzi" e "Funzione 4: rifinitura"). Richiesta originale:
   - **Dati**: decklist degli ultimi 61 giorni, con un'opzione per periodi più lunghi se le dimensioni lo permettono. Nessun nome di giocatore. Le liste identiche si uniscono, mostrando quante volte compaiono. Si caricano solo quando si apre la sezione; vanno misurate le dimensioni.
   - **Archetipi**: la fonte non li indica. Valutare se esiste una classificazione open source degli archetipi Pauper con licenza compatibile; altrimenti raggruppare i mazzi simili tramite le carte più caratteristiche, e usare quelle carte come nome provvisorio del gruppo.
   - **Completamento**: percentuale delle carte del mazzo possedute, tenendo conto delle copie (per ogni carta il minimo tra copie possedute e richieste). Le terre base normali sono escluse dal calcolo e sempre disponibili. Opzione solo main / main più side.
   - **Visualizzazione**: elenco ordinato per completamento, con percentuale, carte mancanti con quantità, data, torneo, piazzamento e link al torneo; filtro per completamento minimo.
   - **Export**: carte mancanti in formato "1 Nome" (lista acquisti) e decklist completa in testo importabile in ManaBox.
   - **Calcolo nel browser**; se è pesante, in un web worker (oggi la CSP ha `worker-src 'none'`: va aperta a `'self'`).
   - Testi in IT e EN.
3. **Dopo la funzione 4, nell'ordine**: Preferite; Brewing versione 1 (co-occorrenze); Brewing versione 2 (funzioni delle carte); da valutare in futuro le sinergie generate da un modello di IA. Dettagli in `docs/IDEE.md` ("Dopo la funzione 4").
4. **Fase 4**: rifinitura e README completo.

Idee per dopo, non pianificate: `docs/IDEE.md`.

## Regole di lavoro (decise dall'utente)

**Lingua**: rispondere **sempre in italiano**, compresi report, domande e messaggi intermedi (richiesta dell'utente del 2026-10-08, valida per tutte le sessioni).

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
- Pipeline (`pipeline/src/pauper_index/`): `cli.py` (comandi), `build.py` (orchestrazione), `source.py` (fonte e classificazione), `dedup.py`, `resolve.py` (nomi → carte), `carddb.py` (Scryfall, indice dei nomi, set d'ingresso), `stats.py`, `outputs.py` (JSON per il sito), `sets.py`, `seticons.py` (simboli delle espansioni), `review.py` (revisioni, snapshot, allarme), `decks.py` (mazzi e archetipi), `italian.py` (nomi e testi delle stampe italiane), `prices.py` (prezzi), `scryfall.py` (client con limiti di frequenza), `config.py`.
- Frontend (`web/src/`): `main.ts` (stato, eventi, rendering), `lib/` (logica pura e testata: `compare`, `prices`, `view` (filtri dell'elenco e nota del riepilogo), `cardfilter` (colore, costo, tipo, testo), `italian` (nomi italiani e ricerca per nome), `decks` (mazzi: completamento, ordine, export), `analytics` (conteggio delle visite con GoatCounter), `data`, `csv`, `text`, `quick`, `sets`, `exports`, `format`, `store`, `norm`, `dom`), `ui/` (`sheet` scheda e ventaglio, `filterpanel` pannello "Filtri" ed etichette, `about` Informazioni, `quick` controllo rapido, `setpicker` espansione, `seticon` simboli dei set, `dust` pagina "Carta dimenticata", `decks` pagina "Mazzi", `cobweb` ragnatele, `tilt` carta in 3D), `i18n/` (`it.ts`, `en.ts`, `index.ts`), `style.css`; `index.html`; `public/count.js` (GoatCounter); `vite.config.ts` (dati pubblicati e CSP).
- Test: `pipeline/tests/`, `web/tests/` (Vitest), `web/e2e/smoke.spec.ts` e `web/e2e/analytics.spec.ts` (Playwright).
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
.\.venv\Scripts\python -m pauper_index prices     # solo data/prices.json (bulk default_cards più recente); --offline usa quello in cache
.\.venv\Scripts\python -m pauper_index italian    # nomi italiani: aggiornamento incrementale se serve; --full li riscarica tutti (circa 3 minuti)
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
node scripts/dust-perf.mjs <etichetta> [rallentamento]   # con preview attivo: video di 3 pesche e misure (fotogrammi persi, layout shift)
node scripts/tilt-frames.mjs                     # con preview attivo: carta in 3D inclinata in direzioni diverse (mouse e dito)
node scripts/header-shots.mjs <etichetta>        # con preview attivo: testata, desktop/mobile/mobile piccolo, chiaro/scuro, IT/EN, con focus
node scripts/sheet-timing.mjs <etichetta> [n]    # con preview attivo: tempi della scheda al passaggio del mouse (apertura, comparsa, cambio carta, chiusura)
node scripts/filter-shots.mjs <etichetta>        # con preview attivo: barra, pannello "Filtri" ed etichette, desktop/mobile, chiaro/scuro
node scripts/italian-shots.mjs <etichetta>       # con preview attivo: nomi italiani nel controllo rapido e nella scheda, desktop/mobile, IT/EN
node scripts/decks-shots.mjs <etichetta> [it|en] # con preview attivo: pagina Mazzi senza e con collezione, decklist, desktop/mobile, chiaro/scuro
node scripts/decks-perf.mjs <etichetta> [1,4,6]  # con preview attivo: tempi della pagina Mazzi (61 giorni, ultimo anno, main/side, archetipo) con il processore rallentato, su mobile
node scripts/home-metrics.mjs <etichetta>        # con preview attivo (o SITE_URL=https://pauperindex.com/): misure del primo schermo della pagina iniziale e screenshot, desktop 1280×900 e mobile 375×667, chiaro/scuro, IT/EN, senza e con collezione
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
  - (v3, 2026-10-08, per i filtri) `k` colori della carta in ordine WUBRG, assente se incolore: `colors` di Scryfall, oppure l'unione dei colori delle facce quando manca al livello principale (transform, modal_dfc); **non** l'identità di colore e non i colori del costo (`Card.colors`, usati per gli archetipi). `m` mana value intero (`cmc` troncato: 0,5 → 0). `tl` riga del tipo di tutte le facce ("Sorcery // Land");
  - (2026-10-15, per l'export dei mazzi) `dn` nome nella decklist esportata, solo se diverso da `n`: la prima faccia delle carte con più facce, tranne i layout `split` e `aftermath` (`Card.deck_name`, `FULL_NAME_LAYOUTS` in `carddb.py`). 55 carte al 2026-10-15;
  - `s[i]`: `0` oppure `[mazzi main+side, mazzi main, copie totali, mediana copie main+side, mediana copie main]`;
  - `f` / `z`: prima e ultima apparizione;
  - `lm` / `lp`: ultima apparizione MTGO e cartacea, `[indice in t, risultato (rank intero o "5-0"), copie main, copie side]`;
  - `r`: indice della printing di riferimento in `printings.json`;
  - `y` (v2, per "Rispolvera una carta"): mazzi per anno su tutto lo storico, `[primo anno, mazzi, …]` dal primo all'ultimo anno in cui è giocata (anni vuoti = 0).
- `yt` (v2): mazzi totali per anno, `[primo anno, mazzi, …]`; serve a calcolare la quota per anno. `y` e `yt` aggiungono circa 0,12 MB grezzi e **0,04 MB con gzip**.

**`texts.json`** (2026-10-08): `{v: 1, t}`, dove `t[i]` è il testo delle regole (in inglese, `oracle_text`) della carta i di `cards.json`; per le carte con più facce i testi delle facce sono separati da una riga `//`. **656 KB grezzi, 112 KB gzip**; il sito lo scarica solo al primo uso del campo "Testo delle regole". Le aggiunte a `cards.json` (v3) pesano 185 KB grezzi e **31 KB gzip** (da 0,39 a 0,42 MB gzip).

**`itnames.json`, `itnames-other.json`, `ittexts.json`** (2026-10-08): nomi e testo delle stampe italiane, vedi "Nomi italiani".

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

**`manasymbols.svg`** (2026-10-15): sprite dei simboli di mana (14 simboli, 19 KB grezzi, 7,9 KB gzip), committato; vedi "Simboli di mana".

**`prices.json`** (2026-10-08, **non committato**, in `.gitignore`): `{v, date, p}`, allineato a `printings.json`; `p[i]` = `[eur, eur_foil, …]` in centesimi, una coppia per printing della carta i, 0 = assente. 141 KB grezzi, 46 KB gzip. Vedi "Prezzi indicativi".

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
| `cards.json` | 1,38 MB (v2, con `y`); 1,54 MB (v3, 2026-10-08) | 0,40 MB; 0,42 MB (v3) |
| `texts.json` (2026-10-08) | 0,66 MB | 0,11 MB |
| `itnames.json` (2026-10-08) | 0,12 MB | 0,04 MB |
| `itnames-other.json` (2026-10-08) | 0,78 MB | 0,26 MB |
| `ittexts.json` (2026-10-08) | 0,73 MB | 0,14 MB |
| `reviews/italiano.json` (stato, né committato né pubblicato) | 8,1 MB | 2,4 MB |
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
- **Pagina "Come funziona"** ("How it works"; fino al 2026-10-16 "Informazioni", indirizzo `#informazioni` invariato) nella testata e nel menu "⋯"; il suo **blocco legale** è raggiungibile da ogni schermata con il link "**Note legali**" del piè di pagina (`#note-legali`: la stessa pagina, che scorre al blocco legale `#legal` e gli dà il focus). Contiene:
  - il testo **esatto** della Fan Content Policy di Wizards, letto da `company.wizards.com/en/legal/fancontentpolicy`;
  - la non affiliazione con Wizards, ManaBox e Scryfall;
  - i crediti (Scryfall, MTGODecklistCache e i siti di origine);
  - i limiti dei dati (vedi "Cosa contengono i dati MTGO") e la data dell'aggiornamento;
  - come segnalare un errore.
- **Nessun logo né simbolo** di Wizards, ManaBox o Scryfall. **Eccezioni** decise dall'utente: i **simboli delle espansioni** (2026-10-07) e i **simboli di mana** (2026-10-15) sono ammessi solo come piccole icone (selettore "Espansione", rarità nella vista per espansione, colori e costo nella sezione Mazzi e nel pannello "Filtri"). Restano esclusi logo di Magic, logo di Wizards, retro delle carte e simbolo dei planeswalker; per questo la pipeline non usa le icone di set `planeswalker` (The List), `default` (la "M" generica di Magic) e `dci` (logo DCI). Vedi "Simboli di mana".
- **Illustrazioni ritagliate** (`art_crop`, regola di Scryfall, 2026-10-15): nella stessa schermata devono esserci il nome dell'artista (su ogni immagine) e il copyright, con una riga visibile "Illustrazioni ™ & © Wizards of the Coast" (non solo in Informazioni). Nessun testo, sfumatura o altro livello sopra l'illustrazione; nessuna deformazione, filtro o ricolorazione; proporzione vicina a quella dell'art crop (circa 4:3).
- **Nota privacy**: nessun account, nessun cookie; la collezione resta nel browser e non viene mai inviata; visite contate in forma anonima con GoatCounter (dal 2026-10-10, **scostamento dalla spec**, che diceva "nessuna analytics": richiesta dell'utente); GitHub Pages può registrare dati tecnici di accesso; le immagini arrivano dai server di Scryfall.

### Sicurezza
- **Mai `innerHTML` con dati esterni** (CSV, nomi, report): si usa `textContent` o un escaping centralizzato. Va aggiunto un test con un CSV malevolo.
- **CSP con meta tag**:
  - nessuno script esterno;
  - `connect-src 'self'` più il solo endpoint del contatore di visite (vedi "Conteggio delle visite");
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
2. **Filtri**: nella barra solo periodo (menu con il numero di carte per periodo), espansione, ricerca per nome e il pulsante "Filtri"; minimo mazzi, solo legali e conta anche il side sono nel pannello "Filtri" (dal 2026-10-08, vedi "Filtri per colore, costo, tipo e testo"). Ogni modifica aggiorna subito i risultati.
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
  - in build copia in `dist/data/` **solo** `cards`, `texts`, `itnames`, `itnames-other`, `ittexts`, `printings`, `names`, `allnames`, `cardnames`, `sets`, `seticons.svg`, `meta`, `decks-61`, `decks-365`, `prices` (se c'è) e `reviews/index.json` (elenco `PUBLIC_DATA`). I report interni (`unresolved.csv`, `risoluzione.csv`, `dedup.json`, `set-ingresso.md`, `baseline-*.md`, `reviews/<set>.*`) restano fuori dal sito. **Un nuovo file di dati va aggiunto a `PUBLIC_DATA`**, altrimenti nel sito dà 404 (è successo con `sets.json`);
  - inietta la CSP (meta tag) **solo in build**, perché il dev server di Vite usa stili inline.

**Decisioni**:
- **Font di sistema** al posto di Geist: nessuna richiesta esterna. Unica eccezione (2026-10-07): il nome "Pauper Index" in New Rocker ridotto, servito dal sito (vedi "Testata").
- **CSP**: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://cards.scryfall.io data:; connect-src 'self' https://albafvcens.goatcounter.com/count; font-src 'self'; manifest-src 'self'; worker-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'`. `<meta name="referrer" content="no-referrer">`, così le richieste di immagini a Scryfall non rivelano la pagina.
- **Ruoli dei gruppi**: solo "Inclusa" o "Esclusa" (in "Binder inclusi"). Binder di tipo `deck` o `list` sono esclusi di default; il testo incollato è un gruppo "Testo incollato" che conta come posseduto.
- **Abbinamento di una riga**:
  1. Scryfall ID (`printings.json`);
  2. set + numero;
  3. nome (`names.json`, poi faccia frontale, poi `A/B` → `A // B`).

  Le righe con uno Scryfall ID sconosciuto (printing in altre lingue) si abbinano per nome, ma la miniatura usa il loro ID.
- **Riepilogo dell'importazione**: righe lette, carte della lista, carte mai giocate in Pauper (Scryfall ID o nome in `allnames.json`), righe non riconosciute (elencate), righe senza set e numero (immagine di riferimento, segnalata anche nella scheda).
- **"Conta le copie"**: opzione **tolta** su richiesta dell'utente (dopo la funzione 2). Una carta è posseduta se ne hai almeno una copia; export "1 Nome" e List riallineata con quantità 1. Le copie tipiche (mediana) restano solo come informazione, nella scheda e nel controllo rapido.
- **Ventaglio**: un artwork per `illustration_id`, preferendo la printing posseduta, poi la più recente in inglese. Al massimo 7, più "Mostra tutte" che apre una griglia in un `<dialog>`. Le carte sono **distanziate e ruotate di pochi gradi, senza sovrapporsi**, per non coprire artista e copyright (regole di Scryfall). La carta attiva è mostrata intera e più grande.
- **Persistenza**: IndexedDB (database `pauper-index`) per la collezione e le opzioni (periodo, minimo mazzi, solo legali, side, proxy, "Mostra anche le mancanti"); localStorage, con prefisso `pauper-index:`, per tema, lingua, ordinamento ed **espansione selezionata** (`set`, `setHidden`, dal 2026-10-07). **I filtri che nascondono carte non si salvano mai** e ripartono azzerati a ogni visita: ricerca, "Ultima apparizione" (prima era salvata ed è stata la causa del caso "69 contro 13"; la chiave vecchia `seen` si cancella all'avvio) e "Solo quelle che possiedi", e i filtri del pannello "Filtri" (colore, costo, tipo, testo). "Cancella i miei dati" elimina il database e **solo** le chiavi `pauper-index:`: su GitHub Pages l'origine è condivisa con gli altri siti dello stesso utente, quindi niente `localStorage.clear()`.
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
- **`changed`** (`python -m pauper_index changed`): ignora i campi volatili di `meta.json` (`generated_at`, `scryfall` con le date dei bulk, `source.commit`, `source.commit_date`, `source.days_since_last_tournament`) e `seen` dei gruppi in `data/reviews/archetipi-auto.json` (dal 2026-10-19; mai letto dalla pipeline). Se cambiano solo quelli, ripristina i file e non fa commit; con altri cambiamenti si committa tutto (`significant_changes`, test in `test_changed.py`). Quindi `generated_at` nel sito è la data dell'**ultimo cambiamento dei dati**.
- **Allarme "fonte ferma"**: `alarm` gira ogni giorno, anche senza dati nuovi. Se l'ultimo torneo è più vecchio di **15 giorni** (21 fino al 2026-10-19; stessa soglia dell'avviso nel sito, `STALE_SOURCE_DAYS` in `config.py` e in `main.ts`) apre la Issue "Fonte dati ferma", con i fork di MTGODecklistCache aggiornati di recente, ma solo se non ce n'è già una aperta. Il sito calcola l'avviso anche da solo, dalla data dell'ultimo torneo, perché senza dati nuovi non c'è un nuovo commit.
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

- **Dal 2026-10-16** (decisione dell'utente, modifica D): gli elenchi di carte partono sempre da 10 righe (`PAGE`), ma il pulsante ne aggiunge **100** (`STEP`) e dice quante ne restano: "Carica altre 100 · ne restano 2.972", "Carica le ultime 37", "Carica l'ultima" (`res.moreN`, `res.moreLast`, `res.moreOne`); nei Mazzi **20** alla volta ("Carica altri 20 · ne restano N", "Carica gli ultimi N", `decks.more*`). Il focus va sempre sulla prima riga aggiunta. "Carica altri" **aggiunge solo le righe nuove** (`renderRows(from)`, nei Mazzi `renderList` con `append`) invece di ridisegnare l'elenco. **Misura** (`scripts/more-perf.mjs`, iPhone 13 emulato, periodo Storico): un blocco di 100 righe compare in 51–78 ms a velocità piena e in **291–368 ms con il processore 4×** (prima dell'aggiunta solo delle righe nuove: 622, 945, 1.305 ms per il primo, secondo e terzo blocco). Le righe sotto valgono per i primi 10.

- Ogni elenco di carte mostra **10 carte** (`PAGE` in `main.ts`); sotto, "Mostrate N di M" (`#shownCount`, `res.shown`) e il pulsante "Carica altri" (`#more`, `res.loadMore`), che ne aggiunge altre 10. Vale per la vista collezione, la vista per espansione e le mancanti; varrà anche per i mazzi della funzione 4.
- Ordinamento, filtri, ricerca, riepiloghi ed export lavorano sempre sulla lista completa (`S.results` / `S.view`; gli export su tutte le carte filtrate, `matching()`), mai solo sulle 10 mostrate; ogni cambio di filtro, ordinamento o ricerca riparte da 10.
- Dopo "Carica altri" il focus va sulla prima carta aggiunta, **senza** aprire la scheda (`focusNoSheet`).

## Rispolvera una carta: pagina "Carta dimenticata" (riprogettata il 2026-10-07)

- **Pagina a sé** (`#viewDust`, hash `#carta-dimenticata`), raggiungibile dalla testata con la voce "Carta dimenticata" / "Forgotten card" (`#navDust`, prima di Informazioni; `aria-current="page"` sulla voce attiva). Non è più nella zona del controllo rapido. Contiene:
  - il titolo e la frase "Riscopri una carta che si giocava in Pauper ma che non compare in nessun mazzo da oltre un anno" (`dust.lead`);
  - il pulsante grande "Rispolvera una carta" / "Dust off a card" (`#dustBtn`), che dopo la prima pesca diventa "Rispolverane un'altra"; sotto, solo con la collezione, l'interruttore "Pesca tra tutte le carte" (`#dustAll`);
  - la **scena** (`#dustResult .dust-scene`), con la carta al centro e i dettagli accanto (sotto su mobile).
- **Pulsante** (rifatto il 2026-10-07, perché la scritta non sembrava da premere):
  - pieno di colore (sfumatura dell'accento), in rilievo (bordo inferiore `--btn-ledge` che si abbassa alla pressione), alto 68 px (72 px e largo quanto lo schermo su mobile), testo 1,25 rem;
  - icona originale di un piumino (manico, ghiera, tre piume), che oscilla al passaggio del mouse;
  - tre **ragnatele** agli angoli (`.bweb`, una per angolo, versione ridotta di `cobwebs`). A riposo oscillano appena; alla pressione si strappano (classe `sweep`) insieme all'inizio della sequenza, senza farla aspettare, e 0,7 s dopo che la carta è visibile se ne generano di nuove, in dissolvenza (classe `regrow`);
  - focus da tastiera: contorno di 3 px nel colore del testo, staccato di 5 px. Contrasto del testo: 6,4:1 in chiaro, 7,8:1 in scuro;
  - con `prefers-reduced-motion` niente movimento: le ragnatele restano ferme e la pesca parte subito.
- Prima della pesca la scena mostra una **cornice vuota** (`button.dust-empty`, nessuna immagine né retro di carta) con polvere e ragnatele ferme (`dustCover(true)`, classe `still`, visibile anche con `prefers-reduced-motion`) e la scritta "Tocca per rispolverare": anche la cornice si tocca per pescare.
- Logica in `lib/dust.ts` (testata), interfaccia e animazione in `ui/dust.ts`.
- **Carte ammesse** (`dustPool`): legali oggi, non terre base, almeno `DUST_MIN_DECKS = 20` mazzi (main+side) nello storico, nessuna apparizione negli ultimi `DUST_QUIET_DAYS = 365` giorni contati dalla data dei dati. Al 2026-10-06: **203 carte**.
- **Pesca**: con la collezione tra le carte possedute (interruttore "Pesca tra tutte le carte"); senza collezione tra tutte. Nessuna ripetizione nella sessione (oracle_id in sessionStorage `pauper-index:dusted`, cancellato anche da "Cancella i miei dati"); quando sono finite si ricomincia, con un avviso. Se nessuna carta posseduta è dimenticata, la scena lo dice (prima, al primo clic non compariva nulla: corretto).
- **Dettagli**: immagine (la printing posseduta, altrimenti quella di riferimento; un clic apre gli artwork), mazzi nello storico tra prima e ultima apparizione, **anno di massima diffusione** in percentuale dei mazzi di quell'anno (`y` / `yt`), ultima apparizione più recente tra MTGO e cartaceo con il link al torneo, possesso. Tolti i pulsanti "Chiudi" e "Rispolverane un'altra" dentro il risultato, perché c'è il pulsante grande.
- **Animazione** (circa 0,9 s, vedi "Carta dimenticata: fluidità"): la polvere copre la carta vecchia, le due carte si scambiano in dissolvenza, il velo scivola via, i granelli volano e le ragnatele si strappano (in alto a sinistra, poi in basso a sinistra, poi a destra). Solo elementi sovrapposti: l'immagine non ha mai filtri (regole di Scryfall); a fine animazione la copertura viene rimossa. Con `prefers-reduced-motion` nessuna copertura e niente 3D: la carta cambia subito.
- Fotogrammi di controllo: `npm run dust-frames` (desktop e mobile, 5 istanti più la fine, dalla pagina `#carta-dimenticata`).

## Carta dimenticata: soglia dei mazzi (2026-10-15, passo B)

- Sotto il pulsante "Rispolvera una carta": "Apparsa in almeno [20] mazzi" (`#dustMin`, riquadro numerico, testo a 16 px, almeno 1; nome accessibile dall'etichetta che lo racchiude) con accanto quante carte si possono pescare (`#dustMinCount`, `aria-live`): "198 carte da pescare", con la collezione "N delle tue carte da pescare" (o tutte, con "Pesca tra tutte le carte").
- **Conteggi verificati sul sito** (dati all'11 ottobre, senza collezione): almeno 10 → 319, 20 → 198, 50 → 97, 100 → 47, 250 → 22, 500 → 13, 1000 → 4.
- **Nessuna carta** con la soglia scelta: il pulsante e la cornice vuota si disattivano e la riga dice il motivo ("Nessuna carta apparsa in almeno N mazzi è ferma da oltre un anno: prova un numero più basso."; con la collezione "Nessuna delle tue carte…").
- La soglia è un filtro che nasconde carte: **mai salvata**, a ogni visita riparte da 20 (`DUST_MIN_DECKS`). Al cambio il pool (`dustPool(d, { ...DUST_RULES, minDecks })`) e la carta pescata in anticipo si ricalcolano; l'elenco delle carte già viste nella sessione (`pauper-index:dusted`) resta unico, quindi **nessuna ripetizione anche cambiando soglia**.
- **Test**: Vitest su `dustPool` con la soglia (inclusa, troppo alta, minima); Playwright: conteggio, pulsante e cornice disattivati con il motivo, carta pescata con almeno quei mazzi, nessuna ripetizione cambiando soglia, valore non salvato; con la collezione conteggio delle tue carte e "Pesca tra tutte le carte". I test che premono "Rispolvera" con la collezione sintetica (che non ha carte dimenticate) attivano prima "Pesca tra tutte le carte".

## Testata (2026-10-07)

- **"Carta dimenticata"** (`#navDust`, classe `navdust`) è un pulsante compatto nello stile del pulsante grande della pagina:
  - pieno di colore, in rilievo (`--btn-ledge`), con l'icona del piumino e una piccola ragnatela nell'angolo in alto a destra (`.nd-web`, versione semplificata di `cobwebs`, generata all'avvio), che oscilla appena;
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

## Cerca una carta (2026-10-15, passo A4; sostituisce il controllo rapido)

- **Un solo campo** `#search` (`ui/search.ts`, combobox ARIA con `#searchList`, testo a 16 px, `enterkeyhint="search"`), in una riga sua sopra i filtri, al posto del controllo rapido (`ui/quick.ts` tolto; `lib/quick.ts` resta: indice dei nomi, suggerimenti, possesso) e della ricerca dell'elenco.
  - Mentre si scrive **filtra l'elenco** (come prima la ricerca: `S.query`, anche con i nomi italiani) e **suggerisce tutte le carte**, anche mai giocate (`cardnames.json` e i nomi italiani, compresi `itnames-other.json`, si scaricano al primo uso del campo). Nessun suggerimento è evidenziato finché non si usano le frecce.
  - **Invio**: con un suggerimento evidenziato (frecce) o con un **nome esatto** (anche italiano, anche di una faccia) apre la scheda; con un testo parziale chiude suggerimenti e tastiera (`blur`) e lascia l'elenco filtrato. Invio prima che i suggerimenti siano pronti: resta in attesa **solo per il nome esatto** (`pending`).
  - Scelta di un suggerimento: nel campo resta il nome cercato (italiano se cercato in italiano), che trova la carta nell'elenco.
  - **Esc**: prima chiude i suggerimenti, poi svuota il campo. Il campo è `type="search"`: senza `preventDefault` Chromium lo svuotava già al primo Esc (difetto trovato dai test).
  - Su mobile i suggerimenti coprono l'elenco: **toccare fuori** (`pointerdown`) o **scorrere** (`touchmove`, che chiude anche la tastiera) li chiude e l'elenco filtrato resta visibile.
  - **Difetto corretto** (dal controllo rapido): all'arrivo di tutti i nomi i suggerimenti si ridisegnavano e la scelta fatta con le frecce tornava al primo; ora la voce scelta si ritrova per carta e nome cercato. Test "i nomi che arrivano mentre si sceglie con le frecce non cambiano la scelta" (con `cardnames.json` trattenuto).
  - Evento GoatCounter `controllo-rapido` (stesso nome, per non spezzare la dashboard): **apertura della scheda dal campo**.
- **Scheda** (`ui/sheet.ts`): oltre a statistiche, copie tipiche, ultime apparizioni MTGO e cartacea con il link e possesso, ora anche **legalità** sempre nel titolo (`quick.legal.*`), **set d'ingresso**, **printing possedute** ("LEA #161 it ×1"), "Carica la collezione per sapere se la possiedi" quando manca la collezione (`noCollection`), nomi italiani anche con l'interfaccia in inglese se la carta è stata cercata in italiano (`itForce`). **Carte mai giocate**: scheda ridotta (`openNeverSheet`): nome, legalità, nomi italiani, "Mai giocata in Pauper", possesso per nome.
- **Nota quando l'elenco non trova la carta** con i filtri attivi: "Nessuna carta dell'elenco corrisponde a «…» con i filtri attivi. Apri la scheda di X" (`search.noneInList`, `#openFromNote`; X = nome esatto o primo suggerimento, anche mai giocata). Quando arrivano tutti i nomi la nota si ridisegna (`ready`), così trova anche le carte mai giocate.
- **Pannello "⋯"**: si chiude anche al cambio di pagina (`hashchange`, `popstate`: link, "indietro" del browser, gesto di Android), con un test.
- **Test**: i test del controllo rapido sono diventati test del campo unico (stessi casi: carta giocata, mai giocata, bannata, collezione, nomi italiani, Invio in anticipo, nomi che arrivano dopo la scelta) più Invio parziale, Esc in due passi, tocco fuori e la nota; in `analytics.spec.ts` "brainst" + Invio è diventato il nome esatto "Brainstorm" + Invio (con le nuove regole un testo parziale non apre la scheda); `typeSearch` in `smoke.spec.ts` scrive nel campo e chiude i suggerimenti.
- **Misure dopo A4** (375×667): prima carta a 701 px senza collezione e 555 con la collezione; desktop 470 e 456 (stamattina 548 e 472 con il riepilogo dei prezzi).

## Testata (2026-10-15, passo A2; sostituisce in parte "Testata" del 2026-10-07)

- **Una riga anche su mobile**: logo, nome, pulsanti speciali, "⋯". Misure (375×667 e 320×568): testata **51 px** (prima 124 su tre righe), nessuno scorrimento orizzontale; desktop 52 px come prima. Sotto 360 px resta solo il logo (il nome resta come nome accessibile del link).
- **Pulsanti speciali, una famiglia** (`.special`): stessa altezza (40 px su desktop, **48 px** su mobile, con l'icona sopra e l'etichetta breve sotto), rilievo (`--sp-ledge`), angoli, focus (3 px nel colore del testo), premuti sulla propria pagina (`aria-current`); ognuno con il suo tema. Pronti per il terzo (Debutti), che non c'è finché la funzione non esiste. **Le dimensioni non cambiano mai** (verificato da un test: libro aperto = stesse dimensioni).
  - **Mazzi** (`.navbook`): libro antico. Copertina di cuoio (sfumatura `#7C4C2B` → `#4F2E18` con una grana di rumore SVG originale in un data URI, ammesso da `img-src data:`), doppia cornice dorata (`::before` piena, `::after` tratteggiata), icona SVG originale di un libro con fregio e fermaglio. Testo `#F6DE9A`: contrasto **5,4:1** nel punto più chiaro (6,6:1 al centro), uguale in chiaro e scuro. Al tocco (`:active`) e sulla propria pagina la copertina (`.book-cover`) ruota di −155° sull'asse Y e mostra le pagine (0,45 s); con `prefers-reduced-motion` cambia senza animazione.
  - **Carta dimenticata** (`.navdust`): invariata nel tema (blu, piumino, ragnatela).
- **"⋯"** (`#navMore`, solo sotto 761 px): apre `#navExtra` con Informazioni, IT/EN e tema (righe da 44 px). `aria-expanded`/`aria-controls`; all'apertura il focus va alla prima voce, Esc chiude e riporta il focus su "⋯", toccare fuori o scegliere un link chiude. Su desktop `#navExtra` resta in riga come prima. Stessi elementi e stessi ID in entrambi i casi (cambia solo il CSS).
- **Riga dei dati** corta: "Ultimo torneo: 11 ott (8 giorni fa) · 156.550 mazzi" (dal 2026-10-19 con l'età, calcolata nel browser: `fmtAgo`, "oggi", "ieri", "N giorni fa"; data corta `fmtDateShort`; una riga anche a 320 px; prima "Ultimo torneo: 11 ott 2026 · …"; `data.line`; niente "Dati al 11 ott", che in italiano richiederebbe l'elisione). Numero di tornei, mazzi e data dell'aggiornamento sono nella frase "I dati" di Informazioni (`about.data.text`, ora "ultimo aggiornamento: {date}" invece di "il {date}", che dava "il 11").
- **Test**: `navClick` in `smoke.spec.ts` apre "⋯" quando Informazioni, lingua o tema non sono visibili (mobile); test nuovi sulla testata e sul libro con `prefers-reduced-motion`.
- **Difetto, corretto in A4** (vedi "Cerca una carta"): nel controllo rapido, se tutti i nomi arrivano mentre si sceglie con le frecce, l'elenco si ridisegna e torna al primo suggerimento (test "controllo rapido: carta giocata senza collezione, tastiera", 1 fallimento su 16 con la macchina carica).

## Ragnatele (2026-10-07)

- **Stile**: combinazione dei tre proposti (A polverosa a strati, B filo sottile, C groviglio), scelta dall'utente. Il confronto è in `.cache/screenshots/ragnatele-confronto.png`; il prototipo in `.cache/cobweb/`.
- **Generatore** `ui/cobweb.ts`, `cobwebs(W, H, angoli, dettaglio)`. Crea elementi DOM (mai markup) ed è casuale a ogni uso. Ogni angolo è un riquadro HTML grande quanto la sua ragnatela (`.cw-corner`), e dentro il velo e i 4 frammenti sono SVG separati: si animano solo `transform` e `opacity` di questi livelli, mai il contenuto degli SVG. Per ogni angolo:
  - velo di polvere a ventaglio (rumore SVG con una maschera sfumata);
  - groviglio di fili tesi a caso vicino all'angolo;
  - tela a raggi vecchia e rotta: spaziature irregolari, spirale che cede verso il basso dello schermo, tratti spezzati che penzolano, ancoraggi ai bordi, grumi di polvere sfocati;
  - fili lunghi che cedono, con riflessi di luce (tratteggio bianco).
- **Fili**: tra mezzo pixel e un pixel, in 3 livelli di opacità (`--silk`), con un'ombra sottile (`--silk-shadow`) che li rende visibili anche in tema chiaro.
- **Dettaglio**: 1 nella scena (280×390, tre angoli); 0,6 nel pulsante grande (riquadri di 44 px per angolo, senza velo); 0,3 nella testata (un angolo, 26 px).
- **Animazioni** (solo `transform` e `opacity`):
  - oscillazione a riposo appena percettibile (`cw-sway`, 4,5–7 s, fase casuale);
  - alla spazzata (`.go` o `.sweep`): l'angolo si tende (`cw-tense`), i fili, divisi in 4 frammenti per settore, si strappano e volano via dissolvendosi (`cw-tear`), il velo svanisce e si alza una nuvoletta di polvere (`cw-puff`).
- Con `prefers-reduced-motion` nulla si muove. La copertura della carta aspetta solo le animazioni finite: l'oscillazione è infinita e viene sostituita dallo strappo.

## Carta in 3D (2026-10-07)

- `ui/tilt.ts`, `enableTilt(stage)`: si attiva alla fine della spazzata (o subito se la carta è mostrata senza animazione), mai con `prefers-reduced-motion`.
- **Comportamento**:
  - con il mouse la carta segue il cursore: il punto sotto il puntatore viene verso chi guarda, al massimo 10° su X e su Y, con un leggero sollevamento (scala 1,035, ombra più profonda);
  - quando il cursore esce torna dolcemente piatta e a riposo resta piatta (nessuna `transform` in linea);
  - al tocco segue il dito finché è appoggiato e torna piatta al rilascio. `touch-action: none` vale solo sulla carta, quindi fuori dalla carta la pagina scorre normalmente; un tocco trascinato oltre 8 px non apre la scheda. Niente giroscopio.
- **Regole di Scryfall**: nessun riflesso né livello sopra l'immagine; la profondità viene solo dall'ombra (`box-shadow`), che si sposta al contrario del lato sollevato.
- **Prestazioni**: solo `transform` e `box-shadow` aggiornati con `requestAnimationFrame` (avvicinamento morbido); `getBoundingClientRect` solo all'inizio dell'interazione.
- Fotogrammi: `node scripts/tilt-frames.mjs` → `.cache/screenshots/carta3d-*`.

## Carta dimenticata: fluidità (2026-10-07)

- **Diagnosi** (`node scripts/dust-perf.mjs`; video e misure in `.cache/screenshots/rispolvera-video-*` e `rispolvera-misure-*.json`), cause dello scatto e della lentezza:
  - la scena veniva ricreata a ogni pesca: la carta vecchia spariva di colpo e la nuova compariva solo dopo il download dell'immagine (circa 200 ms di cornice vuota, con titolo e dettagli già cambiati);
  - alla prima pesca la cornice passava da centrata (cornice vuota in colonna) ad affiancata ai dettagli: layout shift 0,149 su mobile e 0,022 su desktop a ogni pesca;
  - la sequenza era in serie: 460 ms di ragnatele del pulsante, poi l'attesa dell'immagine, poi 2 s di spazzata (circa 2,4 s in tutto);
  - animazioni che ridisegnavano a ogni fotogramma: `mask-position` del velo, `left` della nuvola sfocata (`filter: blur`), 80 granelli e i frammenti delle ragnatele animati **dentro** SVG con filtri di rumore. Con la CPU rallentata 6×: 137 layout, 206 rasterizzazioni (243 ms) e 360 paint (183 ms) in una pesca;
  - l'inclinazione 3D si azzerava di colpo, perché la carta veniva ricreata.
- **Correzioni** (`ui/dust.ts`):
  - **scena fissa**, mai ricreata: cornice di dimensioni fisse, con lo stesso elemento per la cornice vuota e per la carta e il layout affiancato anche prima della pesca (con il testo `dust.emptyInfo`), dettagli con altezza minima;
  - **due livelli d'immagine** (`img.card`: `card-cur` visibile, `card-in` / `card-out` in dissolvenza);
  - **carta successiva scelta in anticipo** (`pickCard`, senza segnarla come vista; `commitCard` alla pressione), con l'immagine già scaricata e decodificata (`Image().decode()`) e la copertura già generata;
  - **sequenza sovrapposta**, circa 0,9 s: la polvere copre la carta vecchia (0,16 s), le carte si scambiano sotto la polvere (0,06–0,32 s), i dettagli cambiano sotto la polvere (0,15 s), il velo scivola via (0,16–0,66 s), le ragnatele si tendono e si strappano (fino a circa 0,85 s), poi la copertura viene rimossa;
  - **solo transform e opacity**: il velo si sposta con `translateX` (maschera sfumata fissa), granelli come elementi HTML, nuvola senza blur, ragnatele a livelli. Filtri di rumore e sfocature restano solo su elementi fermi;
  - una **nuova pressione** durante l'animazione salta subito alla fine (`running.finish()`: le animazioni finite vengono completate e la copertura rimossa);
  - **inclinazione 3D**: `tilt.pause()` la riporta piatta dolcemente (circa 150 ms) e la disattiva durante l'animazione; `resume()` alla fine;
  - se l'immagine non è pronta (prima pesca senza precaricamento, rete lenta) la spazzata aspetta sotto la polvere, al massimo 2,5 s.
- **Risultati** (CPU rallentata 4×, 3 pesche): prima 2,3–2,4 s per pesca e layout shift 0,149 su mobile; dopo 0,89–0,97 s, 0 fotogrammi persi e layout shift 0. Lavoro di disegno con CPU rallentata 6× (una pesca, mobile): layout 137 → 64, rasterizzazioni 243 → 55 ms, paint 183 → 44 ms. Il conteggio dei fotogrammi persi in headless è ottimistico, perché il rallentamento agisce solo sul thread principale: per questo c'è anche la traccia del disegno.

## Funzione 4: mazzi (dati e archetipi, passo 2)

- **Pipeline** `decks.py`, chiamata da `build`: `data/decks-61.json` (887 KB, **159 KB gzip**) e `data/decks-365.json` (4,8 MB, **823 KB gzip**, solo su richiesta nel sito). Niente finestra a due anni.
- **Formato** (v2 dal 2026-10-15; v1 prima): `{v, days, anchor, basics, t, a, f, l}`.
  - `basics`: indici delle 6 terre base normali (Plains, Island, Swamp, Mountain, Forest, Wastes), sempre disponibili; le Snow-Covered contano come carte normali.
  - `t`: tornei per identificativo stabile (`AAAAMMGG * 100 + progressivo nel giorno`), con `[data, nome, Tournament.Uri, "m"|"p"]`.
  - `a`: archetipi per identificativo stabile (`c<n>` curato, riga di `archetypes.csv`; `a<n>` automatico, dal registro; `x<colori>` non classificato) → `[nome, colori, tipo, famiglia]` (famiglia `""` per i non classificati; v2).
  - `f` (v2): famiglie presenti nel file → `[nome, tier (1–3, 4 = Altri), quota a 61 giorni in centesimi di punto percentuale, carta simbolo (indice in cards.json), lista tipica (indice in l)]`. Famiglia: `c<n>` per un archetipo curato e tutte le sue varianti di colore (n = prima riga del nome nel CSV, come l'identificativo), `a<id>` per un gruppo automatico. Tier, quota e carta simbolo sono uguali nei due file (calcolati una volta); la lista tipica è del file. Vedi "Tier e carte simbolo".
  - `l`: una riga per lista distinta (main e side uguali = stessa lista), nella forma `[archetipo, colori, main, side, apparizioni]`. Main e side sono coppie piatte `indice carta in cards.json, copie`; le apparizioni sono `[torneo, piazzamento]`. Le liste sono ordinate per prima apparizione.
  - Mai `Player` né `AnchorUri`. Si scartano i main con meno di 40 carte (12 mazzi in un anno). Le carte sono indici di `cards.json`: il formato serve anche al Brewing.
- **Peso del v2**: +6 KB grezzi e +1,5 KB gzip per decks-61.json, +8 KB e +2 KB per decks-365.json (101 e 133 famiglie al 2026-10-15).
- **Crescita del repository** misurata committando due giorni consecutivi: circa **7 KB al giorno** per i due file, perché le righe di una lista non cambiano quando la finestra si sposta (identificativi stabili). Si committano entrambi.
- **Colori del mazzo**: almeno 4 copie di carte non terra che richiedono il colore nel costo di mana (senza mana phyrexiano), e almeno una terra del mazzo che lo produce. Per questo `Card` ha i campi `colors` e `produces`. Esempio: Sneaky Snacker ({U}{B}) nel Red Madness non rende il mazzo UB.
- **Archetipi**, in due livelli. Sono assegnati sulla finestra di un anno, quindi una lista ha lo stesso archetipo in tutti i file:
  1. **curati**: `data/manual/archetypes.csv` (`nome,carte,minimo`), scritto da zero con nomi comuni della comunità e carte chiave scelte tra quelle caratteristiche del nostro raggruppamento. **Niente da MTGOFormatData**, che non ha licenza. Una lista prende il nome se il main contiene almeno `minimo` carte chiave; a parità vince la quota più alta di carte chiave, poi l'ordine del file. Dipende solo dalla lista. Una carta sconosciuta nel CSV fa fallire la build (le carte chiave si risolvono con lo stesso indice dei nomi delle decklist: prima un difetto faceva puntare "Tolarian Terror" alla faccia di una carta "prepare").
     - **Nomi secondo le convenzioni della comunità** (MTGGoldfish), rivisti dall'utente il 2026-10-08. Più righe con lo stesso nome sono alternative (Faeries, Affinity): ogni riga ha quota piena quando tutte le sue carte ci sono, così l'archetipo vince sulle liste ibride.
     - **Colonna `colori`** (`1`): solo per Affinity, Faeries e Terror il nome porta davanti i colori calcolati della lista ("Dimir Faeries", "Grixis Affinity", "Izzet Terror"), con i nomi standard (Mono-White … Temur; 4 e 5 colori: "Four-Color", "Five-Color"). Identificativo `c<n><colori>` (per esempio `c6UB`), dove n è la prima riga con quel nome. Gli altri archetipi restano senza prefisso;
  2. **automatici**, per le liste non coperte. Registro `data/reviews/archetipi-auto.json` (committato, non pubblicato): ogni gruppo ha id, nome **fissato alla creazione** (2 carte caratteristiche non terre, cioè frequenti nel gruppo e rare fuori), colori e **nucleo fisso** (carte presenti in almeno metà delle liste, in oracle_id).
     - Ogni lista va nel **primo gruppo registrato** con Jaccard (carte non terra del main) ≥ 0,40 rispetto al nucleo.
     - Le liste rimaste formano gruppi nuovi (raggruppamento a soglia 0,45, almeno 6 apparizioni), che si aggiungono in fondo al registro; poi vengono assegnate con la stessa regola.
     - Le liste non assegnate restano "non classificate" (solo colori).
- **Stabilità verificata**: classificando la finestra di 7 giorni prima e poi quella di oggi con lo stesso registro, il 100% delle 3.882 liste in comune ha mantenuto il nome. Prima della regola "primo gruppo e nucleo fisso" era l'89,6%. Un archetipo che cambia molto nel tempo può dare origine a un gruppo nuovo, con un altro nome: per i mazzi principali i nomi curati lo evitano.
- **Report** `data/reviews/archetipi.md`: tabella degli archetipi a 61 giorni, per rivedere i nomi.
- **Nomi decisi dall'utente il 2026-10-15** (passo 4):
  - **Golgari Gardens** (riga nuova in fondo: Khalni Garden, Crypt Rats, Troll of Khazad-dûm, Avenging Hunter, minimo 3; senza prefisso di colore): prende la parte nera del gruppo automatico "Crypt Rats + Troll of Khazad-dûm" (a6, che resta nel registro con 2 mazzi). Prende anche le liste nero-rosso-verde con la stessa base (Khalni Garden, Troll, Eviscerator's Insight, Writhing Chrysalis; 4 mazzi a 61 giorni, 79 in un anno), che non hanno Cleansing Wildfire né Krark-Clan Shaman. Verificato: **nessuna lista di Jund Wildfire cambia nome**, né a 61 giorni né in un anno.
  - **Ruby Storm** (riga 14, prima "Storm", stesso identificativo `c14`): carte chiave Goblin Anarchomancer, Thornscape Familiar, Big Score, Seething Song, minimo 2. È il nome della comunità per questo mazzo; Ruby Medallion non c'entra. Tutte le liste "Storm" sono diventate "Ruby Storm" (77 mazzi a 61 giorni, 400 in un anno), nessuna è rimasta fuori.
  - **"Search Party Captain + Phyrexian Walker"** (a72, 89 mazzi a 61 giorni) **non** è Mono-White Aggro: delle 15 carte più giocate ne condividono 6 (Plains, Thraben Inspector, Leonardo, Novice Inspector, Spider-Man, Ramosian Rally); è un mazzo di artefatti (Salt Road Packbeast, Ornithopter, Phyrexian Walker, Martyr's Soul, Halo Hopper, Search Party Captain, Khalni Garden), mentre Mono-White Aggro gioca Battle Screech, Raffine's Informant, Prismatic Strands, Kor Skyfisher, Guardians' Pledge, Thraben Charm. Resta automatico finché l'utente non sceglie un nome.

## Sezione "Mazzi" (funzione 4, passo 3, 2026-10-08)

- **Dal 2026-10-16** la pagina si apre sulla tier list e le liste stanno nella pagina di ogni archetipo: vedi "Tier list e pagina dell'archetipo". Il resto di questa sezione vale per la pagina dell'archetipo.

- **Pagina** `#mazzi` (`#viewDecks`), voce "Mazzi" / "Decks" in testata (`#navDecks`, link discreto come "Informazioni", con `aria-current`). Logica pura in `lib/decks.ts` (testata), interfaccia in `ui/decks.ts`.
- **Dati**: `data/decks-61.json` (159 KB gzip) si scarica solo all'apertura della pagina; `data/decks-365.json` (823 KB gzip) solo se si sceglie "Ultimo anno" (il menu dice "circa 0,8 MB da scaricare"). Entrambi in `PUBLIC_DATA`. Se il file manca o non è coerente con `cards.json` (`validDecks`), compare "Mazzi non disponibili" con "Riprova". Si scartano nel sito le liste con il main di sole terre base (per esempio 60 Island: segnaposto di chi non ha registrato la lista; 1 a 61 giorni, 4 in un anno). Calcolo nel browser sul thread principale, **nessun web worker** e CSP invariata: le misure del passo 4 (vedi "Funzione 4: rifinitura") danno al massimo circa 0,6 s di blocco su un telefono lento con "Ultimo anno".
- **Controlli**: periodo (61 giorni / ultimo anno, non salvato: si riparte sempre da 61), archetipo (tutti quelli del periodo con il numero di liste, dal più frequente; i non classificati in fondo con i colori), completamento minimo (qualsiasi, 50, 75, 90%, solo completi) e "Solo main" / "Main e side" (predefinito main e side; **unica scelta salvata**, in `localStorage` `pauper-index:deckSide`). Archetipo e minimo sono filtri che nascondono mazzi: mai salvati. Minimo e main/side compaiono solo con la collezione; senza c'è un invito a caricarla con il link alla pagina principale.
- **Ordine**: senza collezione per ultima apparizione; con la collezione per completamento; a parità più apparizioni, poi la data più recente.
- **Completamento** (`completion`): per ogni carta il minimo tra copie possedute (`collectionIndex`, stessi Binder inclusi e proxy della pagina principale) e copie richieste; con "Main e side" la stessa carta in main e side somma le copie. Le 6 terre base normali (`basics`) sono escluse e sempre disponibili; le Snow-Covered contano come carte normali.
- **Ogni mazzo**: pallini dei colori (gli stessi del pannello "Filtri", non simboli di mana; nome dei colori per i lettori di schermo) e nome dell'archetipo ("Non classificato" per i gruppi `x`), "compare N volte"; con la collezione barra, percentuale e "N di M carte"; migliore piazzamento con torneo (link), MTGO o cartaceo e data, più "ultima volta il …" se diversa. **Migliore piazzamento** (`placementScore`): il posto più basso; un record senza sconfitte (le 5-0 delle League) vale come subito dopo la top 8; a parità il più recente (decisione nostra).
- **Mancanti** (con la collezione): "Ti mancano N carte" (copie), costo indicativo (printing non foil più economica × copie, come la colonna Prezzo; "N senza prezzo"), le prime 8 carte dalla più mancante con il prezzo, poi "e altre N, segnate nella decklist"; "Copia la lista". Mazzo completo: "Hai tutte le carte di questo mazzo".
- **Decklist** (`<details>`): main per tipo (creature, poi terre anche artefatto, planeswalker, istantanei, stregonerie, battaglie, artefatti, incantesimi; tipo della prima faccia) e sideboard. Con la collezione: ✓ sulle carte possedute, in rosso con "mancano N" le copie mancanti (le copie possedute si assegnano prima al main, poi al side). Ogni nome apre la scheda della carta (stessi gestori della tabella: passaggio del mouse, tocco, tastiera), con il possesso dalla collezione.
- **Export** per mazzo: "Copia la decklist", "Scarica la decklist .txt" (`mazzo-<archetipo>.txt` / `deck-<archetype>.txt`), "Scarica le mancanti .txt" e "Copia la lista" delle mancanti. Decklist nel **formato di MTG Arena** (scelto dall'utente: il file `reference/private/mazzo-esempio.txt` non c'è): "4 Nome", una riga vuota, "Sideboard", il side; sempre il mazzo intero, terre base comprese; nomi inglesi come in MTG Arena, in base al **layout di Scryfall** e non al " // " nel nome (campo `dn` di `cards.json`, dal 2026-10-15): nome completo per le carte divise (`split`, `aftermath`: "Fire // Ice"), solo la prima faccia per tutte le altre con più facce (transform, modal_dfc, flip, adventure, omen, prepare…: "Delver of Secrets", "Fang Dragon"). La lista delle mancanti tiene il nome completo. L'utente verifica l'import in ManaBox copiando un mazzo dal sito. Mancanti: "N Nome", nello stesso ordine dell'elenco.
- **Riepiloghi**: il titolo conta tutte le liste del periodo ("4218 liste di mazzi"), con mazzi e tornei e, con la collezione, quante sono complete e quante almeno al 75%; se archetipo o minimo ne mostrano meno, la nota "N mostrate con i filtri attivi: …" con "Togli questi filtri". "Carica altri" a 10 per volta, con il focus sul primo mazzo aggiunto.
- **Aggiornamento**: la pagina si ridisegna quando cambiano collezione, lingua o prezzi (senza tornare alle prime 10 solo per i prezzi: `refresh` ricalcola e ridisegna).
- **Screenshot**: `node scripts/decks-shots.mjs <etichetta> [it|en]` → `.cache/screenshots/mazzi-*` (senza e con collezione, pagina intera, decklist aperta; desktop e mobile, chiaro e scuro). La collezione degli screenshot è sintetica (carte delle liste più frequenti, con alcune copie tolte).

## Funzione 4: rifinitura (passo 4, 2026-10-15)

- **Archetipi**: Golgari Gardens e Ruby Storm (vedi "Nomi decisi dall'utente il 2026-10-15" in "Funzione 4: mazzi"). Su un anno restano fuori da Golgari Gardens due gruppi automatici più vecchi: "Crypt Rats + Troll of Khazad-dûm" (73 mazzi: liste di sacrificio con Blood Fountain e Refurbished Familiar, Khalni Garden nel 29%) e "Defile + Crypt Rats" (40 mazzi, soprattutto nero-verdi: Khalni Garden 95%, Troll 12%). Da nominare solo se l'utente lo decide.
- **Gruppi automatici con più di 30 mazzi negli ultimi 61 giorni** (al 2026-10-15): "Search Party Captain + Phyrexian Walker" (89, W), "Ragged Short Spear + Soul-Guide Lantern" (47, WBR), "Omen of the Dead + Oroku Saki, Shredder Rising" (44, WB), "Sandstorm Eidolon + Aurora Eidolon" (39, WR).
- **Export**: nomi della decklist secondo il layout (campo `dn`), vedi "Sezione Mazzi".
- **Misure del calcolo** (`node scripts/decks-perf.mjs <etichetta> [1,4,6]`, iPhone 13 emulato, collezione sintetica, dati del 2026-10-15: 4.693 liste a 61 giorni, 23.258 in un anno). Tempo dal gesto al fotogramma disegnato, tra parentesi il task più lungo del thread principale:

  | Passo | 1× (dopo) | 4× (dopo) | 6× prima | 6× dopo |
  |---|---|---|---|---|
  | apertura (61 giorni, con download) | 151 ms (0) | 405 ms (165) | 619 ms (297) | 630 ms (283) |
  | "Ultimo anno" (download, lettura, calcolo) | 310 ms (110) | 836 ms (485) | 1411 ms (979) | 1282 ms (800) |
  | "Solo main" (un anno) | 125 ms (50) | 344 ms (240) | 800 ms (644) | 502 ms (396) |
  | "Main e side" (un anno) | 125 ms (68) | 413 ms (296) | 1045 ms (901) | 769 ms (631) |
  | archetipo (un anno) | 73 ms (0) | 222 ms (121) | 443 ms (272) | 476 ms (281) |

  "Prima" e "dopo" si riferiscono alla correzione del passo 4 in `lib/decks.ts`: `completion` con cicli semplici, senza `Map` né array copiati per ogni lista (in Node, un anno con il side: da 49,5 a 24,7 ms; solo main da 38,6 a 11,6 ms), e `sortDecks` con le chiavi calcolate una volta e il confronto diretto delle date ISO (da 20 a 11 ms). Risultati verificati identici ai precedenti su tutte le liste di 61 giorni e di un anno, con quattro collezioni diverse, solo main e main più side. Tolta `required()`, non più usata. Il web worker non serve: il blocco più lungo resta sotto 0,7 s anche con il processore rallentato 6×.
- **Mobile con i dati reali** (iPhone SE e iPhone 13, 61 giorni e un anno, chiaro e scuro): nessuno scorrimento orizzontale; archetipi nuovi nel menu (Golgari Gardens 73 liste, Ruby Storm 58 a 61 giorni); decklist esportata con "4 Delver of Secrets", "1 Sagu Wildling", "2 Tithing Blade". Screenshot: `node scripts/decks-shots.mjs passo4` → `.cache/screenshots/mazzi-passo4-*`.
- **Test della "Carta dimenticata"**: "passaggio fluido" non misura più il tempo a orologio. Registra ogni animazione CSS finita che parte nella scena (`animationstart`) e verifica che ritardo più durata (`endTime`) stiano entro 1 s e che compaiano le fasi principali (card-in, film-off, dust-fly, cw-tear); poi che la sequenza arrivi alla fine (tempo d'attesa largo, 10 s). Il salto alla fine con una nuova pressione si verifica nello stesso istante del clic (`page.evaluate`), non con un'attesa di 300 ms. La misura reale dei tempi resta in `scripts/dust-perf.mjs`.
- **Test del conteggio** (`analytics.spec.ts`, "test automatici: nessun conteggio nemmeno sul dominio pubblicato"): alla fine `context.unrouteAll({ behavior: 'ignoreErrors' })`. Il test finiva mentre la pagina scaricava ancora file attraverso `route.fetch`, con errori "route.fetch: Test ended" fuori dai test (difetto del test, presente anche prima).

## Restyling dei Mazzi (piano approvato il 2026-10-15)

- **Piano**: tier list degli archetipi (Tier 1 ≥ 5%, Tier 2 ≥ 2%, Tier 3 ≥ 0,75% dei mazzi a 61 giorni, poi "Altri"; varianti di colore contate come famiglia; banda simmetrica del 15%, cioè si sale sopra soglia × 1,15 e si scende sotto soglia × 0,85, con il tier del giorno prima letto dal `decks-61.json` committato), pagina di ogni archetipo (`#mazzi/<id>`), illustrazione della carta simbolo (art crop con artista e riga del copyright), simboli di mana, filtri (colori, prezzo, tier), testata con i pulsanti speciali come famiglia (Mazzi come libro antico). Report all'utente solo dopo i passi 3, 5 e alla fine; commit e push dopo ogni passo.
- **Passo 3 (2026-10-15)**, pipeline: vedi "Tier e carte simbolo" e il formato v2 in "Funzione 4: mazzi".
- **Passo 1 (2026-10-15)**:
  - **Golgari Gardens**: due righe alternative in fondo a `archetypes.csv` (Khalni Garden, Cast Down, Snuff Out, Eviscerator's Insight, Fanatical Offering, tutte e 5; Khalni Garden, Writhing Chrysalis, Skred, Eviscerator's Insight, tutte e 4). Prendono le liste Gardens di "Defile + Crypt Rats" (17 delle 21 senza fog, in un anno) più 9 di "Crypt Rats + Troll" e 3 non classificate o ibride; verificato che **nessuna lista di Jund Wildfire né di "Respite + Tangle" cambia nome**, a 61 giorni e in un anno. La metà con i fog di "Defile + Crypt Rats" (19 mazzi in un anno, 0 a 61 giorni: Moment's Peace, Tangle, porte) è lo stesso mazzo di "Respite + Tangle" e resta fuori: qualsiasi carta chiave che la prende prende anche "Respite + Tangle". Cast Down distingue le Gardens (100%) dalle liste con i fog, ma non basta da sola (alcune liste di "Respite + Tangle" lo giocano).
  - **Mancanti** con i nomi della decklist (`dn`), come la decklist.
  - **Difetti corretti** (trovati da test intermittenti): all'arrivo dei prezzi `refresh()` ridisegnava l'elenco, togliendo il focus (per esempio dopo "Carica altri") e chiudendo le decklist aperte; ora `keepPlace` li ritrova per mazzo (`data-key`) e per elemento. Dopo un errore di caricamento `refresh()` riavviava il caricamento e ridisegnava "Riprova" sotto il dito; ora un caricamento in corso o fallito si riprova solo con "Riprova" (`S.pending`, `S.failed`).

## Correzioni del 2026-10-19 (prima del passo 7 dei Mazzi)

- **Fonte** (verifica, nessun cambio): Jiliac/MTGODecklistCache dal 2025-07 si aggiorna **una volta a settimana** (di solito domenica o lunedì, con i tornei fino al giorno prima). Su 2.556 commit, 31 pause di almeno 7 giorni, quasi tutte di 7–8 giorni; le più lunghe 12,0 giorni (17–29 agosto 2026) e 13,5 giorni (31 agosto–14 settembre 2026). Quindi i dati hanno normalmente da 1 a 8 giorni, fino a circa 15. Fork aggiornati (stessa ricerca dell'allarme): **brossignol/MTGODecklistCache**, fork di Badaro, aggiornato **ogni giorno** ("Added AAAA-MM-GG tournaments", ultimo il 2026-10-18), stessa struttura (`Tournaments`, `Tournaments-Archive`) ma senza la cartella `CardsRealm`; divergente da Jiliac (554 commit in più, 331 in meno). Cambiare fonte solo con il via dell'utente (andrebbero rifatte deduplica e confronti). Il sito avvisava solo oltre 21 giorni (`STALE_SOURCE_DAYS`): un avviso a 7 giorni comparirebbe quasi ogni settimana. **Deciso dall'utente** (dopo il passo 7): età sempre visibile nella riga dei dati ("8 giorni fa"), avviso nel sito e Issue dell'allarme oltre **15 giorni**; in "Come funziona" la frase "I dati" dice che i tornei arrivano una volta alla settimana e c'è la FAQ "Perché mancano i tornei degli ultimi giorni?" (`about.faq.fresh.*`). Test "riga dei dati: età sempre visibile, avviso solo oltre 15 giorni" (orologio fisso a 8, 15, 16 giorni).
- **`changed`**: date dei bulk e `seen` come campi volatili (vedi "Automazione e pubblicazione").
- **`itnames-other.json` indicizzato per nome: non fatto.** Usa gli indici di `cardnames.json`, che si spostano quando entra una carta nuova: riscritture quasi complete il 10 e il 17 ottobre (circa 160 KB in più nel pack di git ciascuna, misurato con `git pack-objects`). Con i nomi al posto degli indici il file passerebbe da 267 a 373 KB gzip (+105 KB per chi usa la ricerca in italiano). Non conviene finché le riscritture restano di qualche MB l'anno.
- **Tier list su mobile** (sotto 640 px): schede orizzontali (`.fam-card` in riga), illustrazione 4:3 larga 112 px a sinistra con l'artista sotto in forma breve ("Illustr. {nome}" / "Art: {name}", `tier.artistShort`; la forma lunga con la carta resta su desktop), a destra nome, simboli, quota, prezzo e con la collezione la lista più vicina (barra su tutta la riga); varianti nascoste. Una sola riga introduttiva: senza collezione "Carica la collezione per vedere cosa ti manca." (`decks.noCollShort*`), con la collezione nessuna; la frase sul tier diventa il link "Cosa vuol dire" accanto al primo titolo (`.tier-what`, nome accessibile `tier.whatAria`). **Misure** (`node scripts/tier-metrics.mjs <etichetta>`, iPhone SE con Arial): "Tier 1" a 306 px (prima 489), **2 archetipi interi** nel primo schermo (prima 0), schede da 106–120 px (prima 372–418), pagina di 4.306 px (prima 10.971). Desktop invariato. Test "tier list su iPhone SE".
- **Errore "Cannot read properties of null (reading 'cards')"** nella CI del 16/10: non era la causa del fallimento (il test "mazzi con la collezione" aspettava il filtro del prezzo, disattivato senza `prices.json`; corretto in `e1d11f0`). Le righe venivano dallo stderr del browser, condiviso dai test dello stesso worker e allegato al test fallito: le scriveva "Invio con un nome esatto prima che i suggerimenti siano pronti", che trattiene `cards.json`. A ogni tasto in "Cerca una carta" il callback `query` chiamava `renderResults()` con `S.d` nullo. Ora prima dei dati si ricorda solo il testo e l'elenco filtrato si disegna al loro arrivo. Il banner della prima visita compare subito, senza aspettare i dati. Test "interazioni prima che arrivino i dati" (con `cards.json` trattenuto: banner, ricerca con frecce e Invio, Mazzi, Carta dimenticata; senza la correzione dava 7 errori).
- **Prezzi "circa"** all'euro intero (`fmtEurAbout`: "circa 89 €", sotto l'euro 1 €): lista tipica e costo per completare, nella tier list e nella pagina dell'archetipo. Gli altri prezzi restano con i centesimi.

## Tier list e pagina dell'archetipo (restyling dei Mazzi, passi 4–5, 2026-10-16)

- **Indirizzi**: `#mazzi` = tier list; `#mazzi/<famiglia>` = pagina dell'archetipo (id della famiglia, per esempio `c1`, `a72`); `#mazzi/x` = liste non classificate. `route()` in `main.ts` mostra la pagina Mazzi per `#mazzi` e `#mazzi/…`; `ui/decks.ts` sceglie la vista (`routeFam`). "Indietro" del browser funziona tra le due viste.
- **Tier list** (`ui/tierlist.ts`, `#dTier`): sempre sui **61 giorni** (`decks-61.json`, anche se nella pagina dell'archetipo si è scelto "Ultimo anno"). Sezioni Tier 1, 2, 3 con una riga colorata spessa e il distintivo del tier, poi "Altri".
  - **Tier 1–3**: schede (`.fam-card`, link alla pagina dell'archetipo) con l'**art crop** della carta simbolo (`imageUrl(id, 'art_crop')`, proporzione 4:3 con `object-fit: cover`, nessun testo né sfumatura sopra l'immagine), **artista sotto l'immagine** ("Illustrazione di … (carta)"), nome e simboli di mana (20 px), quota dei mazzi e liste, varianti con la loro quota (le prime 3, con le etichette senza le parole finali comuni: `variantLabels`), prezzo indicativo della lista tipica; con la collezione barra e percentuale della **lista più vicina** (`closestDeck`: completamento più alto, a parità costo più basso) e quanto costa completarla.
  - **Altri**: righe compatte senza illustrazione, nome, simboli di mana e quota; le prime 12, poi "Mostra tutti gli altri (N)".
  - **Non classificate**: una riga in fondo ("Liste non classificate · N mazzi (x%) →"), nascosta quando un filtro è attivo.
  - Riga **"Illustrazioni ™ & © Wizards of the Coast"** (`tier.copyright`) visibile sotto la tier list e nell'intestazione della pagina dell'archetipo.
- **Filtri della tier list** (`#tierFilters` in un `<details id="tfBox">`, **chiuso su mobile**, aperto su desktop; "Filtri (N)" con N filtri attivi). Mai salvati; restano mentre si va e si torna da un archetipo nella stessa visita.
  - **Colori** con i simboli di mana, "Almeno uno dei colori scelti" / "Solo questi colori" (stesse regole del pannello "Filtri", `matchColors`): una famiglia passa se **almeno una variante** passa;
  - **Tier** (1, 2, 3, Altri), selezione multipla;
  - **Prezzo**: senza collezione "Prezzo della lista tipica" (fino a 50/75/100/150 €), con la collezione "Costo per completare la lista più vicina" (già completo, fino a 10/25/50/100 €); l'etichetta dice quale. **Disattivato finché i prezzi non arrivano** ("Prezzi in arrivo…"). Una famiglia senza prezzo noto esce dal filtro. "Già completo" vuol dire completamento al 100%, non costo zero (difetto trovato scrivendo i test: le carte mancanti senza prezzo costano 0);
  - con la collezione **completamento della lista più vicina** e "Solo main" / "Main e side" (la stessa scelta salvata della pagina dell'archetipo, `pauper-index:deckSide`);
  - **"Vai all'archetipo"**: menu con tutte le famiglie, porta alla pagina.
  - Stato premuto riconoscibile non solo dal colore: anello e spunta (`.fcheck`), `aria-pressed`.
  - **Riepilogo**: il titolo conta tutti gli archetipi ("101 archetipi"), con mazzi e tornei e, con la collezione, quanti hanno almeno una lista completa; la nota "N archetipi su M mostrati con i filtri attivi: …" con "Togli questi filtri".
- **Pagina dell'archetipo** (`#dArchHead` + i controlli e l'elenco di prima): link "← Tier list", illustrazione grande con l'artista, nome e simboli di mana, distintivo del tier, quota negli ultimi 61 giorni e numero di liste, prezzo della lista tipica, la frase sul tier con il link alla FAQ, la riga del copyright. Intestazione sempre dai dati a 61 giorni. Controlli: periodo, **variante** (`#dArch`, "Tutte le varianti (N)", nascosto se la famiglia ne ha una sola; nelle non classificate diventa "Colori"), **prezzo** (`#dPrice`: "Prezzo della lista" senza collezione, "Costo per completare la lista" con la collezione; stessi scaglioni e stessa regola di "Già completo"), completamento minimo, main/side. Il titolo conta tutte le liste della famiglia nel periodo; la nota elenca variante, prezzo e minimo. Liste, mancanti, decklist ed export come prima, "Carica altri" a 20.
- **FAQ "Cosa vuol dire il tier?"** in "Come funziona": soglie, varianti contate insieme, banda del 15% (per questo un Tier 1 al 4,5% può stare accanto a un Tier 2 al 5,5%), limiti dei dati MTGO.
- **Formato v2** letto dal sito: `a[id] = [nome, colori, tipo, famiglia]`, `f[famiglia] = [nome, tier, quota in punti base, carta simbolo, lista tipica]` (`families()` in `lib/decks.ts`).
- **Screenshot**: `node scripts/decks-shots.mjs <etichetta> [it|en]` → `.cache/screenshots/mazzi-*`: tier list (schermo e pagina intera), archetipo, tier list e archetipo con la collezione, decklist, non classificate; desktop e mobile, chiaro e scuro.

## Tier e carte simbolo (2026-10-15, restyling dei Mazzi, passo 3)

- **Tier** (`decks.py`, `TIERS = (5.0, 2.0, 0.75)`, `BAND = 0.15`, `tier_for`): quota dei mazzi della **famiglia** negli ultimi 61 giorni sul totale dei mazzi (non classificati compresi). Senza tier precedente: Tier 1 ≥ 5%, Tier 2 ≥ 2%, Tier 3 ≥ 0,75%, sotto "Altri" (4). Con il tier del giorno prima (`previous_tiers`, dal `data/decks-61.json` già committato, solo se v2): si sale a un tier solo sopra soglia × 1,15 (il più alto superato), si scende solo sotto soglia × 0,85 del tier attuale (e allora valgono le soglie pure). Simulata sugli ultimi 90 giorni: 11 cambi di tier contro 40 senza banda (21 con la variante asimmetrica). Il tier compare su ogni variante (quello della famiglia).
- **Carta simbolo**: colonna `simbolo` di `archetypes.csv`, **obbligatoria sulla prima riga di ogni nome** (le righe alternative la lasciano vuota); carta sconosciuta o mancante = build che fallisce. Per i gruppi automatici: la carta non terra con il punteggio più alto `p_dentro × (p_dentro − p_fuori)` sulle liste di un anno (`family_meta`).
- **Carte simbolo confermate dall'utente il 2026-10-15** (percentuale delle liste a 61 giorni che la giocano): Mono-Red Madness Guttersnipe 99%, Terror Tolarian Terror 100%, Affinity Myr Enforcer 91%, Tron Urza's Tower 100% (alternativa Giant's Boulder: 96% a 61 giorni, solo 30% in un anno), Faeries Spellstutter Sprite 100%, Elves Priest of Titania 100%, Spy Combo Balustrade Spy 100%, Mono-Red Rally Rally at the Hornburg 100%, Jund Wildfire Cleansing Wildfire 100%, Jeskai Ephemerate Ephemerate 100%, White Aggro Battle Screech 99%, Bogles Slippery Bogle 100%, Gruul Ponza Mwonvuli Acid-Moss 100%, Dimir Control Murmuring Mystic 89%, Golgari Gardens Khalni Garden 100%, Rakdos Madness Kitchen Imp 97%, Gruul Ramp **Utopia Sprawl** 100%, Familiars Sunscape Familiar 99%, Ruby Storm **Seize the Storm** 100% (98% in un anno), Snacker Gates Sneaky Snacker 87% (**58% in un anno**), Mono-Black Sacrifice Carrion Feeder 100%, Mardu Synthesizer Experimental Synthesizer 100%, Caw-Gates Squadron Hawk, Pestilence Pestilence, Turbo Fog Moment's Peace, Dredge Stinkweed Imp, Burn Lightning Bolt (tutte 100%). Mono-White Aggro (nuovo): **Search Party Captain** (95%), scelta nostra (dà il nome al gruppo).
- **Nomi dei mazzi bianchi** (decisi dall'utente il 2026-10-15, come MTGGoldfish): la riga curata che si chiamava "Mono-White Aggro" (Kor Skyfisher, Thraben Charm, Lunarch Veteran) si chiama **"White Aggro"**, stesso identificativo `c13`; nuova riga curata **"Mono-White Aggro"** (Salt Road Packbeast, Search Party Captain, Martyr's Soul, Phyrexian Walker, Ornithopter, almeno 3) per il gruppo automatico a72 ("Search Party Captain + Phyrexian Walker"). Verifica: **nessuna lista di White Aggro cambia nome**; entrano 87 degli 89 mazzi di a72 a 61 giorni e 148 dei 154 in un anno (più 3 non classificati); restano in a72 solo le liste con 2 delle carte chiave (2 mazzi a 61 giorni). Con le carte chiave a 2 entravano tutte, ma una lista di White Aggro cambiava nome.
- **Passo 3b (2026-10-15, decisioni dell'utente dal confronto con MTGGoldfish)**:
  - "Pestilence" si chiama **"Food Gardens"** (stessa riga `c15`, carta simbolo Pestilence): nelle 35 liste a 61 giorni Pestilence, Cauldron Familiar, Troll of Khazad-dûm, Nutrient Block, Lembas e Khalni Garden sono al 100%. **"Respite + Tangle"** (a11: fog, porte e Crypt Rats) **non** è Food Gardens e resta automatico: chiusa la domanda aperta del passo 2 della funzione 4.
  - **Ephemerate**, **Control** e **Synthesizer** diventano famiglie con i colori nel nome, come Terror, Faeries e Affinity (colonna `colori` = 1): "Jeskai Ephemerate" / "Esper Ephemerate", "Dimir Control" / "Esper Control" / "Grixis Control", "Mardu Synthesizer" / "Boros Synthesizer" / "Jeskai Synthesizer". Gli identificativi degli archetipi diventano `c4WUR`, `c19UB`, `c22WBR`…; le famiglie restano `c4`, `c19`, `c22`.
  - Colonna facoltativa **`famiglia`** di `archetypes.csv`: titolo della famiglia nella tier list quando il nome base è troppo generico. Solo Control: "Dimir Control" (80% delle liste a 61 giorni e in un anno); per gli altri il nome base (Terror, Faeries, Affinity, Ephemerate, Synthesizer).
  - **Verifica** (confronto riga per riga dei file prima e dopo): nessuna lista cambia famiglia, tier e quote identici, a 61 giorni e in un anno. Cambiano solo i nomi: a 61 giorni Food Gardens 35 mazzi, Esper Ephemerate 31, Esper Control 24, Boros Synthesizer 20, Grixis Control 6, Jeskai Synthesizer 2, Four-Color Ephemerate 2, Four-Color Synthesizer 2; in un anno Food Gardens 352, Boros Synthesizer 161, Esper Ephemerate 45, Jeskai Synthesizer 36, Esper Control 24, Grixis Control 15, più 9 liste in varianti minori.
- **Lista tipica** (`typical_list`): la lista della famiglia più vicina alla media, con la somiglianza pesata Σ min / Σ max tra le copie della lista (main e side) e le copie medie per apparizione; a parità più apparizioni, poi la più recente. Sostituisce la "lista più frequente", che spesso compare solo 2 volte.
- **Report** `data/reviews/archetipi.md`: in fondo la tabella dei tier delle famiglie, con la carta simbolo.
- **Tier al 2026-10-15** (famiglie): Tier 1: Mono-Red Madness 12,00%, Terror 10,03%, Affinity 8,59%, Tron 8,25%, Faeries 6,81%, Elves 5,35%. Tier 2: Spy Combo 4,04%, Mono-Red Rally 3,97%, Jund Wildfire 3,91%, Jeskai Ephemerate 3,12%, White Aggro 2,85%, Bogles 2,79%, Gruul Ponza 2,63%, Dimir Control 2,33%, Golgari Gardens 2,13%. Tier 3: Rakdos Madness 1,53%, Mono-White Aggro 1,37%, Gruul Ramp 1,31%, Familiars 1,26%, Ruby Storm 1,21%, Snacker Gates 1,17%, Mono-Black Sacrifice 1,03%, Mardu Synthesizer 0,76%.

## Pagina iniziale e Carta dimenticata (piano approvato il 2026-10-15)

- **Dopo l'approvazione (2026-10-16), modifiche decise dall'utente** (A–D, prima dei passi 4–5 dei Mazzi):
  - **A**: nel blocco di caricamento niente più frase: solo l'etichetta "Carica la collezione" / "Load your collection" (`load.intro`), i due pulsanti, "Come si esporta da ManaBox?" e su desktop il trascinamento. Su mobile il menu Periodo mostra solo il periodo ("Ultimo anno"), perché il numero di carte è già nel titolo subito sotto (`NARROW`, `max-width: 640px`); il segnaposto di Espansione è "Espansione". Margini ancora un poco più stretti su mobile.
  - **B, banner della prima visita** (`#welcome`, solo nella pagina principale): un riquadro in cima alla pagina, non una finestra; titolo "Come si usa", i tre passi con le stesse icone della pagina Informazioni (`howSteps()` in `ui/about.ts`), la riga "Gratis e senza registrazione: la collezione resta nel tuo browser." (`welcome.free`). La X (`#welcomeClose`, nome accessibile "Chiudi", 44×44 px) lo chiude, il focus passa a "Cerca una carta" e la scelta si salva in `pauper-index:welcomeClosed`: non ricompare; "Cancella i miei dati" la cancella e il banner torna. Con il banner aperto, su iPhone SE banner e blocco di caricamento stanno nel primo schermo (il blocco finisce a 607 px in IT, 586 in EN, anche il campo di ricerca si vede); gli obiettivi delle carte valgono a banner chiuso (`home-metrics.mjs` misura così).
  - **C**: "Informazioni" → "**Come funziona**" / "How it works" (`nav.about`, `about.title`) in testata, nel menu "⋯" e nel titolo della pagina; nel piè di pagina il link diventa "**Note legali**" / "Legal notes" (`foot.link`) e porta a `#note-legali`. `ABOUT_HASHES` in `main.ts`.
  - **D**: "Carica altri" a 100 righe (20 nei Mazzi), vedi "Carica altri".
  - **Obiettivo senza collezione: 3 carte** (quello del piano; il primo report l'aveva portato a 2 senza dirlo). Raggiunto con la frase tolta: prima carta a 441 px, terza che finisce a 666 su 667 (**margine di 1 px**). Con la collezione 3 carte, prima a 405. Il test "primo schermo su iPhone SE" ora controlla 3 carte in entrambi i casi e usa un prezzo sintetico per ogni printing (come i dati reali), così il riepilogo dei prezzi ha la lunghezza vera.

- **Misure prima** (sito pubblicato, iPhone SE 375×667; script in `.cache/measure-home.mjs`, diventerà `scripts/home-metrics.mjs`): testata 124 px su tre righe, riga dei dati 39, controllo rapido 73, caricamento 244 (riga della collezione 97), filtri 146; **prima carta a 825 px senza collezione e a 703 con la collezione** (schermo 667); righe dell'elenco 170 px. Desktop 1280×900: prima carta a 548 / 447–472 px, righe 73 px.
- **Decisioni dell'utente**:
  - un solo campo "Cerca una carta" al posto del controllo rapido e della ricerca dell'elenco: filtra l'elenco mentre si scrive, suggerisce tutte le carte; **Invio** con un suggerimento evidenziato (frecce) o con un nome esatto (anche italiano) apre la scheda, con un testo parziale chiude suggerimenti e tastiera e lascia l'elenco filtrato; l'attesa di Invio prima dei suggerimenti vale solo per il nome esatto; su mobile toccare fuori o scorrere chiude i suggerimenti;
  - righe compatte: "12% dei mazzi · di solito 4 copie · vista il 3 ott", con la collezione "ne hai 2"; nessun segno "Tua" nella vista collezione, resta il segno sulle mancanti dove l'elenco le mescola;
  - frase iniziale: cosa fa il sito, gratis, senza registrazione, la collezione resta nel browser; aiuto "Come si esporta da ManaBox?" con passi presi dalla documentazione ufficiale (mai inventati: se non si trovano, si chiedono all'utente);
  - "Ultima apparizione" nel pannello "Filtri", con la sua etichetta rimovibile;
  - su mobile i suggerimenti di "Espansione" larghi quanto lo schermo;
  - Carta dimenticata: un riquadro numerico "Apparsa in almeno … mazzi" (predefinito 20, mai salvato);
  - prima di ogni push: ruff e i test della parte toccata.
- **A5 (2026-10-15)**, filtri e righe:
  - **barra dei filtri su una riga** su mobile: Periodo (44%), Espansione, "Filtri (N)"; le etichette "Periodo" ed "Espansione" (`.flabel`) sono nascoste alla vista ma restano il nome accessibile; `.setwrap` è `display:contents`, così le opzioni dell'espansione vanno sotto la riga; i **suggerimenti di Espansione** sono larghi quanto la barra (`.setbox` statico, l'elenco si appoggia a `.filters`);
  - **"Ultima apparizione"** è nel pannello "Filtri" (`#seenFilter`), con la sua etichetta rimovibile e conteggio in "Filtri (N)"; "Togli tutti" la azzera (`PanelDeps.seen/setSeen`, `chips(f, seen, setSeen)`); resta mai salvata;
  - **righe compatte su mobile** (75 px invece di 170): miniatura, nome, "31% dei mazzi · di solito 4 copie · vista: 11 ott 2026" (con la collezione "ne hai 2"; `row.*`), poi "ingresso ICE 1995 · da 3,44 €" (`.mline`, `.mline2`; il prezzo si aggiorna all'arrivo dei prezzi, `.mprice`). Le colonne della tabella e le printing possedute non si mostrano su mobile (le printing sono nella scheda); nessun segno "Tua" nella vista collezione, resta "mancante" dove l'elenco mescola possedute e mancanti;
  - intestazione dei risultati su mobile: titolo su tutta la riga, "Ordina" accanto al sottotitolo, riepilogo dei prezzi sotto a tutta larghezza; sottotitolo senza collezione solo "Periodo: ultimo anno." (l'invito a caricare la collezione è già nel blocco sopra); margini più stretti; i due pulsanti di caricamento affiancati;
  - `scripts/home-metrics.mjs` misura con il riepilogo dei prezzi visibile (il caso più alto);
  - **test**: "primo schermo su iPhone SE (375×667)" con gli obiettivi come soglie (senza collezione: frase, blocco, campo e le prime 2 carte; con la collezione "Possiedi N carte" e 3 carte); righe compatte, barra su una riga, larghezza dei suggerimenti, etichetta di "Ultima apparizione"; `setSeen` in `smoke.spec.ts`.
- **Misure finali** (375×667, con il riepilogo dei prezzi, carattere Arial come sui telefoni): prima carta a **496 px** senza collezione (2 carte nel primo schermo) e **413** con la collezione (3 carte); testata 51, barra dei filtri 54, righe 75. Desktop 1280×900: prima carta a 495 senza collezione e 456 (IT) / 435 (EN) con la collezione; righe 73 come prima.
- **CI e caratteri** (correzione dopo il fallimento in CI di A5, Issue #14): su Ubuntu `system-ui` è DejaVu Sans, molto più larga dei caratteri dei telefoni, e le righe compatte andavano a capo (93 px). Ora le due righe di dettaglio non vanno mai a capo (`white-space:nowrap`, puntini se non ci stanno; la data è corta: "11 ott" nell'anno dei dati, `fmtDateShort`), e il test "primo schermo su iPhone SE" misura con **Arial** (Liberation Sans in CI, installata da `playwright install --with-deps`), in un contesto con la CSP aggirata solo per quel test; usa prezzi sintetici, perché in CI `data/prices.json` non esiste. Con Verdana (larghissima) gli obiettivi non si raggiungono: 1 carta senza collezione e 2 con. `scripts/home-metrics.mjs` misura il mobile allo stesso modo.
- **A3 (2026-10-15)**, blocco di caricamento (`#loadArea`):
  - senza collezione un solo blocco (`.drop`, che su desktop accetta anche i file trascinati): frase "Scopri quali carte giocate in Pauper possiedi già. Gratis e senza registrazione: la tua collezione resta nel browser." (`load.intro`), pulsanti "File CSV di ManaBox" (`label.filebtn` con l'`<input type=file>` dentro: si apre con clic, tocco e tastiera) e "Incolla una lista" (`#pasteToggle`, `aria-expanded`: l'area di testo `#pasteBox` compare solo su richiesta e riceve il focus); su desktop frase e pulsanti in riga, sotto aiuto e "Su computer puoi anche trascinare i file qui" (nascosto su touch e sotto 761 px);
  - **aiuto "Come si esporta da ManaBox?"** (`details.howto`): passi presi **solo** dalla guida ufficiale https://manabox.app/guides/collection/import-export/ (letta il 2026-10-15): export CSV di tutta la collezione dal menu in alto a destra della scheda della collezione, con il nome del Binder; un solo Binder o lista dallo stesso menu nella loro schermata. La guida non dice dove finisce il file né differenze tra iOS e Android: non lo diciamo. Link alla guida (`noopener noreferrer`);
  - con la collezione una riga: "Collezione: 8 carte (24 copie) · Sostituisci" e "Rimuovi" (link piccolo, area di tocco di 44 px, nome accessibile "Rimuovi collezione"; su mobile solo la ×);
  - colonna Prezzo delle copie senza printing: "da X €" (la stampa più economica), coerente con la stima "almeno" del riepilogo; testo della stima accorciato ("8 carte senza printing: stampa più economica");
  - intestazione dei risultati: il testo va a capo e i menu restano a destra (prima il riepilogo lungo li spingeva sotto).
  - **Misure dopo A2+A3** (`scripts/home-metrics.mjs`, iPhone SE 375×667): prima carta a 732 px senza collezione (IT; 680 EN) e a **585** con la collezione (prima 825 e 703); testata 51, riga della collezione 50. Desktop 1280×900: prima carta a **501** senza collezione (prima 548) e 487 con la collezione (prima 447–472: il riepilogo dei prezzi va su due righe; il controllo rapido, che sparisce in A4, vale 73 px più il margine).
- **A1 (2026-10-15)**:
  - riga della collezione: "Collezione: 8 carte (24 copie)" (`collectionSize` in `lib/quick.ts`: carte distinte per nome normalizzato, copie; proxy solo se contano, come in "Possiedi N carte"). Prima `collectionCards()` sommava le copie (e i proxy) e le chiamava carte;
  - valore delle copie con righe senza printing (liste incollate): **stima minima** con la stampa non foil più economica, "Valore indicativo delle tue copie: almeno X € (N carte senza printing, stimate con la stampa più economica)" (`ownedEstimated` in `priceTotals`). Prima "0,00 € (8 senza prezzo)".

## Riepiloghi ed elenco (2026-10-07)

- **Regola**: ogni riepilogo conta esattamente l'insieme che l'elenco può mostrare; se i filtri dell'elenco ne mostrano un altro, lo si dice.
- **Difetto corretto**: con Edge of Eternities, periodo "Storico" e "Non viste da oltre 6 mesi" il titolo diceva 69 carte e l'elenco ne mostrava 13. Il titolo conta `S.results` (periodo, minimo mazzi, solo legali, side, gruppo di set con i set nascosti se attivati), mentre l'elenco applicava dopo altri filtri che il titolo ignorava: ricerca, "Ultima apparizione" (ricordata nel browser tra una visita e l'altra) e "Solo quelle che possiedi". Gruppo di set e set nascosti erano già contati allo stesso modo in titolo ed elenco.
- **Ora** (`lib/view.ts`): `restrictToSet` e `visible` sono la sola catena di filtri, usata dall'elenco; `shownNote(titolo, elenco)` confronta i due insiemi. Se sono diversi, sotto il titolo compare `#filterNote`: "13 mostrate con i filtri attivi: non viste da oltre 6 mesi" (motivi: ricerca, ultima apparizione, solo quelle che possiedi, comprese le mancanti), con "Togli questi filtri", che azzera ricerca, ultima apparizione e "Solo quelle che possiedi".
- Insieme del titolo: nella vista collezione le carte possedute ("Possiedi N"); altrimenti tutta la lista ("N carte giocate", "In questo set: N"). Con "Mostra anche le mancanti" l'elenco contiene anche le mancanti, e la nota lo dice.
- **Menu Periodo**: con un'espansione scelta i conteggi ("Storico · 69 carte") sono quelli dell'espansione (`presetCounts` con `keep`); prima erano quelli di tutte le carte.
- Controllati gli altri riepiloghi:
  - "ne possiedi M (K in questa espansione)" conta sulla stessa lista;
  - in "Carta dimenticata" il numero di "nessuna delle tue carte… ({n} in tutto)" è l'insieme da cui si pesca;
  - gli export lavorano su tutte le carte che rispettano i filtri attivi, possedute e mancanti, anche quelle non ancora mostrate (decisione del 2026-10-08; prima lavoravano sulla lista completa, senza ricerca né ultima apparizione).
- **Difetto trovato con il test**: dopo aver usato il campo "Espansione", il primo `pointerdown` fuori dal campo richiudeva le opzioni sotto il campo e spostava il layout sotto il cursore, quindi il clic finiva su un altro elemento (per esempio la casella "Mostra anche le mancanti" non si spuntava). Ora la chiusura avviene su `click`.

## Rimuovi collezione (2026-10-07)

- Nella riga "Collezione: N carte · Sostituisci" c'è il pulsante "Rimuovi collezione" / "Remove collection" (`#removeColl`, `.btn.small` con una ×, non rosso; 44 px di altezza su mobile).
- **Toglie solo la collezione**: gruppi, ruoli e riepiloghi dell'importazione. Periodo, lingua, tema e le altre preferenze (`opts`) restano, e in futuro anche le Preferite. "Cancella i miei dati" resta com'è e cancella tutto.
- **Nessuna conferma**: la collezione sparisce subito e si riapre l'area di caricamento completa. I filtri dell'elenco ripartono azzerati (ricerca, "Ultima apparizione", "Solo quelle che possiedi", "Mostra anche le mancanti"); l'espansione scelta resta.
- **Annulla per 8 secondi** (`UNDO_MS`): barra "Collezione rimossa · Annulla" (`#undoBar`, `role="status"`, `aria-live="polite"`); il focus va sul pulsante Annulla (`#undoRemove`). Annulla ripristina tutto com'era, filtri compresi, e riporta il focus su "Rimuovi collezione".
- **Finché si può annullare la collezione resta nel browser**: `persist()` continua a scrivere i gruppi precedenti (le preferenze si aggiornano). Diventa definitiva:
  - alla scadenza del messaggio;
  - con un nuovo caricamento;
  - con "Cancella i miei dati";
  - alla chiusura della pagina (`pagehide`).

## Scheda al passaggio del mouse (2026-10-08)

- **Misure** (`node scripts/sheet-timing.mjs`, desktop, build di produzione):

  | | Prima | Dopo |
  |---|---|---|
  | Apertura (dal cursore sulla carta) | circa 235 ms (timer di 220 ms) | circa 117 ms (100 ms dopo l'ultimo movimento) |
  | Comparsa | nessuna animazione (appariva di colpo) | 100 ms (opacità e 4 px di spostamento) |
  | Da una carta all'altra | circa 230–285 ms con la scheda vecchia ferma | subito (3–36 ms), senza chiudersi |
  | Chiusura (dall'uscita del cursore) | circa 300 ms (timer di 280 ms), senza dissolvenza | 80–100 ms (dissolvenza di 80 ms) |
- **Regole** (`ui/sheet.ts` e `main.ts`): `HOVER_OPEN_MS = 100` misurati dall'ultimo `mousemove` sulla carta; se la scheda è aperta al passaggio del mouse, o si è chiusa da meno di 250 ms (`isWarm`), la carta successiva la apre subito, solo cambiando il contenuto; uscendo dalla carta o dalla scheda parte la dissolvenza (`sheet-out`, 80 ms), annullata se il cursore entra nella scheda o torna sulla carta. **Uscire dalla carta verso la scheda non avvia la chiusura**: quando non sta né sopra né sotto, la scheda si apre sopra la carta stessa (prima il "mouseout" faceva partire la chiusura, interrotta subito: un lampo).
- Tocco e tastiera invariati (nessuna animazione); con `prefers-reduced-motion` nessuna animazione e chiusura immediata.
- **Anteprima**: sotto l'immagine grande della carta attiva c'è la `small` della stessa printing (spesso già in cache dalla miniatura), visibile finché la grande non arriva. Stessa carta e stessa proporzione, nessun filtro (regole di Scryfall).

## Prezzi indicativi (2026-10-08)

- **Fonte**: `prices.eur` e `prices.eur_foil` (Cardmarket) del bulk `default_cards` di Scryfall. Nessuna richiesta esterna in più dal sito: legge `data/prices.json` dal proprio dominio, dopo il resto e senza bloccare la pagina; all'arrivo aggiorna solo le celle e il riepilogo (un ridisegno completo staccava dalla sua carta una scheda in apertura).
- **Non committato**: committando il file il repository crescerebbe di circa **48 KB al giorno** (misurato con due bulk consecutivi, 2026-10-06 e 2026-10-07: 3.045 righe su 5.039 cambiano; circa 17 MB l'anno, quasi 7 volte i file dei mazzi). Lo genera il job `deploy` (`python -m pauper_index prices`: scarica il bulk e usa gli Scryfall ID di `printings.json`), che gira ogni giorno dopo `update`; anche `build` lo scrive in locale. Se la generazione fallisce, la pubblicazione prosegue e il sito mostra "—".
- **Quale prezzo** (`lib/prices.ts`):
  - posseduta: la printing posseduta (foil se la riga è foil) di valore più alto; la printing si riconosce da Scryfall ID, poi set + numero. Nessun ripiego tra normale e foil;
  - mancante: la printing non foil più economica, "da X €";
  - vista per espansione: la stampa di quel set (`displayPrint`), non foil;
  - scheda: prezzo sotto ogni printing del ventaglio, prezzo normale e foil della printing attiva, "Prezzi delle tue printing" con ogni printing posseduta;
  - prezzo assente o file mancante: "—", senza errori.
- **Riepilogo** (`#priceSummary`, sotto il titolo), sulle carte dell'elenco con i filtri attivi (ricerca, ultima apparizione, espansione), comprese le mancanti anche se l'elenco non le mostra: "Valore indicativo delle tue copie" (tutte le copie di ogni printing posseduta) e "Costo indicativo delle mancanti" (una copia ciascuna, con lo stesso prezzo della colonna), più quante carte non hanno prezzo; senza collezione "Costo indicativo di una copia di ciascuna".
- Le printing in altre lingue hanno il prezzo della printing corrispondente (Scryfall dà un prezzo per printing, non per lingua).
- **Informazioni**: una domanda frequente, "Da dove vengono i prezzi?", con una sola frase.
- Il passo 3 (Mazzi) userà gli stessi prezzi per il costo delle carte mancanti di ogni mazzo.

## Filtri per colore, costo, tipo e testo (2026-10-08)

- **Dove valgono**: vista collezione, mancanti e vista per espansione; si combinano tra loro (AND), con la ricerca per nome, "Ultima apparizione" ed espansione. Non toccano il controllo rapido né "Carta dimenticata".
- **Barra**: restano periodo, espansione, ricerca per nome e il pulsante "Filtri" (`#filtersBtn`, "Filtri (N)" con N = numero di etichette attive, `aria-expanded`). Minimo mazzi, solo legali e side sono passati nel pannello, sezione "Opzioni della lista" (sono preferenze salvate, quindi non diventano etichette).
- **Pannello** (`#fpanel`, `<dialog>`, `ui/filterpanel.ts`): su desktop `show()` non modale, nel flusso sotto la barra, con i risultati visibili che si aggiornano; fino a 640 px `showModal()` dal basso, con sfondo, piè di pagina fisso ("Togli tutti", "Mostra N carte") e chiusura toccando lo sfondo. Esc chiude in entrambi i casi e il focus torna su "Filtri". I pulsanti (`aria-pressed`) si creano una volta (e al cambio di lingua) e poi si aggiorna solo lo stato, così il pulsante premuto tiene il focus.
- **Colore** (`lib/cardfilter.ts`, `matchColors`): Bianco, Blu, Nero, Rosso, Verde, Multicolore (2+ colori), Incolore; pallini CSS a tinta unita, **non** simboli di mana.
  - "Almeno uno dei colori scelti" (predefinita): la carta ha almeno un colore scelto, oppure è multicolore con M o incolore con C;
  - "Solo questi colori": una carta incolore passa solo con C; una colorata se tutti i suoi colori sono tra quelli scelti. Con M scelto deve anche essere multicolore; con solo M passa qualsiasi multicolore (decisione nostra: la richiesta non diceva cosa fanno M e C in questa modalità).
- **Costo**: 0–5 esatti e 6+ (`m` ≥ 6), selezione multipla. Etichetta a intervalli: "Costo 1–2, 4, 6+".
- **Tipo**: tipi delle carte (regola 205.2a) letti da `tl` su tutte le facce, senza supertipi né sottotipi; un'avventura conta anche come istantaneo o stregoneria, come su Scryfall. Mostrati i sei principali e poi gli altri presenti tra le carte giocate (al 2026-10-08 solo Kindred, "Tribale"). Selezione multipla in OR. I tipi senza traduzione resterebbero in inglese.
- **Testo**: campo "Testo delle regole (in inglese)", segnaposto "es. draw a card". Cerca in riga del tipo + testo delle regole di tutte le facce, in minuscolo e senza accenti, apostrofi tipografici semplificati; ogni parola deve comparire in un punto qualsiasi (sottostringa). `data/texts.json` si scarica al primo focus o alla prima digitazione nel campo (`loadTexts`); finché non arriva il filtro sul testo non si applica e sotto il campo compare "Carico il testo delle regole…"; se fallisce si riprova al prossimo uso.
- **Etichette** (`#activeFilters`, sotto la barra): una per colore ("Blu ×"; in "Solo questi colori" una sola, "Solo Blu, Nero ×"), una per il costo, una per tipo, una per il testo ("Testo: draw ×"), più "Togli tutti". Nome accessibile "Togli il filtro: …".
- **Riepiloghi**: come la ricerca, sono filtri dell'elenco: il titolo conta l'insieme del periodo/espansione e la nota "N mostrate con i filtri attivi" elenca anche colore, costo, tipo e testo; "Togli questi filtri" toglie anche questi. Il riepilogo dei prezzi e gli export usano lo stesso insieme (`matching()`: tutte le carte filtrate, possedute e mancanti).
- **Mai salvati**: ripartono azzerati a ogni visita; "Rimuovi collezione" li azzera (Annulla li ripristina), "Cancella i miei dati" pure.

## Nomi italiani (2026-10-08)

- **Fonte**: la ricerca di Scryfall `lang:it` con `unique=prints` (tutte le stampe italiane, 175 per pagina), con il client che rispetta i 500 ms dell'endpoint (`/cards/search`, 550 ms). **Niente bulk `all_cards`.** Al 2026-10-08: 53.074 stampe italiane in 304 pagine (circa 3 minuti e circa 290 MB di JSON), 52.607 con un nome stampato, **30.288 carte** con un nome italiano. Per le carte a più facce il nome è quello delle facce unite con " // " (verificato: nella ricerca reale `printed_name` sta nelle facce). Le pagine non vanno nella cache su disco (`cache=False`), perché sarebbero circa 290 MB.
- **Stato** (`pipeline/src/pauper_index/italian.py`): `data/reviews/italiano.json`, **né committato né pubblicato** (in `.gitignore` dal 2026-10-08, su richiesta dell'utente: è una copia grezza dei dati di Scryfall, e le loro regole vietano di ripubblicarli così come sono; il commit `60fb567` lo conteneva, la cronologia non è stata riscritta). In CI sta nella **cache di GitHub Actions** (`italiano-<run_id>`, ripristinata con il prefisso `italiano-`, come il clone della fonte); se la cache manca (prima esecuzione, o scaduta dopo 7 giorni senza uso) `build` riscarica tutto, circa 3 minuti. Formato: `{v, full, updated, c: {oracle_id: {n: [nomi italiani distinti, dal più recente], t: testo della stampa italiana più recente, d: sua data}}}`, una riga per carta (diff leggibili). Si conservano **tutti** i nomi distinti, perché la traduzione cambia tra le edizioni (99 carte giocabili ne hanno più di uno, per esempio "Ricercatori dell'Accademia" e "Ricercatori d'Accademia"). Le stampe senza nome stampato si ignorano; i nomi uguali a quello inglese non vanno nei file del sito (per esempio Fire // Ice, che Scryfall dà come "Fire // Ice" anche in italiano).
- **Aggiornamento** (scelto: incrementale, non ogni giorno):
  - **completo** a mano (`python -m pauper_index italian --full`) oppure quando lo stato manca;
  - **incrementale** dentro `build` (quindi nella CI quotidiana, che però fa richieste solo quando serve): quando esce un set (`released_at` di `/sets` dopo l'ultimo aggiornamento ed entro oggi) **oppure** dopo 7 giorni (`REFRESH_DAYS`). Scarica solo `lang:it date>=<ultimo aggiornamento − 60 giorni>` (`OVERLAP_DAYS`, per le stampe italiane aggiunte in ritardo), di solito poche pagine, e unisce i nomi (mai rimossi). Le traduzioni delle stampe già uscite non cambiano, quindi non serve riscaricare tutto;
  - senza rete (`--offline`) lo stato resta com'è. Si committano solo i file del sito derivati dallo stato.
- **File del sito** (scaricati solo quando servono, fuori dal caricamento iniziale):
  - `itnames.json` `{v, c}`: `c[i]` = nomi italiani della carta i di `cards.json` (`[]` se non ce ne sono). **121 KB, 40 KB gzip.** Si scarica al primo focus o alla prima digitazione nella ricerca per nome, al primo uso del controllo rapido, oppure alla prima scheda aperta con l'interfaccia in italiano (serve al nome sotto quello inglese);
  - `itnames-other.json` `{v, o}`: `[indice in cardnames.json, nomi…]` delle altre carte giocabili in carta o su MTGO (24.830). **785 KB, 263 KB gzip.** Solo per il controllo rapido, insieme a `cardnames.json`;
  - `ittexts.json` `{v, t}`: testo della stampa italiana più recente di ogni carta di `cards.json` (4.518 su 5.037 ne hanno uno). **731 KB, 138 KB gzip**: sotto la soglia di 500 KB fissata dall'utente, quindi incluso. Si scarica insieme a `texts.json` al primo uso del filtro sul testo; se manca, il filtro resta in inglese.
  - Niente nomi inglesi ripetuti: il sito li ha in `cards.json` e `cardnames.json`. Se un file manca o non è allineato, la ricerca resta in inglese, senza errori.
- **Ricerca per nome** (`lib/italian.ts`): maiuscole, accenti e apostrofi non contano: il nome si confronta senza apostrofi ("dellantenata") e con gli apostrofi come spazi ("dell antenata"); lo stesso per la ricerca. Vale anche per i nomi inglesi ("tormods crypt"). Gli spazi contano.
- **Controllo rapido**: una voce per ogni nome italiano, mostrata come "Fulmine (Lightning Bolt)"; a parità di punteggio prima le carte giocate, poi i nomi inglesi. Scelta, il campo mostra "Fulmine (Lightning Bolt)"; il risultato ha il titolo inglese e sotto, in corsivo, i nomi italiani (con l'interfaccia in italiano, o sempre se la carta è stata cercata in italiano). Il nome esatto italiano (anche di una faccia) mostra subito il risultato.
- **Ricerca nell'elenco** (vista collezione, mancanti, espansione): `ListFilters.names`, il testo dei nomi di ogni carta. Quando i nomi italiani arrivano l'elenco si ridisegna **solo se cambia** (un ridisegno inutile toglieva il focus alla riga: difetto trovato da un test).
- **Scheda**: con l'interfaccia in italiano, sotto il nome inglese i nomi italiani (`#sheetIt`, `lang="it"`); se il file arriva con la scheda aperta, la riga si aggiunge senza riaprirla (`setSheetItalian`).
- **Filtro sul testo**: cerca anche nel testo italiano; etichetta "Testo delle regole (inglese o italiano)", segnaposto breve "es. draw a card · pesca una carta" ("e.g. draw a card" in inglese); la spiegazione (testo italiano solo per le carte stampate in italiano) sta nella riga sotto il campo.

## Pagina Informazioni (riscritta il 2026-10-06)

- Obiettivo: si legge in 30 secondi, ogni concetto compare una sola volta. Struttura in `ui/about.ts`:
  1. una frase su cosa fa il sito; "Come si usa" in 3 passi con icone SVG originali (carica, filtri, carta con spunta), in griglia su desktop e in colonna su mobile;
  2. "I dati": una frase con la data dell'ultimo aggiornamento (`meta.generated_at`);
  3. "Domande frequenti": 6 `<details>` chiusi (giocata in Pauper, precisione delle percentuali, privacy, prezzi, segnalare un errore, sostenere il sito);
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

- **Controllo rapido, corretto il 2026-10-15**: Invio prima che i suggerimenti siano pronti (dati delle carte o tutti i nomi ancora in arrivo) non faceva nulla. Ora il testo cercato resta in attesa (`pending` in `ui/quick.ts`): appena arrivano i dati (`refresh`, chiamato da `render()`) o i nomi, la carta si mostra come con Invio, se nel frattempo il campo non è cambiato; un nuovo testo o Esc annullano l'attesa. Anche l'elenco aperto si aggiorna all'arrivo dei dati. Test: "Invio prima che i suggerimenti siano pronti".
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

## Simboli di mana (2026-10-15, restyling dei Mazzi, passo 2)

- **Sprite** `data/manasymbols.svg` (committato, in `PUBLIC_DATA`), generato da `pauper_index/manasymbols.py` dentro `build`: W, U, B, R, G, C e il mana generico {0}–{6} dalla symbology di Scryfall (`/symbology`, poi `svgs.scryfall.io/card-symbols/*.svg`), più un simbolo **originale** per "Multicolore" (`M`: cinque spicchi con i colori dei cerchi WUBRG e un bordo scuro). Id nello sprite: `W U B R G C N0…N6 M`. 14 simboli, **19 KB grezzi, 7,9 KB gzip**.
- **Pulizia a elenco chiuso** (`clean_symbol`): solo `svg`, `g`, `path`, `circle`; attributi `fill` (esadecimale o `none`), `fill-rule`, `transform` solo `translate(...)` numerico, `d` (solo caratteri dei tracciati), `cx`/`cy`/`r` numerici. Tutto il resto (id, stili, script, link, immagini) si scarta. I simboli **mantengono i loro colori**: non si ricolorano.
- **Aggiornamento**: lo sprite si scarica solo se manca o è incompleto (i simboli non cambiano); senza rete resta com'è.
- **Sito** (`ui/mana.ts`, `manaIcon(sym, label)`): `<svg class="mana"><use href="data/manasymbols.svg#U">`, CSP invariata. Con `label` è un'immagine con testo alternativo, senza è decorativo.
  - Mazzi: i colori del mazzo (`.pips`, `role="img"` con il nome dei colori) al posto dei pallini.
  - Pannello "Filtri": colori con il simbolo (decorativo) e il nome scritto accanto; costo con {0}–{5} e {6}+, nome accessibile "Costo 3" / "Costo 6 o più" (`fp.mvBtn`, `fp.mvBtnMore`).
  - **Stato premuto** dei pulsanti del pannello (colori, costo, tipo): anello di 2 px e una spunta in un cerchietto (`.fcheck`), oltre ad `aria-pressed` e al colore.
- Tolti i pallini CSS (`.cdot`).

## Logo (2026-10-06)

- **Originale**: `logo/logo.svg` (dell'utente, un solo tracciato `#555555`). Nessun elemento di Wizards (simboli di mana, logo di Magic, retro delle carte, planeswalker).
- **`npm run icons`** (`web/scripts/icons.mjs`) genera tutto da lì, senza dipendenze in più: tracciato compattato (coordinate relative, viewBox ritagliato), PNG disegnate in un canvas di Chromium e salvate come PNG indicizzate con zlib al massimo.
  - `public/logo.svg`: `<symbol id="logo">` con `fill="currentColor"`, usato in testata con `<svg class="logo"><use href="/logo.svg#logo">`; il colore viene da `--logo` (`#555555` chiaro, `#C9CFD8` scuro), quindi segue anche il tema scelto a mano;
  - `public/icon.svg`: favicon con `prefers-color-scheme` (stessi due colori);
  - `apple-touch-icon.png` (180, quadrato pieno), `icon-192/512.png` (angoli arrotondati), `icon-maskable-512.png` (logo al 56%, dentro l'area sicura), `og-image.png` (1200×630, logo + "Pauper Index" in New Rocker + dominio): tutte su sfondo scuro `#1B2028` con il logo `#C9CFD8`.
- **Varianti scelte dall'utente**: in tema scuro il logo diventa grigio chiaro senza riquadro; icone della schermata Home su sfondo scuro. Il testo dell'og-image usa il font di sistema della macchina che rigenera (Segoe UI su Windows).

## Conteggio delle visite (2026-10-10)

- **GoatCounter**, account `albafvcens`, dashboard https://albafvcens.goatcounter.com. Nessun cookie, nessun dato della collezione.
- **Script servito dal sito**: `web/public/count.js`, copia **senza modifiche** del file ufficiale (licenza ISC, intestazione nel file) dal ramo master di github.com/arp242/goatcounter, commit `c031008` (gc.zgo.at non è raggiungibile dall'ambiente di sviluppo; il file è lo stesso). SHA-256 `792b7abd…3fe3f0`, verificato da `tests/analytics.test.ts`: per aggiornarlo si sostituisce il file e si aggiorna l'hash nel test.
- **CSP**: solo `connect-src … https://albafvcens.goatcounter.com/count` (count.js invia con `navigator.sendBeacon`, che ricade sotto `connect-src`). Il ripiego di count.js con un'immagine resterebbe bloccato da `img-src`: voluto, niente di più del necessario. `CSP` e `GC_CONNECT` sono esportati da `vite.config.ts` per i test.
- **Quando si conta** (`lib/analytics.ts`, `initAnalytics` all'avvio di `main.ts`): solo se `location.hostname === 'pauperindex.com'` e `navigator.webdriver` è falso. Altrimenti count.js **non viene nemmeno caricato**: in locale (`npm run dev`, `npm run preview`), nella CI e nei test Playwright nessuna richiesta. Lo script si aggiunge con `h('script')` e `data-goatcounter` (endpoint) e `data-goatcounter-settings` `{"no_events": true}` (niente conteggio automatico dei clic con `data-goatcounter-click`).
- **Cosa parte**: la visita (percorso canonico `/`: gli hash `#mazzi`, `#informazioni`… non sono pagine per count.js; titolo, referrer, larghezza dello schermo, query della URL se c'è) e gli **eventi** di `GC_EVENTS`, con il solo nome (`p` = `t` = nome, referrer vuoto): `collezione-caricata` (file o testo incollato, non il ripristino da IndexedDB), `controllo-rapido` (risultato mostrato), `filtro-espansione` (espansione scelta), `carta-dimenticata` (pressione di "Rispolvera"), `mazzi` (apertura della sezione), `export` (copia o download, anche dai Mazzi), `ko-fi` (clic, anche centrale, su un link a ko-fi.com). Ogni evento **al massimo una volta per pagina caricata**; quelli arrivati prima di count.js partono quando è pronto.
- **localStorage**: il conteggio non scrive nulla. count.js legge solo `skipgc`, che viene scritto quando si apre `https://pauperindex.com/#toggle-goatcounter` (esclusione delle proprie visite, per browser; la stessa URL la riattiva). "Cancella i miei dati" non tocca `skipgc` (cancella solo le chiavi `pauper-index:`). Aprendo l'URL con l'hash dalla pagina già aperta serve ricaricare: count.js lo legge solo all'avvio.
- **Informazioni**: la domanda "La mia collezione è al sicuro?" lo dice (IT e EN).
- **Test**: `tests/analytics.test.ts` (quando si conta, coda e invio una sola volta degli eventi, CSP, hash di count.js); `e2e/analytics.spec.ts`: in anteprima nessuna richiesta né `window.goatcounter` dopo aver usato tutte le funzioni; sul dominio pubblicato simulato (richieste a `pauperindex.com` servite dall'anteprima) con un browser automatizzato nessuna richiesta; con un browser che non si dichiara automatizzato (solo `desktop-it`) la visita e i 7 eventi arrivano all'endpoint attraverso la CSP della build, con i soli parametri attesi, senza nomi di carte né cookie, e `#toggle-goatcounter` ferma il conteggio.
- **Verifica dal vivo** (non possibile dall'ambiente di sviluppo, che non raggiunge goatcounter.com): dopo il deploy, una visita da un browser normale deve comparire nella dashboard.

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
