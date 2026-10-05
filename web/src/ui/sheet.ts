// Scheda della carta: ventaglio degli artwork (raggruppati per illustration_id), carta attiva
// intera, dettagli della printing e ultime apparizioni.
//
// Regole di Scryfall sulle immagini: niente sovrapposizioni (le carte del ventaglio sono distanziate,
// così artista e copyright restano visibili), niente deformazioni, filtri o watermark.

import type { Opts, Result } from '../lib/compare';
import { deckShare, typicalCopies, WINDOW_LABELS } from '../lib/compare';
import { imageUrl, type Data } from '../lib/data';
import { h } from '../lib/dom';
import { fmtDate, fmtInt, fmtPct, lastSeen } from '../lib/format';

export const FAN_MAX = 7;

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
}

/** Un elemento per artwork: preferisce la printing posseduta, altrimenti la più recente in inglese. */
export function fanItems(d: Data, idx: number, res: Result | null): FanItem[] {
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
          date: d.prints.sets[set]?.[1] || '', back: false, owned: true, lang: op.row.l,
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
    const owned = list.find((p) => ownedIds.has(p[0]));
    const pick = owned || [...list].reverse().find((p) => !p[6]) || list[list.length - 1];
    const s = d.prints.sets[pick[1]];
    items.push({
      id: pick[0], set: pick[1], cn: pick[2], artist: d.prints.artists[pick[3]] || '', setName: s?.[0] || pick[1].toUpperCase(),
      date: s?.[1] || '', back: pick[5] === 1, owned: !!owned, lang: pick[6] || 'en',
    });
  }
  const seen = new Set(items.map((i) => i.id));
  const all = [...extra.filter((e) => !seen.has(e.id)), ...items];
  return all.sort((a, b) => Number(b.owned) - Number(a.owned) || b.date.localeCompare(a.date));
}

let current: { anchor: HTMLElement; idx: number; mode: 'hover' | 'click' } | null = null;
let hideTimer: number | undefined;

function sheetEl(): HTMLElement {
  return document.getElementById('sheet')!;
}

export function isOpenFor(idx: number): boolean {
  return !!current && current.idx === idx && !sheetEl().hidden;
}

export function closeSheet(returnFocus = false): void {
  const el = sheetEl();
  if (el.hidden) return;
  el.hidden = true;
  el.replaceChildren();
  if (returnFocus && current) current.anchor.focus();
  current = null;
}

export function scheduleClose(): void {
  if (current?.mode !== 'hover') return;
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => closeSheet(), 280);
}

export function cancelClose(): void {
  window.clearTimeout(hideTimer);
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
  onShowAll: (items: FanItem[], title: string) => void;
}

export function openSheet(anchor: HTMLElement, input: SheetInput, mode: 'hover' | 'click'): void {
  cancelClose();
  const { d, idx, res, opts } = input;
  const c = d.cards.c[idx];
  const items = fanItems(d, idx, res);
  const el = sheetEl();
  current = { anchor, idx, mode };

  const ref = d.prints.p[idx]?.[c.r];
  let active = items.find((i) => i.owned) || items.find((i) => ref && i.id === ref[0]) || items[0];
  let face: 'front' | 'back' = 'front';

  const img = h('img', { alt: '', width: 488, height: 680, decoding: 'async' });
  const flip = h('button', { class: 'btn small', type: 'button', hidden: true }, 'Mostra il retro');
  const tag = h('span', { class: 'tag', hidden: true }, 'Tua');
  const dl = h('dl');
  const cardBox = h('div', { class: 'active-card' }, img, flip);

  const renderActive = () => {
    if (!active) return;
    img.src = imageUrl(active.id, 'normal', face);
    if (ref) img.dataset.fallback = imageUrl(ref[0], 'normal');
    img.alt = `${c.n}, ${active.setName}${face === 'back' ? ' (retro)' : ''}`;
    cardBox.classList.toggle('owned', active.owned);
    tag.hidden = !active.owned;
    flip.hidden = !active.back;
    flip.textContent = face === 'front' ? 'Mostra il retro' : 'Mostra il fronte';
    const rows: [string, string][] = [
      ['Set', `${active.setName}${active.date ? ` (${active.date.slice(0, 4)})` : ''}`],
      ['Numero', active.cn || '—'],
      ['Artista', active.artist || '—'],
    ];
    if (active.lang && active.lang !== 'en') rows.push(['Lingua', active.lang]);
    dl.replaceChildren(...rows.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
    fan.querySelectorAll<HTMLElement>('.fan-item').forEach((b) => b.classList.toggle('active', b.dataset.id === active!.id));
  };
  flip.addEventListener('click', () => {
    face = face === 'front' ? 'back' : 'front';
    renderActive();
  });

  const shown = items.slice(0, FAN_MAX);
  const fan = h('div', { class: 'fan', role: 'group', 'aria-label': 'Artwork diversi' });
  shown.forEach((it, i) => {
    const off = i - (shown.length - 1) / 2;
    const b = h('button', {
      class: 'fan-item' + (it.owned ? ' owned' : ''), type: 'button', dataset: { id: it.id },
      style: { '--r': `${off * 3}deg`, '--y': `${Math.abs(off) * 4}px` },
      'aria-label': `${it.setName}${it.owned ? ', posseduta' : ''}`,
    }, h('img', { src: imageUrl(it.id, 'small'), alt: '', loading: 'lazy', width: 146, height: 204, dataset: ref ? { fallback: imageUrl(ref[0], 'small') } : undefined }));
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
  const stats = h('p', null,
    `${WINDOW_LABELS[opts.win]}: ${st ? `${fmtPct(share)} dei mazzi (${fmtInt(opts.side ? st[0] : st[1])})` : 'non giocata'}`,
    st ? ` · copie tipiche ${typicalCopies(c, opts)}` : '',
    ` · prima apparizione ${fmtDate(c.f)}`);

  const seenList = h('ul', { class: 'seen' });
  for (const [ls, kind] of [[c.lm, 'm'], [c.lp, 'p']] as const) {
    const s = lastSeen(d, ls, kind);
    if (!s) continue;
    const bits = [fmtDate(s.date), s.result, s.copies].filter(Boolean).join(' · ');
    seenList.appendChild(h('li', null, h('b', null, `Ultima su ${s.kind === 'MTGO' ? 'MTGO' : 'cartaceo'}: `), bits, h('br'),
      s.uri ? h('a', { href: s.uri, target: '_blank', rel: 'noopener noreferrer' }, s.tournament) : s.tournament));
  }

  const owned = res?.prints.length
    ? h('p', null, `Ne possiedi ${res.owned}${res.binders.length ? ` (${res.binders.map(([b, q]) => `${b}: ${q}`).join(', ')})` : ''}.`)
    : res ? h('p', null, 'Non la possiedi in nessuna printing.') : null;

  const close = h('button', { class: 'btn quiet small', type: 'button', 'aria-label': 'Chiudi la scheda' }, 'Chiudi');
  close.addEventListener('click', () => closeSheet(true));

  el.replaceChildren(
    h('div', { class: 'sheet-head' },
      h('h3', { id: 'sheetTitle' }, c.n, c.l === 'b' ? h('span', { class: 'badge banned' }, 'bannata') : null), close),
    fan,
    items.length > FAN_MAX
      ? h('p', { class: 'fan-note' }, `${FAN_MAX} artwork su ${items.length}. `,
        h('button', { class: 'btn small', type: 'button', onclick: () => input.onShowAll(items, c.n) }, 'Mostra tutte'))
      : h('p', { class: 'fan-note' }, items.length === 1 ? 'Un solo artwork.' : `${items.length} artwork diversi.`),
    h('div', { class: 'sheet-body' },
      cardBox,
      h('div', { class: 'details' }, tag, dl,
        input.approx ? h('p', { class: 'warnbox' }, 'La printing non era indicata nel testo: l\'immagine è quella di riferimento.') : null,
        owned, stats, seenList)),
  );
  el.hidden = false;
  renderActive();
  place(anchor, el);
  if (mode === 'click') (fan.querySelector<HTMLElement>('.fan-item.active') || close).focus({ preventScroll: true });
}

export function renderGrid(dialog: HTMLDialogElement, items: FanItem[], title: string): void {
  const close = h('button', { class: 'btn small', type: 'button' }, 'Chiudi');
  close.addEventListener('click', () => dialog.close());
  dialog.replaceChildren(
    h('div', { class: 'sheet-head' }, h('h3', { id: 'gridTitle' }, `${title}: tutti gli artwork (${items.length})`), close),
    h('div', { class: 'grid' }, ...items.map((it) => h('figure', { class: it.owned ? 'owned' : '' },
      h('img', { src: imageUrl(it.id, 'normal'), alt: `${title}, ${it.setName}`, loading: 'lazy', width: 488, height: 680 }),
      h('figcaption', null, `${it.setName}${it.date ? ` (${it.date.slice(0, 4)})` : ''} · ${it.cn}${it.artist ? ` · ${it.artist}` : ''}${it.owned ? ' · tua' : ''}`)))),
  );
  dialog.showModal();
}
