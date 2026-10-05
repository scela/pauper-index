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

## Stato

- [x] Fase 0: setup e ispezione dei formati
- [x] Fase 1: pipeline in locale, test, confronto con la baseline
- [x] Fase 2: frontend
- [ ] Fase 3: GitHub Actions e deploy (in corso)
- [ ] Fase 4: rifinitura e README

## Struttura

```
docs/SPEC.md            specifica
reference/              prototipo (ce-lho.html) e script (pauper_sync.py) da portare
reference/private/      export ManaBox personali: IGNORATA da git, non copiarne mai il contenuto
baseline/               pauper-2026-09-14.csv: List ManaBox della ricerca precedente (carte giocate negli ultimi 12 mesi)
pipeline/               pacchetto Python pauper_index (Fase 1)
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
cd web; npm ci                       # Fase 2 (lockfile: web/package-lock.json)
npm run dev                          # sviluppo su http://localhost:5173 (senza CSP)
npm run build; npm run preview       # build di produzione con CSP su http://localhost:4173
npm test                             # Vitest (logica, sicurezza, test locali su reference/private)
npx playwright install chromium; npm run e2e   # smoke test desktop + mobile sulla build
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

## Pipeline: comandi

```powershell
.\.venv\Scripts\python -m pauper_index build      # aggiorna fonte e bulk, ricalcola, scrive data/
.\.venv\Scripts\python -m pauper_index sets       # data/reviews/set-ingresso.md
.\.venv\Scripts\python -m pauper_index baseline   # data/reviews/baseline-2026-09-14.md
#   --offline: niente rete (usa cache e fuzzy_matches.csv); --no-fetch: non aggiorna la fonte
.\.venv\Scripts\python -m pytest pipeline; .\.venv\Scripts\ruff check pipeline
```

Tempi in locale: build offline circa 26 s; prima build online circa 90 s (circa 120 richieste Scryfall a 0,55 s, poi in cache).

## Output della pipeline (`data/`)

Tutti in UTF-8 con LF. I JSON lunghi hanno una riga per elemento, per avere diff leggibili.

**`cards.json`**: `{v, anchor, w, tot, sets, t, c}`
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
  - `r`: indice della printing di riferimento in `printings.json`.

**`printings.json`**: `{v, sets: {codice: [nome, uscita]}, artists: [...], p}`
- `p[i]`: printing della carta i di `cards.json`, nella forma `[scryfall_id, set, numero, indice artista, gruppo illustrazione, retro 0|1, (lingua se non en)]`.
- Il gruppo illustrazione numera gli `illustration_id` distinti della carta, e serve al ventaglio.
- **Scostamento dalla spec**: non è una mappa id → carta, perché il frontend se la costruisce da qui. Così gli UUID non sono duplicati e i dati per le immagini stanno in un solo file.
- URL delle immagini: `cards.scryfall.io/{small|normal|large}/{front|back}/{id[0]}/{id[1]}/{id}.jpg`.

**`names.json`**: `{nome normalizzato: indice carta}` (nome, facce, `printed_name`/`flavor_name`), senza le chiavi ambigue. La normalizzazione è `names.norm`; i vettori di prova sono in `pipeline/tests/fixtures/norm_vectors.json`.

**`allnames.json`** (aggiunto in Fase 2): array dei nomi normalizzati di **tutte** le carte giocabili, circa 36.000 voci (250 KB compressi). Il frontend lo scarica solo quando il testo incollato contiene righe senza Scryfall ID e non presenti nella lista. Così distingue "carta mai giocata in Pauper" da "nome non riconosciuto".

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
| `cards.json` | 1,22 MB | 0,35 MB |
| `printings.json` | 1,46 MB | 0,70 MB |
| `names.json` | 0,13 MB | 0,05 MB |

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
- **Nessun logo né simbolo** di Wizards (simboli di mana compresi), ManaBox o Scryfall.
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
2. **Filtri** su una o due righe: periodo (menu con il numero di carte per periodo), minimo mazzi, solo legali, conta anche il side, conta le copie, ricerca. Ogni modifica aggiorna subito i risultati. Su mobile le opzioni stanno su una riga scorrevole.
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
- `src/ui/`: `sheet` (scheda e ventaglio), `about` (Informazioni). `src/main.ts`: stato, eventi, rendering.
- `tests/`: Vitest. `private.test.ts` gira solo se trova `reference/private/esempio-testo.txt` e stampa solo conteggi. `e2e/`: Playwright, progetti desktop e "mobile" (iPhone 13 emulato su Chromium). `tests/fixtures/`: dati sintetici.
- `vite.config.ts`, con un plugin che:
  - in sviluppo serve `/data/*` da `../data`;
  - in build copia in `dist/data/` **solo** `cards`, `printings`, `names`, `allnames`, `meta` e `reviews/<set>.(json|md)` / `reviews/index.json`. I report interni (`unresolved.csv`, `risoluzione.csv`, `dedup.json`, `set-ingresso.md`, `baseline-*.md`) restano fuori dal sito;
  - inietta la CSP (meta tag) **solo in build**, perché il dev server di Vite usa stili inline.

**Decisioni**:
- **Font di sistema** al posto di Geist: nessuna richiesta esterna e nessun file di font da servire.
- **CSP**: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://cards.scryfall.io data:; connect-src 'self'; font-src 'self'; manifest-src 'self'; worker-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'`. `<meta name="referrer" content="no-referrer">`, così le richieste di immagini a Scryfall non rivelano la pagina.
- **Ruoli dei gruppi**: solo "Inclusa" o "Esclusa" (in "Binder inclusi"). Binder di tipo `deck` o `list` sono esclusi di default; il testo incollato è un gruppo "Testo incollato" che conta come posseduto.
- **Abbinamento di una riga**:
  1. Scryfall ID (`printings.json`);
  2. set + numero;
  3. nome (`names.json`, poi faccia frontale, poi `A/B` → `A // B`).

  Le righe con uno Scryfall ID sconosciuto (printing in altre lingue) si abbinano per nome, ma la miniatura usa il loro ID.
- **Riepilogo dell'importazione**: righe lette, carte della lista, carte mai giocate in Pauper (Scryfall ID o nome in `allnames.json`), righe non riconosciute (elencate), righe senza set e numero (immagine di riferimento, segnalata anche nella scheda).
- **"Conta le copie"**: confronto con la mediana delle copie (main+side, oppure solo main se "Conta anche il side" è spento) nella finestra scelta.
- **Ventaglio**: un artwork per `illustration_id`, preferendo la printing posseduta, poi la più recente in inglese. Al massimo 7, più "Mostra tutte" che apre una griglia in un `<dialog>`. Le carte sono **distanziate e ruotate di pochi gradi, senza sovrapporsi**, per non coprire artista e copyright (regole di Scryfall). La carta attiva è mostrata intera e più grande.
- **Persistenza**: IndexedDB (database `pauper-index`) per la collezione; localStorage solo per tema, ordinamento e filtro, con prefisso `pauper-index:`. "Cancella i miei dati" elimina il database e **solo** le chiavi `pauper-index:`: su GitHub Pages l'origine è condivisa con gli altri siti dello stesso utente, quindi niente `localStorage.clear()`.
- **Tabella**: pagine da 100 righe ("Mostra altre"). Ordinamento per percentuale di mazzi, nome, ultima apparizione (recente o meno recente). Filtro "viste negli ultimi 6 mesi / non viste da oltre 6 mesi", rispetto alla data dei dati.
- **Segnalare un errore**: link `mailto:massadalbe@hotmail.com` nella pagina Informazioni (`REPORT_EMAIL` in `web/src/ui/about.ts`).
- **Icone**: `public/icon.svg` più PNG generate con `npm run icons` (Chromium di Playwright) e committate. Nessun simbolo di Wizards.

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

## Decisioni in sospeso
