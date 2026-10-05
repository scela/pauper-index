// Pagina "Informazioni": avviso Fan Content Policy (testo esatto), non affiliazione, crediti,
// limiti dei dati, privacy, segnalazioni.

import type { Data } from '../lib/data';
import { h } from '../lib/dom';
import { fmtDate, fmtInt } from '../lib/format';

export const SITE_TITLE = 'Pauper Index';
// Testo esatto richiesto da company.wizards.com/en/legal/fancontentpolicy (verificato il 2026-10-05).
export const FCP_NOTICE = `${SITE_TITLE} is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.`;

const REPO_URL: string = import.meta.env.VITE_REPO_URL || '';

const ext = (href: string, text: string) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text);

export function renderAbout(root: HTMLElement, d: Data | null): void {
  const m = d?.meta;
  root.replaceChildren(h('article', { class: 'about' },
    h('h2', null, 'Informazioni'),
    h('p', null, `${SITE_TITLE} confronta la tua collezione con le carte giocate in Pauper negli ultimi anni e ti dice quali possiedi, in qualunque printing. È un progetto personale, gratuito e senza alcun guadagno.`),

    h('section', null,
      h('h3', null, 'Come funziona'),
      h('ul', null,
        h('li', null, 'Carica l\'export CSV di ManaBox (singoli Binder o l\'intera collezione) oppure incolla una lista di testo nel formato "4 Nome carta" o "1 Nome (SET) 123". I file e il testo vengono letti solo nel tuo browser.'),
        h('li', null, 'Contano come tue le carte dei Binder; List e mazzi sono esclusi di default. Puoi cambiarlo in fondo alla pagina, in "Binder inclusi". Con il testo incollato non ci sono Binder: tutte le carte contano come possedute.'),
        h('li', null, 'Una carta è riconosciuta in qualunque printing, lingua o finitura: conta la carta, non la stampa.'),
        h('li', null, '"Conta le copie": la lista non ha quantità, quindi il confronto è con le copie tipiche, cioè la mediana delle copie nei mazzi che giocano la carta nel periodo scelto.'),
        h('li', null, '"Conta anche il side": include le carte giocate solo in sideboard. "Min. mazzi": quanti mazzi servono perché una carta entri nella lista.'),
        h('li', null, 'Le terre base (Plains, Island, Swamp, Mountain, Forest, Wastes e le versioni Snow-Covered) non compaiono mai: sono escluse dalla lista e dai risultati.'))),

    h('section', null,
      h('h3', null, 'Avviso'),
      h('blockquote', { lang: 'en', id: 'fcp' }, FCP_NOTICE),
      h('p', null, 'In italiano: questo sito è Fan Content non ufficiale, consentito dalla Fan Content Policy. Non è approvato né sostenuto da Wizards. Parte dei materiali usati è di proprietà di Wizards of the Coast. ©Wizards of the Coast LLC.'),
      h('p', null, 'Il sito non è affiliato, approvato né sostenuto da Wizards of the Coast, da ManaBox o da Scryfall. Magic: The Gathering, i nomi e le immagini delle carte sono di Wizards of the Coast. Il sito non usa loghi né simboli di Wizards, ManaBox o Scryfall.')),

    h('section', null,
      h('h3', null, 'Fonti e crediti'),
      h('ul', null,
        h('li', null, 'Dati delle carte, legalità e immagini: ', ext('https://scryfall.com', 'Scryfall'), '. Le immagini vengono caricate direttamente dai server di Scryfall.'),
        h('li', null, 'Decklist dei tornei: ', ext('https://github.com/Jiliac/MTGODecklistCache', 'MTGODecklistCache'), ' (fork di Jiliac del progetto di Badaro), che raccoglie i risultati pubblicati da mtgo.com, magic.wizards.com (archivio), melee.gg, CardsRealm, topdeck.gg e Manatraders.'),
        h('li', null, 'L\'export della collezione è quello dell\'app ManaBox; il sito legge anche liste di testo nel formato "4 Nome carta".'))),

    h('section', null,
      h('h3', null, 'Limiti dei dati'),
      h('ul', null,
        h('li', null, 'Le League di MTGO pubblicano solo le liste che hanno chiuso 5-0.'),
        h('li', null, 'Dal 20 giugno 2024 i Challenge di MTGO pubblicano solo i primi 32 mazzi, anche quando gli iscritti sono di più (prima comparivano quasi tutti).'),
        h('li', null, 'Per questo le percentuali recenti sovrastimano i mazzi vincenti: una carta molto giocata ma raramente arrivata in alto pesa meno di quanto dovrebbe.'),
        h('li', null, 'Dei tornei dal vivo ci sono solo quelli con le liste pubblicate su melee.gg, CardsRealm o topdeck.gg.'),
        h('li', null, 'La fonte dichiara di non essere più mantenuta attivamente: se smette di aggiornarsi, qui in alto compare un avviso.'),
        h('li', null, 'Alcuni archivi contengono gli stessi tornei più volte: i duplicati vengono rimossi. I nomi delle carte scritti male o in altre lingue vengono ricondotti alla carta giusta quando possibile.'),
        h('li', null, 'Le finestre (61 giorni, 1 anno, 2 anni) partono dalla data dell\'ultimo torneo disponibile. "Copie tipiche" è la mediana delle copie nei mazzi che giocano la carta.')),
      m ? h('p', null, `Dati aggiornati al ${fmtDate(m.last_tournament)}: ${fmtInt(m.tournaments)} tornei, ${fmtInt(m.decks)} mazzi. Generati il ${fmtDate(m.generated_at)}; dati Scryfall del ${fmtDate(m.scryfall.default_cards || '')}. L'aggiornamento è automatico ogni settimana.`) : null),

    h('section', null,
      h('h3', null, 'Privacy'),
      h('ul', null,
        h('li', null, 'Nessun account, nessun cookie, nessuna analytics.'),
        h('li', null, 'La collezione che carichi resta in questo browser (IndexedDB) e non viene inviata a nessun server. Il pulsante "Cancella i miei dati" la elimina.'),
        h('li', null, 'Il sito è ospitato su GitHub Pages, che può registrare dati tecnici di accesso (per esempio l\'indirizzo IP).'),
        h('li', null, 'Le immagini delle carte vengono caricate dai server di Scryfall, che quindi ricevono le normali richieste del browser (senza referrer).'))),

    h('section', null,
      h('h3', null, 'Segnalare un errore'),
      REPO_URL
        ? h('p', null, 'Apri una segnalazione su ', ext(`${REPO_URL.replace(/\/$/, '')}/issues`, 'GitHub'), ', indicando la carta, cosa ti aspettavi e cosa vedi. Non allegare la tua collezione.')
        : h('p', null, 'Apri una segnalazione (issue) nel repository GitHub del progetto, indicando la carta, cosa ti aspettavi e cosa vedi. Non allegare la tua collezione.')),

    h('p', null, h('a', { href: '#' }, '← Torna al confronto')),
  ));
}
