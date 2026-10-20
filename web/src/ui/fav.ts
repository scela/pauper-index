// Preferite nell'interfaccia: stato in memoria, pulsante a cuore (scheda, righe su desktop, Carta dimenticata, Debutti)
// e segno ♥ che non si preme (righe su mobile, decklist dei Mazzi). Tutti gli elementi portano data-fav con la chiave
// della carta: un cambio aggiorna solo il loro stato (syncFavs), senza ridisegnare gli elenchi.

import { t } from '../i18n';
import { track } from '../lib/analytics';
import { cardByName, type Data } from '../lib/data';
import { h, svg } from '../lib/dom';
import { favKey, reconcile, toggleFav, type Fav, type FavEntry, type FavRef, type NameSource } from '../lib/favorites';
import { readFavs, updateFavs } from '../lib/favstore';

export interface FavCtx {
  data: () => Data | null;
  /** le preferite sono cambiate (aggiunta, rimozione, import, caricamento) */
  changed: () => void;
}

let ctx: FavCtx | null = null;
let list: Fav[] = [];
let entries: FavEntry[] = [];
let keys = new Set<string>();
let favIdx = new Set<number>();
/** nomi di tutte le carte (cardnames.json), quando la pagina delle preferite li ha scaricati */
let allIndex: Map<string, string> | null = null;
let italian: Map<string, string> | null = null;
let noteShown = false;

export const refOf = (d: Data, idx: number): FavRef => ({ n: d.cards.c[idx].n, o: d.cards.c[idx].o });

export function nameSource(d: Data): NameSource {
  return { cards: d.cards.c, cardIdx: (n) => cardByName(d, n), all: allIndex, italian };
}

/** Ricalcola chiavi, indici ed elenco riconciliato; true se la riconciliazione ha cambiato qualcosa da salvare. */
function rebuild(): boolean {
  const d = ctx?.data();
  keys = new Set(list.map(favKey));
  if (!d) {
    entries = list.map((fav) => ({ fav, idx: -1, status: 'pending' }));
    favIdx = new Set();
    return false;
  }
  const r = reconcile(list, nameSource(d));
  list = r.list;
  entries = r.entries;
  keys = new Set(list.map(favKey));
  favIdx = new Set(entries.filter((e) => e.idx >= 0).map((e) => e.idx));
  return r.changed;
}

function after(): void {
  if (rebuild()) void updateFavs((l) => reconcileStored(l));
  syncFavs();
  ctx?.changed();
}

/** Applica la riconciliazione anche alla lista salvata (nomi aggiornati, oracle_id aggiunti). */
function reconcileStored(l: Fav[]): Fav[] {
  const d = ctx?.data();
  return d ? reconcile(l, nameSource(d)).list : l;
}

export function initFav(c: FavCtx): void {
  ctx = c;
  document.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button.favbtn');
    if (!b) return;
    const ref: FavRef = { n: b.dataset.n!, ...(b.dataset.o ? { o: b.dataset.o } : {}) };
    const added = toggle(ref);
    if (added && b.closest('#sheet') && !noteShown) {
      noteShown = true;
      // solo la prima volta in questa visita: dove si ritrovano le preferite
      b.closest('#sheet')!.querySelector('.sheet-head')?.after(h('p', { class: 'favnote', role: 'status' },
        t('fav.addedNote'), ' · ', h('a', { href: '#preferite' }, t('fav.see'))));
    }
  });
}

/** Legge le preferite salvate (all'avvio, dopo i dati). */
export async function loadFavs(): Promise<void> {
  list = await readFavs();
  after();
}

/** Aggiunge o toglie subito (nella pagina), poi salva rileggendo la lista salvata. Restituisce true se aggiunta. */
export function toggle(ref: FavRef): boolean {
  const r = toggleFav(list, ref, Date.now());
  list = r.list;
  const k = favKey(ref);
  const fav = r.added ? list[0] : null;
  if (r.added) track('preferita');
  void updateFavs((l) => {
    const rest = l.filter((x) => favKey(x) !== k);
    return fav ? [fav, ...rest] : rest;
  }).then(({ list: saved, ok }) => {
    if (ok) list = saved;
    after();
  });
  rebuild();
  syncFavs();
  ctx?.changed();
  return r.added;
}

/** Modifica qualsiasi (import, rimozione, svuota, annulla): salvata e poi mostrata. */
export async function changeFavs(fn: (l: Fav[]) => Fav[]): Promise<boolean> {
  list = fn(list);
  rebuild();
  syncFavs();
  ctx?.changed();
  const { list: saved, ok } = await updateFavs(fn);
  if (ok) list = saved;
  after();
  return ok;
}

/** "Cancella i miei dati": il database è già stato eliminato. */
export function resetFavs(): void {
  list = [];
  noteShown = false;
  after();
}

/** Nomi di tutte le carte e nomi italiani arrivati: le preferite mai giocate si riconoscono. */
export function setNameIndexes(all: Map<string, string> | null, it?: Map<string, string> | null): void {
  if (all) allIndex = all;
  if (it) italian = it;
  after();
}

export const favEntries = (): FavEntry[] => entries;
export const favList = (): Fav[] => list;
export const favIndices = (): Set<number> => favIdx;
export const isFav = (ref: FavRef): boolean => keys.has(favKey(ref));
export const hasAllNames = (): boolean => !!allIndex;
export const hasItalian = (): boolean => !!italian;

const heartPath = 'M12 20.4l-7.3-7.1a4.8 4.8 0 0 1 0-6.9 4.9 4.9 0 0 1 6.9 0l.4.4.4-.4a4.9 4.9 0 0 1 6.9 0 4.8 4.8 0 0 1 0 6.9z';

function heartIcon(cls: string): Element {
  return svg('svg', { class: cls, viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, svg('path', { d: heartPath }));
}

/** Pulsante a cuore (44×44): nome accessibile fisso, stato con aria-pressed; il suggerimento dice cosa fa il clic. */
export function heartBtn(ref: FavRef, cls = ''): HTMLButtonElement {
  const on = isFav(ref);
  const b = h('button', {
    class: `favbtn${cls ? ` ${cls}` : ''}`, type: 'button', 'aria-pressed': String(on), 'aria-label': t('fav.btn', { name: ref.n }),
    title: on ? t('fav.remove') : t('fav.add'), dataset: { fav: favKey(ref), n: ref.n, ...(ref.o ? { o: ref.o } : {}) },
  }, heartIcon('fav-ico'));
  return b as HTMLButtonElement;
}

/** Segno ♥ (14 px) accanto al nome, solo per le preferite: non si preme e non occupa spazio in più. */
export function favMark(ref: FavRef): HTMLElement {
  return h('span', { class: 'favmark', dataset: { fav: favKey(ref) }, hidden: !isFav(ref) }, heartIcon('fm-ico'),
    h('span', { class: 'sr' }, t('fav.mark')));
}

/** Nome accessibile del pulsante di una riga con il segno ♥: "Pyroblast, preferita: apri la scheda". */
export function cardOpenLabel(name: string, fav: boolean): string {
  return t(fav ? 'card.openFav' : 'card.open', { name });
}

/** Aggiorna cuori, segni e conteggi già nella pagina. */
export function syncFavs(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-fav]').forEach((el) => {
    const on = keys.has(el.dataset.fav!);
    if (el.classList.contains('favbtn')) {
      el.setAttribute('aria-pressed', String(on));
      el.title = on ? t('fav.remove') : t('fav.add');
    } else {
      el.hidden = !on;
      // segno dentro il pulsante della carta (righe su mobile): l'aria-label sostituisce il contenuto, quindi lo dice lui
      const btn = el.closest<HTMLElement>('[data-card-name]');
      if (btn) btn.setAttribute('aria-label', cardOpenLabel(btn.dataset.cardName!, on));
    }
  });
  const n = list.length;
  document.querySelectorAll<HTMLElement>('.favcount').forEach((el) => { el.textContent = n ? ` (${n})` : ''; });
}
