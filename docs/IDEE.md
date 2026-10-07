# Idee da valutare dopo la prima versione

- **Archetipo del mazzo**: associare a ogni mazzo un archetipo (per esempio con le regole di MTGOArchetypeParser) e mostrare in quali archetipi si gioca una carta.
- **Tendenza di una carta**: in crescita o in calo, confrontando la percentuale di mazzi tra finestre successive (per esempio gli ultimi 61 giorni contro i 61 precedenti).
- **Export di altre app oltre a ManaBox**: Moxfield, Archidekt, Deckbox, Dragon Shield, Delver Lens, TCGplayer.
- **Prezzi Cardmarket da Scryfall**: valore delle carte possedute e costo delle mancanti, anche per i mazzi da completare.
- **Confronto tra due collezioni**.
- **Condivisione diretta del CSV da ManaBox al sito installato** (Web Share Target nel manifest). Funziona solo su Android, con il sito installato come app; su iPhone non è supportato.
- **Link di affiliazione per le carte mancanti** (per esempio verso un negozio online): da verificare quali programmi esistono (Cardmarket, TCGplayer, Card Kingdom e altri), le loro condizioni e la compatibilità con le regole di Scryfall e con la CSP (solo link semplici, nessuno script).
- **Contatore di visite senza cookie**: da verificare rispetto alla normativa privacy (GDPR e direttiva ePrivacy: dati raccolti, IP, consenso, informativa) e alla CSP; oggi la pagina Informazioni dichiara "nessuna analytics".

## Dopo la funzione 4, in quest'ordine (decise dall'utente il 2026-10-07; non ancora implementate)

1. **Preferite**: un cuore sulle carte (Carta dimenticata, controllo rapido, scheda, vista per espansione) e una sezione "Preferite". Salvate nel browser, con export e import come lista di testo per spostarle tra dispositivi.
2. **Brewing, versione 1**: una scheda in cui si aggiungono carte, anche dalle preferite. Il sito mostra:
   - i mazzi reali in cui le carte comparivano insieme;
   - le carte che le accompagnano più spesso, misurando quanto compaiono insieme più del normale, non con il conteggio grezzo, che premierebbe le carte onnipresenti;
   - quali di queste carte si possiedono.

   Riusa le decklist della funzione 4; valutare un precalcolo nella pipeline per lo storico.
3. **Brewing, versione 2**: idee di sinergia basate sulle funzioni delle carte (crea pedine, sacrifica, riempie il cimitero…), con una tabella di abbinamenti e la spiegazione del perché, etichettate come "idee da provare". Verificare quali fonti di classificazione sono utilizzabili e a quali condizioni.
4. **Da valutare in futuro**: sinergie generate da un modello di intelligenza artificiale. Richiede un server e ha un costo per richiesta, quindi solo se il sito avrà un pubblico che lo giustifichi.
