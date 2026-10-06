// Simbolo di un'espansione dallo sprite data/seticons.svg (icone di Scryfall ripulite dalla pipeline).
// Il colore viene da currentColor: segue il tema e, con la rarità, i colori di comune, non comune, rara e mitica.

import { h, svg } from '../lib/dom';

export const SPRITE = 'data/seticons.svg';

/**
 * Icona del set. Con `label` è un'immagine con il nome del set come testo alternativo; senza, è decorativa
 * (quando il nome è già scritto accanto). Un set senza icona dà uno spazio vuoto, per tenere allineato il testo.
 */
export function setIcon(icon: string, label: string | null, rarity?: string): Element {
  const cls = 'seticon' + (rarity ? ` rar-${rarity}` : '');
  if (!/^[a-z0-9_-]+$/.test(icon)) return h('span', { class: `${cls} none`, 'aria-hidden': 'true' });
  const el = svg('svg', { class: cls, focusable: 'false', ...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true' }) },
    svg('use', { href: `${SPRITE}#${icon}` }));
  return el;
}
