// Pagina "Preferite" (#preferite): tutte le preferite, anche le carte mai giocate in Pauper, con possesso, prezzo e dati
// del periodo; export "1 Nome" e import da una lista di testo (unisce, non sostituisce); svuota con Annulla.

import { fmtDateShort, fmtEur, fmtInt, fmtPct, t, type Key } from '../i18n';
import { deckShare, typicalCopies, type Opts } from '../lib/compare';
import { imageUrl, loadCardNames, type Data } from '../lib/data';
import { $, h } from '../lib/dom';
import { allNamesIndex, favText, italianIndex, mergeFavs, parseFavList, type Fav, type FavEntry, type FavSort } from '../lib/favorites';
import { loadItalian } from '../lib/italian';
import { norm } from '../lib/norm';
import { cheapestPrice, type PricesFile } from '../lib/prices';
import type { CollectionIndex } from '../lib/quick';
import { lsGet, lsSet } from '../lib/store';
import { changeFavs, favEntries, favList, favMark, hasAllNames, hasItalian, heartBtn, nameSource, setNameIndexes } from './fav';

export interface FavPageDeps {
  data: () => Data | null;
  opts: () => Opts;
  /** periodo (lo stesso, salvato, della pagina principale) */
  setWin: (w: number) => void;
  collection: () => CollectionIndex | null;
  prices: () => PricesFile | null;
  /** testo del prezzo di una carta giocata (printing posseduta o "da X €") */
  price: (idx: number) => string;
  /** scheda ridotta di una carta mai giocata */
  openNever: (anchor: HTMLElement, e: { name: string; legal: 'l' | 'b' | 'n' }) => void;
  copy: (text: string, what: string) => void;
  save: (text: string, filename: string, what: string) => void;
}

const UNDO_MS = 8000;
const SORTS: FavSort[] = ['recent', 'name', 'share'];

export function initFavPage(deps: FavPageDeps): { show(): void; refresh(): void } {
  let sort: FavSort = SORTS.includes(lsGet('favSort') as FavSort) ? (lsGet('favSort') as FavSort) : 'recent';
  /** legalità delle carte mai giocate, da cardnames.json */
  let legal: Map<string, 'l' | 'b' | 'n'> | null = null;
  let namesLoading: Promise<boolean> | null = null;
  let undo: { before: Fav[]; timer: number } | null = null;
  const view = $('#viewFav');
  const list = $('#favList');
  const status = $('#favStatus');
  const sortSel = $('#favSort') as HTMLSelectElement;
  const periodSel = $('#favPeriod') as HTMLSelectElement;
  sortSel.value = sort;

  /** Tutti i nomi (cardnames.json): servono alle preferite mai giocate e all'import. */
  const ensureNames = (): Promise<boolean> => {
    if (hasAllNames() && legal) return Promise.resolve(true);
    namesLoading ??= loadCardNames().then((all) => {
      namesLoading = null;
      if (!all) return false;
      legal = new Map(all.map(([n, l]) => [norm(n), (l as 'l' | 'b' | 'n') || 'n']));
      setNameIndexes(allNamesIndex(all));
      return true;
    });
    return namesLoading;
  };

  /** Nomi italiani (anche delle carte mai giocate): solo per l'import. */
  const ensureItalian = async (d: Data): Promise<void> => {
    if (hasItalian()) return;
    const [all, it] = await Promise.all([loadCardNames(), loadItalian(d.cards.c.length, true)]);
    if (it) setNameIndexes(null, italianIndex(d.cards.c, it.played, it.other, all));
  };

  const ordered = (d: Data, entries: FavEntry[]): FavEntry[] => {
    const name = (e: FavEntry) => e.fav.n;
    const byName = (a: FavEntry, b: FavEntry) => name(a).localeCompare(name(b), 'en', { sensitivity: 'base' });
    const out = [...entries]; // la lista salvata è già dalle aggiunte più recenti
    if (sort === 'name') out.sort(byName);
    else if (sort === 'share') {
      const share = (e: FavEntry) => (e.idx >= 0 ? deckShare(d, d.cards.c[e.idx], deps.opts()) : -1);
      out.sort((a, b) => share(b) - share(a) || byName(a, b));
    }
    return out;
  };

  function thumbId(d: Data, idx: number): string | undefined {
    const prints = d.prints.p[idx] || [];
    const own = deps.collection()?.byCard.get(idx);
    for (const p of own?.prints || []) {
      const id = p.row.i || (p.print >= 0 ? prints[p.print]?.[0] : '');
      if (id) return id;
    }
    return prints[d.cards.c[idx].r]?.[0];
  }

  function row(d: Data, e: FavEntry): HTMLElement {
    const coll = deps.collection();
    const ref = { n: e.fav.n, ...(e.fav.o ? { o: e.fav.o } : {}) };
    if (e.idx >= 0) {
      const c = d.cards.c[e.idx];
      const opts = deps.opts();
      const owned = coll?.byCard.get(e.idx)?.total || 0;
      const id = thumbId(d, e.idx);
      const ref0 = d.prints.p[e.idx]?.[c.r]?.[0];
      const st = c.s[opts.win];
      const line1 = [
        st ? t('row.share', { pct: fmtPct(deckShare(d, c, opts)) }) : t('sheet.notPlayed', { period: t(`period.${opts.win}` as Key) }),
        coll ? (owned > 0 ? t('row.owned', { n: owned }) : t('deb.notOwned')) : st ? t('row.typical', { n: typicalCopies(c, opts) }) : '',
        t('row.seen', { date: fmtDateShort(c.z, Number(d.cards.anchor.slice(0, 4))) }),
      ].filter(Boolean).join(' · ');
      return h('li', { class: 'favrow' + (coll && owned > 0 ? ' is-owned' : '') },
        h('button', { class: 'cardbtn fav-card', type: 'button', dataset: { idx: String(e.idx) }, 'aria-haspopup': 'dialog', 'aria-label': t('card.open', { name: c.n }) },
          id ? h('img', { class: 'thumb' + (owned > 0 ? ' owned' : ''), src: imageUrl(id, 'small'), alt: '', loading: 'lazy', width: 146, height: 204,
            dataset: ref0 ? { fallback: imageUrl(ref0, 'small') } : undefined }) : h('span', { class: 'thumb fav-noimg', 'aria-hidden': 'true' }),
          h('span', { class: 'nmwrap' }, h('span', { class: 'nm' }, c.n),
            c.l === 'b' ? h('span', { class: 'badge banned' }, t('badge.banned')) : c.l === 'n' ? h('span', { class: 'badge' }, t('fav.notLegal')) : null,
            h('span', { class: 'fline' }, line1),
            h('span', { class: 'fline2' }, deps.price(e.idx)))),
        heartBtn(ref));
    }
    // mai giocata (o in attesa dei nomi): nessuna immagine nei dati del sito, nessun prezzo
    const lg = legal?.get(norm(e.fav.n)) || 'n';
    const own = coll?.byName.get(norm(e.fav.n))?.total || 0;
    const line1 = [t('quick.never'), coll ? (own > 0 ? t('row.owned', { n: own }) : t('deb.notOwned')) : ''].filter(Boolean).join(' · ');
    return h('li', { class: 'favrow never' + (coll && own > 0 ? ' is-owned' : '') },
      h('button', { class: 'favnever fav-card', type: 'button', dataset: { name: e.fav.n, legal: lg }, 'aria-haspopup': 'dialog', 'aria-label': t('card.open', { name: e.fav.n }) },
        h('span', { class: 'thumb fav-noimg', 'aria-hidden': 'true' }),
        h('span', { class: 'nmwrap' }, h('span', { class: 'nm' }, e.fav.n),
          lg === 'b' ? h('span', { class: 'badge banned' }, t('badge.banned')) : lg === 'n' && legal ? h('span', { class: 'badge' }, t('fav.notLegal')) : null,
          h('span', { class: 'fline' }, line1),
          h('span', { class: 'fline2' }, '—'))),
      heartBtn(ref));
  }

  function render(): void {
    const d = deps.data();
    if (!d) {
      status.textContent = t('data.loading');
      return;
    }
    const entries = favEntries();
    const coll = deps.collection();
    const prices = deps.prices();
    const shown = ordered(d, entries.filter((e) => e.status !== 'missing'));
    const missing = entries.filter((e) => e.status === 'missing');
    const pending = entries.some((e) => e.status === 'pending');
    if (pending) void ensureNames();
    status.textContent = pending ? t('fav.pending') : '';

    // riepilogo: quante, quante possedute, costo indicativo delle mancanti (una copia ciascuna)
    $('#favVerdict').textContent = t('fav.count', { n: entries.length });
    const owned = (e: FavEntry) => (e.idx >= 0 ? coll?.byCard.get(e.idx)?.total || 0 : coll?.byName.get(norm(e.fav.n))?.total || 0);
    const nOwned = coll ? shown.filter((e) => owned(e) > 0).length : 0;
    const toBuy = shown.filter((e) => !coll || owned(e) === 0);
    let cost = 0;
    let unpriced = 0;
    for (const e of toBuy) {
      const c = e.idx >= 0 ? cheapestPrice(prices, e.idx) : 0;
      if (c) cost += c;
      else unpriced++;
    }
    const bits: string[] = [];
    if (coll) bits.push(t('fav.ownedN', { n: fmtInt(nOwned) }));
    if (prices && toBuy.length) {
      bits.push(t(coll ? 'fav.missingCost' : 'fav.listCost', { v: fmtEur(cost) }) + (unpriced ? ` (${t('price.unpriced', { n: fmtInt(unpriced) })})` : ''));
    }
    $('#favSub').textContent = bits.join(' · ');
    $('#favTools').hidden = !entries.length;

    periodSel.replaceChildren(...[0, 1, 2, 3].map((i) => h('option', { value: String(i), selected: deps.opts().win === i }, t(`period.${i}` as Key))));
    periodSel.value = String(deps.opts().win);

    // si ridisegna senza perdere il focus: si ritrova per carta
    const focusKey = (document.activeElement as HTMLElement | null)?.closest?.('.favrow')?.querySelector<HTMLElement>('.favbtn')?.dataset.fav;
    const focusHeart = document.activeElement?.classList.contains('favbtn');
    list.replaceChildren(...shown.map((e) => row(d, e)));
    if (focusKey) {
      const b = list.querySelector<HTMLElement>(`.favbtn[data-fav="${CSS.escape(focusKey)}"]`);
      const target = focusHeart ? b : b?.closest('.favrow')?.querySelector<HTMLElement>('.fav-card');
      target?.focus({ preventScroll: true });
    }
    $('#favEmpty').hidden = entries.length > 0;
    $('#favEmpty').textContent = t('fav.empty');
    $('#favClear').hidden = !entries.length;
    $('#favExport').hidden = !entries.length;

    $('#favMissing').replaceChildren(...(missing.length ? [h('section', { class: 'fav-missing' },
      h('h3', null, t('fav.missingTitle', { n: missing.length })),
      h('p', { class: 'note' }, t('fav.missingNote')),
      h('ul', null, ...missing.map((e) => h('li', null, h('span', null, e.fav.n), favMark({ n: e.fav.n }), heartBtn({ n: e.fav.n })))))] : []));
  }

  function showUndo(before: Fav[], text: string): void {
    window.clearTimeout(undo?.timer);
    const bar = $('#favUndo');
    bar.hidden = false;
    bar.replaceChildren(h('span', { class: 'undo-text' }, text), h('button', { class: 'btn small undo-btn', type: 'button', id: 'favUndoBtn' }, t('load.undo')));
    ($('#favUndoBtn') as HTMLButtonElement).focus();
    undo = { before, timer: window.setTimeout(hideUndo, UNDO_MS) };
  }

  function hideUndo(): void {
    window.clearTimeout(undo?.timer);
    undo = null;
    const bar = $('#favUndo');
    bar.hidden = true;
    bar.replaceChildren();
  }

  $('#favUndo').addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id !== 'favUndoBtn' || !undo) return;
    const before = undo.before;
    hideUndo();
    // si rimettono le preferite com'erano, tenendo quelle aggiunte nel frattempo
    void changeFavs((l) => mergeFavs(l, before).list.sort((a, b) => b.at - a.at)).then(() => list.querySelector<HTMLElement>('.fav-card')?.focus());
  });

  // cuore premuto nella pagina: la carta esce dall'elenco, con Annulla (il cambio lo fa il gestore comune in ui/fav)
  view.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button.favbtn');
    if (b && b.getAttribute('aria-pressed') === 'true') showUndo(favList(), t('fav.removed', { name: b.dataset.n! }));
    const nv = (e.target as HTMLElement).closest<HTMLElement>('button.favnever');
    if (nv) deps.openNever(nv, { name: nv.dataset.name!, legal: (nv.dataset.legal as 'l' | 'b' | 'n') || 'n' });
  }, true);

  sortSel.addEventListener('change', () => {
    sort = sortSel.value as FavSort;
    lsSet('favSort', sort);
    render();
  });
  periodSel.addEventListener('change', () => deps.setWin(Number(periodSel.value)));

  const exportText = () => {
    const d = deps.data();
    if (!d) return '';
    const entries = favEntries();
    // nell'ordine della pagina; le non trovate in fondo
    return favText([...ordered(d, entries.filter((e) => e.status !== 'missing')), ...entries.filter((e) => e.status === 'missing')].map((e) => e.fav));
  };
  $('#favCopy').addEventListener('click', () => deps.copy(exportText(), t('fav.what')));
  $('#favSave').addEventListener('click', () => deps.save(exportText(), t('fav.file'), t('fav.what')));

  const result = $('#favImportResult');
  async function doImport(text: string): Promise<void> {
    const d = deps.data();
    if (!d) return;
    if (!text.trim()) {
      result.replaceChildren(h('p', { class: 'errors' }, t('fav.importEmpty')));
      return;
    }
    result.replaceChildren(h('p', { class: 'note' }, t('fav.importing')));
    await Promise.all([ensureNames(), ensureItalian(d)]);
    const r = parseFavList(text, nameSource(d), Date.now());
    const m = mergeFavs(favList(), r.favs);
    if (r.favs.length) await changeFavs((l) => mergeFavs(l, r.favs).list);
    const bits = [t('fav.imported', { n: m.added })];
    if (m.already) bits.push(t('fav.already', { n: m.already }));
    if (r.dups) bits.push(t('fav.dups', { n: r.dups }));
    if (r.unknown.length) bits.push(t('fav.unknown', { n: r.unknown.length }));
    const shown = r.unknown.slice(0, 60);
    result.replaceChildren(h('p', { role: 'status' }, bits.join(', ') + '.'),
      ...(shown.length ? [h('details', null, h('summary', null, t('imp.unrecTitle')),
        h('ul', null, ...shown.map((n) => h('li', null, n))),
        r.unknown.length > shown.length ? h('p', { class: 'note' }, t('imp.more', { n: r.unknown.length - shown.length })) : null)] : []));
    if (r.favs.length) ($('#favText') as HTMLTextAreaElement).value = '';
  }
  $('#favImportBtn').addEventListener('click', () => void doImport(($('#favText') as HTMLTextAreaElement).value));
  $('#favFile').addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (f) void doImport(await f.text());
  });

  $('#favClear').addEventListener('click', () => {
    const before = favList();
    if (!before.length) return;
    void changeFavs(() => []);
    showUndo(before, t('fav.cleared'));
  });

  return {
    show() {
      render();
    },
    refresh() {
      if (!view.hidden) render();
    },
  };
}

