// Simboli di mana dallo sprite data/manasymbols.svg (symbology di Scryfall ripulita dalla pipeline, più un simbolo
// originale per "Multicolore"). Mantengono i loro colori: non si ricolorano. Ammessi come piccole icone per decisione
// dell'utente (vedi CLAUDE.md, "Legale e trasparenza").

import { svg } from '../lib/dom';

export const MANA_SPRITE = 'data/manasymbols.svg';

/** W U B R G, C (incolore), M (multicolore, originale) e N0…N6 (mana generico). */
export type ManaSymbol = 'W' | 'U' | 'B' | 'R' | 'G' | 'C' | 'M' | `N${0 | 1 | 2 | 3 | 4 | 5 | 6}`;

const VALID = /^(?:[WUBRGCM]|N[0-6])$/;

/**
 * Simbolo di mana. Con `label` è un'immagine con quel testo alternativo; senza, è decorativo (quando il significato
 * è già scritto accanto o nell'etichetta del gruppo).
 */
export function manaIcon(sym: ManaSymbol, label: string | null = null): Element {
  const id = VALID.test(sym) ? sym : 'C';
  return svg('svg', { class: 'mana', viewBox: '0 0 100 100', focusable: 'false', ...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true' }) },
    svg('use', { href: `${MANA_SPRITE}#${id}` }));
}
