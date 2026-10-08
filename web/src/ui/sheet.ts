// Scheda della carta: ventaglio degli artwork (raggruppati per illustration_id), carta attiva
// intera, dettagli della printing e ultime apparizioni.
//
// Regole di Scryfall sulle immagini: niente sovrapposizioni (le carte del ventaglio sono distanziate,
// così artista e copyright restano visibili), niente deformazioni, filtri o watermark.

import type { Opts, Result } from '../lib/compare';
import { getLang, t } from '../i18n';
import { deckShare, typicalCopies } from '../lib/compare';
import { imageUrl, type Data } from '../lib/data';
import { h } from '../lib/dom';
import { fmtDate, fmtEur, fmtInt, fmtPct, fmtPrint, lastSeen } from '../lib/format';
import { ownedPrices, printPrice, type PricesFile } from '../lib/prices';

export const FAN_MAX = 7;
/** Passaggio del mouse: apertura dopo che il cursore si ferma, comparsa e dissolvenza in chiusura (ms). */
export const HOVER_OPEN_MS = 100;
const FADE_OUT_MS = 80;
/** Dopo una chiusura per uscita del mouse, entro questo tempo la carta successiva apre la scheda subito. */
const WARM_MS = 250;

export interface FanItem {
  id: string;
  set: string;
  cn: string;
  artist: string;
  setName: string;
  date: string;
  back: boolean;
  owned: boolean;
  lang: string;
  pi: number; // indice in printings.p[carta]; -1 per una printing posseduta non presente nei dati (altra lingua)
}

/**
 * Un elemento per artwork: preferisce la stampa indicata (`focusId`, la stampa del set nella vista per espansione),
 * poi la printing posseduta, altrimenti la più recente in inglese.
 */
export function fanItems(d: Data, idx: number, res: Result | null, focusId?: string): FanItem[] {
  const prints = d.prints.p[idx] || [];
  const ownedIds = new Set<string>();
  const extra: FanItem[] = [];
  for (const op of res?.prints || []) {
    if (op.print >= 0) ownedIds.add(prints[op.print][0]);
    else if (op.row.i) {
      if (prints.some((p) => p[0] === op.row.i)) ownedIds.add(op.row.i);
      else {
        const set = (op.row.s || '').toLowerCase();
        extra.push({
          id: op.row.i, set, cn: op.row.c, artist: '', setName: d.prints.sets[set]?.[0] || op.row.sn || set.toUpperCase(),
          date: d.prints.sets[set]?.[1] || '', back: false, owned: true, lang: op.row.l, pi: -1,
        });
      }
    }
  }
  const groups = new Map<number, typeof prints>();
  for (const p of prints) {
    const g = groups.get(p[4]);
    if (g) g.push(p);
    else groups.set(p[4], [p]);
  }
  const items: FanItem[] = [];
  for (const list of groups.values()) {
    const focus = focusId ? list.find((p) => p[0] === focusId) : undefined;
    const owned = list.find((p) => ownedIds.has(p[0]));
    const pick = focus || owned || [...list].reverse().find((p) => !p[7]) || list[list.length - 1];
    const s = d.prints.sets[pick[1]];
    items.push({
      id: pick[0], set: pick[1], cn: pick[2], artist: d.prints.artists[pick[3]] || '', setName: s?.[0] || pick[1].toUpperCase(),
      date: s?.[1] || '', back: pick[5] === 1, owned: ownedIds.has(pick[0]), lang: pick[7] || 'en', pi: prints.indexOf(pick),
    });
  }
  const seen = new Set(items.map((i) => i.id));
  const all = [...extra.filter((e) => !seen.has(e.id)), ...items];
  const first = (i: FanItem) => Number(!!focusId && i.id === focusId);
  return all.sort((a, b) => first(b) - first(a) || Number(b.owned) - Number(a.owned) || b.date.localeCompare(a.date));
}

let current: { anchor: HTMLElement; idx: number; mode: 'hover' | 'click' } | null = null;
let hideTimer: number | undefined;
let closedAt = 0;
let hoverClosedAt = 0;
let hoverBlocked: HTMLElement | null = null;

/**
 * Dopo una chiusura esplicita (Esc, "Chiudi") il passaggio del cursore non riapre la scheda della
 * stessa carta finché il mouse non esce dalla riga (altrimenti si riaprirebbe da sola sotto il cursore).
 */
export function isHoverBlocked(el: HTMLElement): boolean {
  return hoverBlocked === el;
}

export function unblockHover(el: HTMLElement): void {
  if (hoverBlocked === el) hoverBlocked = null;
}

/** Vero subito dopo una chiusura: il focus che torna sulla riga non deve riaprire la scheda. */
export function recentlyClosed(): boolean {
  return Date.now() - closedAt < 400;
}

function sheetEl(): HTMLElement {
  return document.getElementById('sheet')!;
}

export function isOpenFor(idx: number): boolean {
  return !!current && current.idx === idx && !sheetEl().hidden;
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Vero se la scheda è aperta al passaggio del mouse, o si è appena chiusa perché il cursore è uscito:
 * passando da una carta all'altra la scheda cambia contenuto subito, senza il ritardo di apertura.
 */
export function isWarm(): boolean {
  if (current?.mode === 'hover' && !sheetEl().hidden) return true;
  return Date.now() - hoverClosedAt < WARM_MS;
}

export function closeSheet(returnFocus = false): void {
  const el = sheetEl();
  window.clearTimeout(hideTimer);
  el.classList.remove('sheet-in', 'sheet-out');
  if (el.hidden) return;
  el.hidden = true;
  el.replaceChildren();
  closedAt = Date.now();
  if (returnFocus && current) {
    hoverBlocked = current.anchor;
    current.anchor.focus();
  }
  current = null;
}

/** Il cursore è uscito dalla carta o dalla scheda: dissolvenza breve e chiusura (subito con reduced motion). */
export function scheduleClose(): void {
  if (current?.mode !== 'hover') return;
  const el = sheetEl();
  window.clearTimeout(hideTimer);
  const done = () => {
    closeSheet();
    hoverClosedAt = Date.now();
  };
  if (reducedMotion()) return done();
  el.classList.remove('sheet-in');
  el.classList.add('sheet-out');
  // se il cursore entra nella scheda (o torna sulla carta) durante la dissolvenza, cancelClose la ferma
  hideTimer = window.setTimeout(done, FADE_OUT_MS);
}

export function cancelClose(): void {
  window.clearTimeout(hideTimer);
  sheetEl().classList.remove('sheet-out');
}

function place(anchor: HTMLElement, el: HTMLElement): void {
  if (window.matchMedia('(max-width: 640px)').matches) return; // in CSS: foglio fisso in basso
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth;
  const hgt = el.offsetHeight;
  const vh = window.innerHeight;
  let top: number;
  if (vh - r.bottom >= hgt + 12) top = r.bottom + 6; // sotto la riga
  else if (r.top >= hgt + 12) top = r.top - hgt - 6; // sopra la riga
  else top = Math.max(8, vh - hgt - 8); // non sta né sopra né sotto: dentro lo schermo
  const left = Math.min(Math.max(12, r.left), document.documentElement.clientWidth - w - 12);
  el.style.setProperty('top', `${Math.max(8, top + window.scrollY)}px`);
  el.style.setProperty('left', `${left + window.scrollX}px`);
}

export interface SheetInput {
  d: Data;
  opts: Opts;
  idx: number;
  res: Result | null;
  approx: boolean; // printing non indicata (testo senza set/numero)
  focusId?: string; // stampa da mostrare come carta attiva (vista per espansione)
  prices: PricesFile | null; // prezzi indicativi; null se non disponibili ("—")
  itNames?: string[]; // nomi italiani (mostrati solo con l'interfaccia in italiano)
  onShowAll: (items: FanItem[], title: string) => void;
}

/**
 * `animate`: comparsa breve (solo all'apertura col mouse; se la scheda è già aperta il contenuto cambia e basta).
 * Tocco e tastiera aprono senza animazione, come prima.
 */
export function openSheet(anchor: HTMLElement, input: SheetInput, mode: 'hover' | 'click', animate = false): void {
  cancelClose();
  const wasHidden = sheetEl().hidden;
  const { d, idx, res, opts } = input;
  const c = d.cards.c[idx];
  const items = fanItems(d, idx, res, input.focusId);
  const el = sheetEl();
  current = { anchor, idx, mode };

  const ref = d.prints.p[idx]?.[c.r];
  let active = (input.focusId && items.find((i) => i.id === input.focusId))
    || items.find((i) => i.owned) || items.find((i) => ref && i.id === ref[0]) || items[0];
  let face: 'front' | 'back' = 'front';

  const img = h('img', { alt: '', width: 488, height: 680, decoding: 'async' });
  // anteprima piccola (spesso già in cache dalla miniatura) sotto l'immagine grande finché questa non arriva:
  // stessa carta, stessa proporzione, nessun filtro
  const ph = h('img', { class: 'ph', alt: '', width: 488, height: 680, 'aria-hidden': 'true' });
  const flip = h('button', { class: 'btn small', type: 'button', hidden: true }, t('sheet.showBack'));
  const tag = h('span', { class: 'tag', hidden: true }, t('sheet.yours'));
  const dl = h('dl');
  const cardBox = h('div', { class: 'active-card' }, ph, img, flip);

  const renderActive = () => {
    if (!active) return;
    ph.src = imageUrl(active.id, 'small', face);
    img.src = imageUrl(active.id, 'normal', face);
    if (ref) {
      img.dataset.fallback = imageUrl(ref[0], 'normal');
      ph.dataset.fallback = imageUrl(ref[0], 'small');
    }
    img.alt = `${c.n}, ${active.setName}${face === 'back' ? t('sheet.back') : ''}`;
    cardBox.classList.toggle('owned', active.owned);
    tag.hidden = !active.owned;
    flip.hidden = !active.back;
    flip.textContent = face === 'front' ? t('sheet.showBack') : t('sheet.showFront');
    const rows: [string, string][] = [
      [t('sheet.set'), `${active.setName}${active.date ? ` (${active.date.slice(0, 4)})` : ''}`],
      [t('sheet.number'), active.cn || '—'],
      [t('sheet.artist'), active.artist || '—'],
    ];
    if (active.lang && active.lang !== 'en') rows.push([t('sheet.language'), active.lang]);
    rows.push([t('sheet.price'), activePrice(active)]);
    dl.replaceChildren(...rows.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
    fan.querySelectorAll<HTMLElement>('.fan-item').forEach((b) => b.classList.toggle('active', b.dataset.id === active!.id));
  };
  flip.addEventListener('click', () => {
    face = face === 'front' ? 'back' : 'front';
    renderActive();
  });

  const eur = (c: number) => (c ? fmtEur(c) : '—');
  // prezzo della printing: normale e, se c'è, foil
  const activePrice = (it: FanItem) => {
    const n = printPrice(input.prices, idx, it.pi);
    const f = printPrice(input.prices, idx, it.pi, true);
    return f ? `${eur(n)} · ${t('sheet.priceFoil', { p: fmtEur(f) })}` : eur(n);
  };

  const shown = items.slice(0, FAN_MAX);
  const fan = h('div', { class: 'fan', role: 'group', 'aria-label': t('sheet.artworks') });
  shown.forEach((it, i) => {
    const off = i - (shown.length - 1) / 2;
    const b = h('button', {
      class: 'fan-item' + (it.owned ? ' owned' : ''), type: 'button', dataset: { id: it.id },
      style: { '--r': `${off * 3}deg`, '--y': `${Math.abs(off) * 4}px` },
      'aria-label': `${it.setName}${it.owned ? t('sheet.ownedAria') : ''}`,
    }, h('img', { src: imageUrl(it.id, 'small'), alt: '', loading: 'lazy', width: 146, height: 204, dataset: ref ? { fallback: imageUrl(ref[0], 'small') } : undefined }),
    h('span', { class: 'fan-price' }, eur(printPrice(input.prices, idx, it.pi))));
    const select = () => {
      active = it;
      face = 'front';
      renderActive();
    };
    b.addEventListener('click', select);
    b.addEventListener('focus', select);
    b.addEventListener('mouseenter', select);
    fan.appendChild(b);
  });

  const st = c.s[opts.win];
  const share = deckShare(d, c, opts);
  const period = t(`period.${opts.win}` as 'period.0');
  const stats = h('p', null,
    st ? t('sheet.stats', { period, pct: fmtPct(share), n: fmtInt(opts.side ? st[0] : st[1]) }) : t('sheet.notPlayed', { period }),
    st ? t('sheet.typical', { n: typicalCopies(c, opts) }) : '',
    t('sheet.first', { date: fmtDate(c.f) }));

  const seenList = h('ul', { class: 'seen' });
  for (const [ls, kind] of [[c.lm, 'm'], [c.lp, 'p']] as const) {
    const s = lastSeen(d, ls, kind);
    if (!s) continue;
    const bits = [fmtDate(s.date), s.result, s.copies].filter(Boolean).join(' · ');
    seenList.appendChild(h('li', null, h('b', null, s.kind === 'm' ? t('sheet.lastMtgo') : t('sheet.lastPaper')), bits, h('br'),
      s.uri ? h('a', { href: s.uri, target: '_blank', rel: 'noopener noreferrer' }, s.tournament) : s.tournament));
  }

  const owned = res?.prints.length
    ? h('p', null, res.binders.length
      ? t('sheet.ownIn', { n: res.owned, where: res.binders.map(([b, q]) => `${b}: ${q}`).join(', ') })
      : t('sheet.own', { n: res.owned }))
    : res ? h('p', null, t('sheet.notOwned')) : null;

  // prezzo di ogni printing posseduta (foil se è foil), dalla più cara
  const yourPrices = res?.prints.length && input.prices
    ? h('p', { class: 'yourprices' }, t('sheet.yourPrices', {
      list: ownedPrices(d, input.prices, res).map((o) => `${fmtPrint(o.op.row)} ${eur(o.cents)}`).join(', '),
    }))
    : null;

  const close = h('button', { class: 'btn quiet small', type: 'button', 'aria-label': t('sheet.closeAria') }, t('sheet.close'));
  close.addEventListener('click', () => closeSheet(true));

  el.replaceChildren(
    h('div', { class: 'sheet-head' },
      h('div', { class: 'sheet-titles' },
        h('h3', { id: 'sheetTitle' }, c.n, c.l === 'b' ? h('span', { class: 'badge banned' }, t('badge.banned')) : null),
        italianLine(input.itNames)), close),
    fan,
    items.length > FAN_MAX
      ? h('p', { class: 'fan-note' }, t('sheet.someOf', { n: FAN_MAX, total: items.length }),
        h('button', { class: 'btn small', type: 'button', onclick: () => input.onShowAll(items, c.n) }, t('sheet.showAll')))
      : h('p', { class: 'fan-note' }, items.length === 1 ? t('sheet.one') : t('sheet.many', { n: items.length })),
    h('div', { class: 'sheet-body' },
      cardBox,
      h('div', { class: 'details' }, tag, dl,
        input.approx ? h('p', { class: 'warnbox' }, t('sheet.approx')) : null,
        owned, yourPrices, stats, seenList)),
  );
  el.hidden = false;
  el.classList.remove('sheet-in');
  if (animate && wasHidden && !reducedMotion()) {
    void el.offsetWidth; // riavvia l'animazione
    el.classList.add('sheet-in');
  }
  renderActive();
  place(anchor, el);
  if (mode === 'click') (fan.querySelector<HTMLElement>('.fan-item.active') || close).focus({ preventScroll: true });
}

/** Nome italiano sotto quello inglese, solo con l'interfaccia in italiano. */
function italianLine(names: string[] | undefined): HTMLElement {
  const show = getLang() === 'it' && !!names?.length;
  return h('p', { class: 'itname', id: 'sheetIt', lang: 'it', hidden: !show }, show ? names!.join(' · ') : '');
}

/** Nomi italiani arrivati dopo l'apertura della scheda (il file si scarica al primo uso). */
export function setSheetItalian(idx: number, names: string[]): void {
  if (!current || current.idx !== idx || sheetEl().hidden) return;
  document.getElementById('sheetIt')?.replaceWith(italianLine(names));
}

export function renderGrid(dialog: HTMLDialogElement, items: FanItem[], title: string): void {
  const close = h('button', { class: 'btn small', type: 'button' }, t('sheet.close'));
  close.addEventListener('click', () => dialog.close());
  dialog.replaceChildren(
    h('div', { class: 'sheet-head' }, h('h3', { id: 'gridTitle' }, t('grid.title', { name: title, n: items.length })), close),
    h('div', { class: 'grid' }, ...items.map((it) => h('figure', { class: it.owned ? 'owned' : '' },
      h('img', { src: imageUrl(it.id, 'normal'), alt: `${title}, ${it.setName}`, loading: 'lazy', width: 488, height: 680 }),
      h('figcaption', null, `${it.setName}${it.date ? ` (${it.date.slice(0, 4)})` : ''} · ${it.cn}${it.artist ? ` · ${it.artist}` : ''}${it.owned ? ` · ${t('grid.yours')}` : ''}`)))),
  );
  dialog.showModal();
}
