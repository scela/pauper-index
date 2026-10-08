# Pauper Index

Di tutte le carte giocate in Pauper, quali possiedi, in qualunque printing?

Pauper Index confronta la tua collezione [ManaBox](https://manabox.app) con la lista delle carte giocate nei tornei Pauper (MTGO e cartaceo). La lista è integrata nel sito e si aggiorna da sola **ogni giorno**; tu carichi solo la tua collezione, che resta nel browser.

- **Sito**: https://pauperindex.com (il vecchio indirizzo https://scela.github.io/pauper-index/ reindirizza qui)
- **Dati**: decklist da [MTGODecklistCache](https://github.com/Jiliac/MTGODecklistCache), carte, legalità e immagini da [Scryfall](https://scryfall.com).
- **Segnalazioni**: massadalbe@hotmail.com
- **Sostieni il sito**: https://ko-fi.com/pauperindex (il sito resta gratuito e completo)

## Come funziona nel dettaglio

Queste spiegazioni stavano nella pagina Informazioni del sito, che ora è breve.

**Collezione**
- Si carica l'export CSV di ManaBox (singoli Binder o l'intera collezione) oppure una lista di testo ("4 Nome carta" o "1 Nome (SET) 123"). File e testo vengono letti solo nel browser.
- Contano come possedute le carte dei Binder; List e mazzi sono esclusi di default (si cambia in "Binder inclusi"). Il testo incollato conta tutto come posseduto.
- Una carta è riconosciuta in qualunque printing, lingua o finitura: conta la carta, non la stampa.

**Filtri e viste**
- "Conta anche il side" include le carte giocate solo in sideboard; "Min. mazzi" è il numero di mazzi necessario per entrare nella lista.
- Le terre base (comprese le Snow-Covered e Wastes) sono sempre escluse.
- Il controllo rapido dice se una carta è giocata in Pauper anche quando è fuori dalla lista con i filtri attuali e, con la collezione, se la possiedi.
- Il filtro "Espansione" mostra le carte della lista stampate in quel set a qualsiasi rarità, perché la legalità è della carta e non della stampa. I set collegati sono raggruppati; promo, Secret Lair, The List e set solo digitali sono nascosti di default. In questa vista ogni carta mostra l'immagine della stampa di quel set, con il simbolo dell'espansione colorato secondo la rarità.
- I simboli delle espansioni sono le icone di Scryfall, scaricate dalla pipeline e servite dal sito in un unico file (`data/seticons.svg`).
- I prezzi sono indicativi: prezzi Cardmarket in euro (`eur`, `eur_foil`) presenti nei dati di Scryfall. Per una carta posseduta si mostra la printing posseduta di valore più alto (foil se è foil); per una mancante la printing non foil più economica ("da X €"); nella vista per espansione la stampa di quel set. Le printing in altre lingue hanno il prezzo della printing corrispondente, perché Scryfall dà un prezzo per printing e non per lingua.
- La pagina "Carta dimenticata" (in testata) pesca una carta legale con almeno 20 mazzi nello storico e nessuna apparizione nell'ultimo anno.

**Dati e limiti**
- Le League di MTGO pubblicano solo le liste 5-0; dal 20 giugno 2024 i Challenge pubblicano solo i primi 32 mazzi. Per questo le percentuali recenti favoriscono i mazzi vincenti.
- Dei tornei dal vivo ci sono solo quelli con le liste pubblicate su melee.gg, CardsRealm o topdeck.gg.
- La fonte (MTGODecklistCache) dichiara di non essere più mantenuta attivamente: se smette di aggiornarsi, il sito mostra un avviso e il workflow apre una Issue.
- Alcuni archivi contengono gli stessi tornei più volte: i duplicati vengono rimossi (regole in `CLAUDE.md`, "Deduplica"). I nomi scritti male o in altre lingue vengono ricondotti alla carta giusta quando possibile.
- Le finestre (61 giorni, 1 anno, 2 anni, storico) partono dalla data dell'ultimo torneo disponibile. "Copie tipiche" è la mediana delle copie nei mazzi che giocano la carta.
- La lingua, il tema e l'ordinamento sono ricordati nel browser (localStorage); la collezione in IndexedDB.

## Come si aggiorna

Il workflow [`Aggiorna e pubblica`](.github/workflows/aggiorna.yml) gira ogni giorno alle 07:23 UTC:

1. scarica le nuove decklist e i dati Scryfall e ricalcola tutto da zero;
2. se i dati sono cambiati fa un commit (`Dati: aggiornamento del …`) e ripubblica il sito; i prezzi (`data/prices.json`) non si committano, perché cambiano ogni giorno: li genera il job di pubblicazione (`python -m pauper_index prices`);
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
python -m pauper_index prices   # solo i prezzi, con il bulk Scryfall più recente
```

## Avviso

Pauper Index is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.

Il progetto non è affiliato a Wizards of the Coast, ManaBox o Scryfall.
