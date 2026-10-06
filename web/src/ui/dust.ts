// "Rispolvera una carta": pesca una carta dimenticata e la mostra mentre ragnatele e polvere vengono spazzate via.
// L'effetto usa solo elementi sovrapposti (SVG e CSS): l'immagine non viene mai filtrata né ricolorata
// (regole di Scryfall) e alla fine la copertura viene rimossa, quindi la carta è interamente visibile.

import { t } from '../i18n';
import type { Opts } from '../lib/compare';
import { imageUrl, type Data } from '../lib/data';
import { h, svg } from '../lib/dom';
import { drawCard, dustPool, historyWindow, peakYear } from '../lib/dust';
import { fmtDate, fmtInt, fmtPct, fmtPrint, lastSeen } from '../lib/format';
import type { CollectionIndex, Owned } from '../lib/quick';
import { ssGet, ssSet } from '../lib/store';

export interface DustCtx {
  data(): Data | null;
  opts(): Opts;
  collection(): CollectionIndex | null;
  openArtworks(anchor: HTMLElement, idx: number, owned: Owned | null): void;
}

const SWEEP_MS = 1700; // durata massima dell'animazione (CSS) più un margine

export function initDust(ctx: DustCtx): { refresh(): void } {
  const btn = document.getElementById('dustBtn') as HTMLButtonElement;
  const root = document.getElementById('dustResult') as HTMLElement;
  const seen = new Set<string>((ssGet('dusted') || '').split(',').filter(Boolean));
  let fromAll = false;
  let current = -1;
  let note = '';
  let pool: number[] | null = null;
  let poolFor: Data | null = null;

  const fullPool = (d: Data) => {
    if (poolFor !== d) {
      pool = dustPool(d);
      poolFor = d;
    }
    return pool!;
  };
  const poolNow = (d: Data) => {
    const all = fullPool(d);
    const coll = ctx.collection();
    if (!coll || fromAll) return all;
    return all.filter((i) => (coll.byCard.get(i)?.total || 0) > 0);
  };

  const draw = () => {
    const d = ctx.data();
    if (!d) return;
    const r = drawCard(d, poolNow(d), seen);
    ssSet('dusted', [...seen].join(','));
    current = r ? r.idx : -1;
    note = r?.restarted ? t('dust.restarted') : '';
    render(true);
  };

  const render = (animate = false) => {
    const d = ctx.data();
    if (!d || (current < 0 && !root.hasChildNodes())) return;
    const coll = ctx.collection();
    const toggle = coll ? h('label', { class: 'chk dust-all' },
      h('input', { type: 'checkbox', checked: fromAll, onchange: (e: Event) => {
        fromAll = (e.target as HTMLInputElement).checked;
        draw();
      } }), ' ', h('span', null, t('dust.fromAll'))) : null;
    const again = h('button', { class: 'btn small', type: 'button', onclick: draw }, t('dust.again'));
    const close = h('button', { class: 'btn quiet small', type: 'button', onclick: () => {
      current = -1;
      root.replaceChildren();
      btn.focus();
    } }, t('dust.close'));

    if (current < 0) {
      // nessuna carta da pescare (per esempio nessuna carta dimenticata tra quelle possedute)
      root.replaceChildren(h('div', { class: 'dres' }, h('div', { class: 'qinfo' },
        h('p', null, coll && !fromAll ? t('dust.noneOwned', { n: fmtInt(fullPool(d).length) }) : t('dust.none')),
        h('div', { class: 'dust-actions' }, toggle, close))));
      return;
    }

    const c = d.cards.c[current];
    const opts = ctx.opts();
    const prints = d.prints.p[current] || [];
    const ref = prints[c.r];
    const owned = coll ? coll.byCard.get(current) || null : null;
    const ownedId = owned?.prints.map((p) => p.row.i || (p.print >= 0 ? prints[p.print][0] : '')).find(Boolean);
    const id = ownedId || ref?.[0] || '';
    const st = c.s[historyWindow(d)];
    const decks = st ? (opts.side ? st[0] : st[1]) : 0;
    const peak = peakYear(c, d.cards.yt);

    // ultima apparizione: la più recente tra MTGO e cartaceo
    const last = [lastSeen(d, c.lm, 'm'), lastSeen(d, c.lp, 'p')].filter((x) => x !== null)
      .sort((a, b) => b!.date.localeCompare(a!.date))[0] || null;

    const info: (Node | null)[] = [
      h('p', { class: 'dust-kicker' }, t('dust.kicker')),
      h('h3', { class: 'qtitle', id: 'dustTitle', tabindex: '-1' }, c.n),
      h('p', null, t('dust.played', { n: fmtInt(decks), from: fmtDate(c.f), to: fmtDate(c.z) })),
      peak ? h('p', null, t('dust.peak', { year: peak.year, pct: fmtPct(peak.share) })) : null,
      last ? h('p', null, t('dust.last', { date: fmtDate(last.date) }),
        last.uri ? h('a', { href: last.uri, target: '_blank', rel: 'noopener noreferrer' }, last.tournament) : last.tournament,
        last.result ? ` · ${last.result}` : '') : null,
    ];
    if (coll) {
      info.push(owned && owned.total > 0
        ? h('p', { class: 'qowned' }, t('quick.owned', { n: owned.total }), h('span', { class: 'note' }, ' · '
          + owned.prints.map((p) => `${fmtPrint(p.row)} ×${p.q}`).join(', ')))
        : h('p', { class: 'qnotowned' }, t('quick.notOwned')));
    }
    if (note) info.push(h('p', { class: 'note' }, note));
    info.push(h('div', { class: 'dust-actions' }, again, toggle, close));

    const img = h('img', {
      src: imageUrl(id, 'normal'), alt: t('dust.imageAlt', { name: c.n }), width: 488, height: 680, decoding: 'async',
      dataset: ref && ref[0] !== id ? { fallback: imageUrl(ref[0], 'normal') } : undefined,
    });
    const stage = h('button', { class: 'dust-stage', type: 'button', 'aria-label': t('quick.imageAlt', { name: c.n }) }, img);
    stage.addEventListener('click', () => ctx.openArtworks(stage, current, owned));
    root.replaceChildren(h('div', { class: 'dres' + (owned && owned.total > 0 ? ' is-owned' : '') }, stage, h('div', { class: 'qinfo' }, ...info)));
    if (animate) {
      (root.querySelector('#dustTitle') as HTMLElement | null)?.focus({ preventScroll: true });
      root.scrollIntoView({ block: 'nearest' });
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) sweep(stage, img);
    }
  };

  btn.addEventListener('click', draw);
  return { refresh: () => render(false) };
}

/* ---------- animazione ---------- */

/** Copertura di polvere e ragnatele sopra la carta; parte quando l'immagine è pronta e poi si rimuove. */
function sweep(stage: HTMLElement, img: HTMLImageElement): void {
  const cover = dustCover();
  stage.appendChild(cover);
  let started = false;
  const start = () => {
    if (started || !cover.isConnected) return;
    started = true;
    cover.classList.add('go');
    // alla fine di tutte le animazioni la copertura si rimuove: la carta resta intera, senza nulla sopra
    const anims = typeof cover.getAnimations === 'function' ? cover.getAnimations({ subtree: true }) : [];
    if (anims.length) void Promise.all(anims.map((a) => a.finished)).then(() => cover.remove(), () => cover.remove());
    else window.setTimeout(() => cover.remove(), SWEEP_MS);
  };
  if (img.complete) start();
  else {
    img.addEventListener('load', start, { once: true });
    img.addEventListener('error', start, { once: true });
    window.setTimeout(start, 2500); // immagine lenta: si spazza comunque
  }
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

let uid = 0;
const f1 = (n: number) => n.toFixed(1);

/**
 * Copertura: velo di polvere a grana fine e a chiazze (rumore SVG, solo sopra la carta), granelli che volano
 * via quando passa la mano, nuvoletta di polvere sul bordo della spazzata, ragnatele irregolari negli angoli.
 */
function dustCover(): HTMLElement {
  const id = ++uid;
  const seed = Math.floor(rand(1, 999));
  // velo: chiazze larghe (bassa frequenza) + grana fine; il colore è un grigio-beige, l'alfa viene dal rumore
  const tex = svg('svg', { class: 'dust-tex', viewBox: '0 0 100 140', preserveAspectRatio: 'none', 'aria-hidden': 'true' },
    svg('defs', {},
      svg('filter', { id: `dblot${id}`, x: '0', y: '0', width: '1', height: '1' },
        svg('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.045', numOctaves: '3', seed }),
        svg('feColorMatrix', { type: 'matrix', values: '0 0 0 0 0.74  0 0 0 0 0.72  0 0 0 0 0.68  1.4 0 0 0 -0.4' })),
      svg('filter', { id: `dgrain${id}`, x: '0', y: '0', width: '1', height: '1' },
        svg('feTurbulence', { type: 'fractalNoise', baseFrequency: '1.6', numOctaves: '1', seed: seed + 7 }),
        svg('feColorMatrix', { type: 'matrix', values: '0 0 0 0 0.62  0 0 0 0 0.6  0 0 0 0 0.56  4 0 0 0 -2.35' })),
      // più polvere verso i bordi, dove si deposita
      svg('radialGradient', { id: `dvig${id}`, cx: '50', cy: '70', r: '86', gradientUnits: 'userSpaceOnUse' },
        svg('stop', { offset: '0.35', 'stop-color': '#bdb6a8', 'stop-opacity': '0.16' }),
        svg('stop', { offset: '1', 'stop-color': '#bdb6a8', 'stop-opacity': '0.5' }))),
    svg('rect', { width: '100', height: '140', fill: `url(#dvig${id})` }),
    svg('rect', { width: '100', height: '140', filter: `url(#dblot${id})` }),
    svg('rect', { width: '100', height: '140', filter: `url(#dgrain${id})` }));

  // granelli e fiocchi: partono quando li raggiunge il bordo della spazzata (diagonale), alcuni cadono
  const specks = svg('svg', { class: 'dust-specks', viewBox: '0 0 100 140', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  for (let i = 0; i < 80; i++) {
    const x = rand(1, 99);
    const y = rand(1, 139);
    const flake = i % 9 === 0;
    const el = flake
      ? svg('ellipse', { cx: f1(x), cy: f1(y), rx: f1(rand(0.9, 1.8)), ry: f1(rand(0.4, 0.8)), class: 'sp flake' })
      : svg('circle', { cx: f1(x), cy: f1(y), r: rand(0.2, 0.55).toFixed(2), class: i % 3 ? 'sp' : 'sp dark' });
    const reach = (x + y * 0.45) / 163; // 0..1 lungo la diagonale della spazzata
    el.style.setProperty('--dx', `${rand(18, 70).toFixed(0)}px`);
    el.style.setProperty('--dy', `${rand(-26, 46).toFixed(0)}px`);
    el.style.setProperty('--rot', `${rand(-160, 160).toFixed(0)}deg`);
    el.style.setProperty('--d', `${(260 + reach * 820 + rand(-60, 60)).toFixed(0)}ms`);
    el.style.setProperty('--t', `${rand(380, 620).toFixed(0)}ms`);
    specks.appendChild(el);
  }
  return h('div', { class: 'dust-cover', 'aria-hidden': 'true' },
    h('div', { class: 'dust-film' }, tex),
    cobweb('web-tl', 0.62),
    cobweb('web-tr', 0.4),
    cobweb('web-bl', 0.34),
    specks,
    h('div', { class: 'dust-puff' }));
}

/**
 * Ragnatela d'angolo irregolare (angolo in alto a sinistra; le altre sono specchiate via CSS):
 * fili radiali a passo e lunghezza variabili, giri della spirale che si incurvano verso il centro,
 * alcuni tratti spezzati, fili penzolanti e un velo di polvere rimasta impigliata.
 */
function cobweb(cls: string, size: number): SVGElement {
  const id = ++uid;
  const hub: [number, number] = [rand(4, 9), rand(4, 9)];
  // direzioni dei fili, dal bordo alto (≈0°) al bordo sinistro (≈90°)
  const n = Math.round(rand(8, 11));
  const angles: number[] = [];
  for (let k = 0; k < n; k++) angles.push((-6 + (k + rand(-0.3, 0.3)) * (102 / (n - 1))) * (Math.PI / 180));
  angles.sort((a, b) => a - b);
  const lens = angles.map((a, k) => (k === 0 || k === n - 1 ? 100 : rand(58, 98)) * (Math.abs(Math.cos(a * 2)) * 0.15 + 0.85));
  const at = (k: number, r: number): [number, number] => [hub[0] + r * Math.cos(angles[k]), hub[1] + r * Math.sin(angles[k])];

  let radial = '';
  angles.forEach((_, k) => {
    const [x, y] = at(k, lens[k]);
    const [bx, by] = at(k, lens[k] * 0.5);
    // fili quasi dritti, appena allentati
    radial += `M${f1(hub[0])} ${f1(hub[1])}Q${f1(bx + rand(-1.2, 1.2))} ${f1(by + rand(-1.2, 1.2))} ${f1(x)} ${f1(y)}`;
  });

  let spiral = '';
  let faint = '';
  let r = rand(4, 6);
  const knots: [number, number][] = [];
  while (r < 82) {
    for (let k = 0; k < n - 1; k++) {
      if (r > lens[k] * 0.96 || r > lens[k + 1] * 0.96 || Math.random() < 0.1) continue; // tratti spezzati
      const r1 = r * rand(0.94, 1.06);
      const r2 = r * rand(0.94, 1.06);
      const [x1, y1] = at(k, r1);
      const [x2, y2] = at(k + 1, r2);
      const mid = (angles[k] + angles[k + 1]) / 2;
      const sag = ((r1 + r2) / 2) * rand(0.8, 0.9); // il filo cede verso il centro
      const cx = hub[0] + sag * Math.cos(mid);
      const cy = hub[1] + sag * Math.sin(mid) + rand(0, 1.4); // e un po' verso il basso
      const seg = `M${f1(x1)} ${f1(y1)}Q${f1(cx)} ${f1(cy)} ${f1(x2)} ${f1(y2)}`;
      if (Math.random() < 0.3) faint += seg;
      else spiral += seg;
      if (Math.random() < 0.08) knots.push([x1, y1]);
    }
    r += rand(4.5, 9) + r * 0.06;
  }
  // fili penzolanti
  let loose = '';
  for (let i = 0; i < 3; i++) {
    const k = Math.floor(rand(1, n - 1));
    const [x, y] = at(k, lens[k] * rand(0.35, 0.8));
    const len = rand(8, 18);
    loose += `M${f1(x)} ${f1(y)}c${f1(rand(-2, 2))} ${f1(len * 0.4)} ${f1(rand(-4, 4))} ${f1(len * 0.7)} ${f1(rand(-3, 3))} ${f1(len)}`;
  }
  // velo di polvere impigliata vicino al centro
  let haze = `M${f1(hub[0])} ${f1(hub[1])}`;
  angles.forEach((_, k) => {
    const [x, y] = at(k, lens[k] * 0.55);
    haze += `L${f1(x)} ${f1(y)}`;
  });
  haze += 'Z';

  const el = svg('svg', { class: `web ${cls}`, viewBox: '0 0 100 100', 'aria-hidden': 'true' },
    svg('defs', {},
      svg('radialGradient', { id: `wh${id}`, cx: f1(hub[0]), cy: f1(hub[1]), r: '60', gradientUnits: 'userSpaceOnUse' },
        svg('stop', { offset: '0', 'stop-color': '#f2efe8', 'stop-opacity': '0.55' }),
        svg('stop', { offset: '1', 'stop-color': '#f2efe8', 'stop-opacity': '0' }))),
    svg('path', { d: haze, fill: `url(#wh${id})`, class: 'web-haze' }),
    svg('path', { d: radial + spiral, class: 'web-shadow' }),
    svg('path', { d: faint, class: 'web-line faint' }),
    svg('path', { d: spiral + loose, class: 'web-line' }),
    svg('path', { d: radial, class: 'web-line strong' }),
    ...knots.map(([x, y]) => svg('circle', { cx: f1(x), cy: f1(y), r: rand(0.5, 1).toFixed(2), class: 'web-knot' })));
  el.style.setProperty('--size', `${Math.round(size * 100)}%`);
  return el;
}
