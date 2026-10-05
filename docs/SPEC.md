# SPEC: "Ce l'ho? Pauper"

## Obiettivo

Web app statica che risponde a una domanda: **di tutte le carte giocate in Pauper, quali possiedo, in qualsiasi printing, nella mia collezione ManaBox?**

La lista delle carte giocate è integrata nell'app e si aggiorna da sola. L'unico passaggio manuale per l'utente è caricare l'export CSV della collezione da ManaBox.

Componenti:

1. **Pipeline dati** (Python, eseguita da GitHub Actions). Costruisce e mantiene la lista delle carte giocate in Pauper con statistiche e legalità, e genera un report di revisione dopo ogni nuova espansione.
2. **Frontend statico**. Legge nel browser l'export ManaBox, lo confronta con la lista per `oracle_id` e mostra possedute e mancanti, con export.

## Materiale di riferimento (cartella `reference/`)

- `ce-lho.html`: prototipo funzionante in un solo file. Contiene:
  - il parsing CSV dell'export ManaBox (delimitatore automatico, colonne riconosciute senza distinzione di maiuscole);
  - l'assegnazione dei ruoli ai gruppi tramite Binder Name / Binder Type;
  - il confronto e gli export (liste "1 Nome", List riallineata in CSV);
  - la persistenza in localStorage e la UI in italiano.

  **Va portato, non riscritto da zero**: mantieni comportamento e testi, salvo dove questa spec dice diversamente.
- `pauper_sync.py`: lo stesso confronto in versione script.
- `private/`: export ManaBox reali per i test. **Cartella in `.gitignore`**: non deve mai finire nel repo.

## Decisioni (default, modificabili prima di partire)

| Parametro | Default | Note |
|---|---|---|
| Hosting | GitHub Pages | Alternativa: Vercel con Git integration |
| Visibilità repo | Pubblico | Il repo non contiene dati personali |
| Definizione default di "carta giocata" | Vista negli ultimi 365 giorni, in almeno 1 mazzo, legale oggi | In UI ci sono preset alternativi |
| Finestre statistiche | 61 giorni, 365, 730, storico | 61 giorni è la finestra metagame di MTGDecks |
| Frequenza aggiornamento | Settimanale (lunedì 06:00 UTC) più avvio manuale | |
| Ritardo della revisione dopo un'espansione | 60 giorni | |
| Soglia "set rilevante" | Il set rende Pauper-legali almeno 5 carte | Da validare (vedi sotto) |
| Allarme fonte ferma | Nessun torneo nuovo da 21 giorni | |

## Fonte dati

- **MTGODecklistCache, fork Jiliac**: `https://github.com/Jiliac/MTGODecklistCache.git`.
  - Al 2026-09-14 era l'unico aggiornato: il repo originale di Badaro e il fork fbettega risultavano fermi o non disponibili.
  - L'URL deve essere configurabile.
  - Contiene decklist da mtgo.com, magic.wizards.com, melee.gg, CardsRealm, topdeck.gg e manatraders.
- **Clone**:
  ```
  git clone --filter=blob:none --no-checkout --depth 1 <url>
  ```
  Poi usa sparse-checkout in modalità non-cone, con il pattern `/Tournaments/**/*[Pp]auper*.json` scritto in `.git/info/sparse-checkout`.
  - La modalità `--cone` si è dimostrata inaffidabile con questi glob.
  - In locale il checkout in foreground è andato in timeout: lancialo in background con un log.
- **Selezione**: file il cui nome contiene "pauper" (senza distinzione di maiuscole). Escludi eventi Cube o Limited, se presenti.
- **Ispeziona lo schema JSON reale prima di scrivere il parser.** Non assumere i nomi dei campi. Gestisci Mainboard, Sideboard e la data del torneo.
- **Vietato** fare scraping di mtgdecks.net (blocca i bot) e di mtgtop8.

**Baseline della ricerca precedente (2026-09-14)**, stesso metodo:

| Voce | Valore |
|---|---|
| Tornei | 8.496 |
| Mazzi | 204.366 (maggio 2014 – settembre 2026) |
| Nomi distinti nello storico | 4.992 |
| Nomi distinti negli ultimi 12 mesi | 3.064 |

La nuova pipeline deve produrre numeri dello stesso ordine. Ogni differenza va spiegata: per esempio l'unificazione per `oracle_id` ridurrà un po' il conteggio dei nomi.

## Risoluzione dei nomi (punto critico)

Ogni nome che compare in un mazzo va risolto a un **`oracle_id` Scryfall**: è l'identità della carta indipendente dalla printing, e la chiave di tutto, sia nella pipeline sia nel confronto con la collezione.

1. **Scryfall bulk data** (`/bulk-data`):
   - `oracle_cards` per identità e legalità;
   - `default_cards` per le printing (rarità, set, `games`, Scryfall ID).

   Scaricali in streaming (`default_cards` è grande) e tienili in cache locale con la loro data.
2. **Indice dei nomi**. Per ogni carta include:
   - nome completo;
   - ogni faccia (DFC, split, adventure, flip);
   - `flavor_name` e nomi alias di Universes Beyond;
   - forme normalizzate (maiuscole, apostrofi tipografici, diacritici, spazi).

   "Delver of Secrets" e "Delver of Secrets // Insectile Aberration" devono dare lo stesso `oracle_id`.
3. **Pulizia prima del match**: togli prefissi di quantità o di set, per esempio "4 Galvanic Blast" o "[BOK] Ninja of the Deep Hours".
4. **`data/manual/aliases.csv`** (`sorgente,corretto`): file persistente, applicato prima del match. Seed con i 14 refusi già identificati:
   ```
   sorgente,corretto
   Tresspasser's Curse,Trespasser's Curse
   Thormod's Crypt,Tormod's Crypt
   hunter's bowgun,Hunter's Blowgun
   Vamipre's Kiss,Vampire's Kiss
   Clockwork Percusionist,Clockwork Percussionist
   breath weapom,Breath Weapon
   piroblast,Pyroblast
   Corrupted convinction,Corrupted Conviction
   Village Rite,Village Rites
   fanatic offering,Fanatical Offering
   murmuring mistic,Murmuring Mystic
   dimor house guard,Dimir House Guard
   hounting misery,Haunting Misery
   arcon harvest,Acorn Harvest
   ```
5. **`data/manual/exclude.csv`**: token, fogli sticker/attraction di Unfinity, voci ambigue.
6. **Nomi ancora non risolti**: prova Scryfall `/cards/named?fuzzy=`, con cache e rate limit.
   - Accetta il risultato in automatico solo se la carta ha almeno una printing common.
   - Registra ogni match fuzzy nel report.
   - **Non unire mai due nomi che esistono entrambi**, per esempio Soltari Emissary e Sultai Emissary.
7. **Nomi in altre lingue** (liste brasiliane e italiane): prova a risolverli tramite il nome stampato in qualsiasi lingua. Se non si risolvono, finiscono nel report e non nella lista.
8. **Report `data/review/unresolved.csv`**: nome, numero di mazzi, prima e ultima apparizione. Obiettivo: nomi non risolti sotto lo 0,5% delle occorrenze carta-mazzo.

**Regole d'uso di Scryfall**: User-Agent descrittivo e header Accept (li richiede la loro API), 50–100 ms tra una richiesta e l'altra. Usa sempre il bulk quando puoi.

## Statistiche per carta (per `oracle_id`)

- Nome canonico e facce.
- Mazzi che la contengono (main e/o side) per ogni finestra, e percentuale sui mazzi della finestra.
- Main contro side, copie totali e copie tipiche (mediana delle copie per mazzo tra i mazzi che la giocano).
- Prima e ultima apparizione.
- Legalità Pauper attuale da Scryfall: legal, banned o not_legal.
- Set d'ingresso: il set della prima printing common, in carta o su MTGO, che l'ha resa legale.
- Flag "nuova" se il set d'ingresso è uscito da meno di 60 giorni.

I dati registrano cosa è stato **giocato**, non cosa è **legale**: le carte bannate restano nei dati, ma la UI le nasconde di default. Le terre base sono incluse nei dati ed escluse di default nella UI.

## Output della pipeline (committati nel repo e letti dal frontend)

- **`data/cards.json`**: array compatto (chiavi corte) con le statistiche. Misura la dimensione: obiettivo sotto 1,5 MB compresso con gzip.
- **`data/printings.json`**: mappa dallo Scryfall ID di ogni printing all'indice della carta, solo per le carte presenti in `cards.json`. Serve a riconoscere le righe dell'export ManaBox tramite la colonna "Scryfall ID". Se il file risulta troppo grande, proponi alternative prima di procedere.
- **`data/names.json`**: indice compatto dei nomi, usato come fallback dal frontend.
- **`data/meta.json`**:
  - data di generazione;
  - data dell'ultimo torneo;
  - numero di tornei e di mazzi;
  - data del bulk Scryfall;
  - stato della fonte (ok o ferma).
- **`data/reviews/<set>.json` e `.md`**: report di revisione per ogni espansione.
- **`data/snapshots/<data>.json`**: snapshot ridotto della lista, usato per i confronti tra revisioni.

## Aggiornamento automatico e revisione dopo ogni espansione

GitHub Actions, con un solo workflow e più job:

1. **update-data** (cron settimanale e `workflow_dispatch`):
   - clona la fonte e aggiorna il bulk Scryfall;
   - ricalcola tutto da zero (circa 200.000 mazzi, è economico) e rigenera gli output;
   - fa commit solo se qualcosa è cambiato, poi redeploy.
2. **Rilevamento delle espansioni**: per ogni `oracle_id` trova la prima printing common in carta o su MTGO, cioè la regola di legalità del Pauper. Un set è "rilevante" se introduce almeno N carte (soglia nella tabella delle decisioni).
   - Valida la regola sui set degli ultimi 2 anni.
   - **Mostrami l'elenco dei set rilevanti prima di fissare la regola.**
3. **Revisione**: parte quando oggi ≥ data di uscita del set + ritardo, e non esiste ancora una revisione per quel set. Il report contiene:
   - a) le carte del nuovo set entrate nella lista, con numero di mazzi e percentuale;
   - b) le carte entrate e uscite dalla definizione default rispetto alla revisione precedente;
   - c) i cambi di legalità (ban e unban);
   - d) i nuovi nomi non risolti.

   La revisione è anche il **recheck generale**:
   - ri-risoluzione di tutti i nomi con il bulk aggiornato (rinomine, errata, alias);
   - riapplicazione di alias ed esclusioni;
   - verifica della legalità di tutte le carte.
4. **Notifica**: apri una GitHub Issue con il riassunto del report, così arriva una email.
5. **Allarme fonte ferma**: se l'ultimo torneo è più vecchio di 21 giorni:
   - apri una Issue "fonte dati ferma", con i fork di MTGODecklistCache aggiornati più di recente (tramite GitHub API);
   - la UI mostra un avviso.

## Frontend

- **Stack**: statico; suggerito Vite + TypeScript, senza framework pesanti. Testi in italiano.
- **Lista integrata**: non va caricata. L'utente carica solo l'export ManaBox (singoli Binder o intera collezione) e assegna i ruoli come nel prototipo, con List e deck esclusi di default.
- **Confronto**:
  - prima via Scryfall ID della riga → `printings.json` → `oracle_id`;
  - poi, come fallback, per nome tramite `names.json`;
  - mostra quante righe non sono state riconosciute e quali.
- **Preset della definizione di "giocata"**, con il conteggio di carte per ciascuno:
  - Meta attuale (61 giorni);
  - Ultimo anno (default);
  - Ultimi 2 anni;
  - Storico.
- **Controlli**: minimo mazzi, solo legali, escludi terre base, conta anche il side.
- **Tabella**, ordinabile per percentuale di mazzi e per nome, con filtri e ricerca:
  - carta e stato (posseduta / parziale / mancante);
  - copie possedute e copie tipiche;
  - percentuale di mazzi e ultima apparizione;
  - set d'ingresso;
  - printing possedute e Binder in cui si trovano.
- **"Conta le copie"**: confronta con le copie tipiche giocate, perché la lista integrata non ha quantità. Spiegalo nella UI.
- **Sezione "Novità"**: le revisioni più recenti, con il loro report.
- **Export**:
  - possedute e mancanti in formato "1 Nome", con quantità uguale alle copie mancanti se "Conta le copie" è attivo;
  - List riallineata in CSV per ManaBox: per le carte possedute usa una printing che hai, per le mancanti la printing di riferimento di `oracle_cards`.
- **Banner** con la data dei dati e lo stato della fonte.
- **Privacy**: la collezione non lascia mai il browser. Persistenza in IndexedDB o localStorage, nessuna analytics.
- **Qualità**: responsive (uso da iPhone e da Mac), tema chiaro e scuro, accessibilità di base.

## Test e criteri di accettazione

- **pytest**:
  - normalizzazione dei nomi e alias;
  - DFC, split e adventure;
  - statistiche su fixture piccole;
  - rilevamento dei set rilevanti.
- **Spot-check**: queste carte devono essere presenti nello storico:
  - Monastery Swiftspear, Ephemerate, Kor Skyfisher, Basking Broodscale;
  - Tolarian Terror, Cryogen Relic, Refurbished Familiar, Sneaky Snacker;
  - Utrom Monitor, Fire // Ice, Gush, Kuldotha Rebirth.

  Gush e Monastery Swiftspear devono risultare banned.
- **Confronto con la baseline**: numeri della tabella sopra, con spiegazione di ogni differenza.
- **Frontend**:
  - test con export ManaBox reali presi da `reference/private/`: DFC, carte in italiano, foil, proxy;
  - smoke test Playwright su desktop e mobile.
- **CI**: il job completo deve girare in meno di 20 minuti.

## Modo di lavorare

- **Procedi per fasi.** Alla fine di ogni fase fermati e riporta: cosa hai fatto, i comandi per verificarlo, i numeri ottenuti e i problemi aperti.
  - **Fase 0**: setup del repo, `CLAUDE.md`, `.gitignore` (con `reference/private/`). Verifica gli strumenti: `python3`, `node`, `git`, `gh auth status`. Ispeziona lo schema della fonte, il bulk Scryfall e un export ManaBox reale. Niente codice applicativo.
  - **Fase 1**: pipeline in locale, test e confronto con la baseline.
  - **Fase 2**: frontend con i dati reali.
  - **Fase 3**: GitHub Actions (aggiornamento, revisione, allarmi) e deploy.
  - **Fase 4**: rifinitura e README in italiano. Il README spiega come modificare a mano alias ed esclusioni, come lanciare un aggiornamento manuale e come forzare una revisione.
- **Domande**: fammi domande solo se sono bloccanti. Per il resto usa i default di questa spec e dichiara le assunzioni.
- **Formati**: non inventare formati di dati. Verificali su file reali: fonte, bulk Scryfall, export ManaBox.
- **Segreti**: nessun segreto nel repo. Nelle Actions usa solo `GITHUB_TOKEN`, con i permessi minimi necessari (contents, pages, issues).
- **`CLAUDE.md`**: scopo, struttura, comandi, convenzioni e decisioni prese. Tienilo aggiornato quando le decisioni cambiano.
