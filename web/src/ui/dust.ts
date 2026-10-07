// "Rispolvera una carta": pesca una carta dimenticata e la mostra mentre ragnatele e polvere vengono spazzate via.
// L'effetto usa solo elementi sovrapposti (SVG e CSS): l'immagine non viene mai filtrata né ricolorata
// (regole di Scryfall) e alla fine la copertura viene rimossa, quindi la carta è interamente visibile.

import { t } from '../i18n';
import type { Opts } from '../lib/compare';
import { imageUrl, type Data } from '../lib/data';
import { h, svg } from '../lib/dom';
import { cobwebs, puff, type Corner } from './cobweb';
import { enableTilt } from './tilt';
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

const SWEEP_MS = 2100; // durata massima dell'animazione (CSS) più un margine
const BTN_SWEEP_MS = 460; // le ragnatele del pulsante vengono spazzate via prima che compaia la carta
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Pagina "Carta dimenticata": pulsante grande e una scena al centro. Prima della pesca la scena mostra una cornice
 * vuota con polvere e ragnatele ferme; a ogni pesca la carta compare sotto la copertura, che viene spazzata via.
 */
export function initDust(ctx: DustCtx): { refresh(): void } {
  const btn = document.getElementById('dustBtn') as HTMLButtonElement;
  const btnLabel = document.getElementById('dustBtnLabel') as HTMLElement;
  const root = document.getElementById('dustResult') as HTMLElement;
  const allWrap = document.getElementById('dustAllWrap') as HTMLElement;
  const allBox = document.getElementById('dustAll') as HTMLInputElement;
  const seen = new Set<string>((ssGet('dusted') || '').split(',').filter(Boolean));
  let fromAll = false;
  let drawn = false; // almeno una pesca fatta (anche senza risultato)
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
    drawn = true;
    current = r ? r.idx : -1;
    note = r?.restarted ? t('dust.restarted') : '';
    render(true);
  };

  /** Cornice vuota con la copertura ferma (niente immagine: nessuna carta, nessun retro); toccarla pesca una carta. */
  const waiting = () => h('button', { class: 'dust-stage dust-empty', type: 'button', 'aria-label': t('dust.tapFrame'), onclick: press },
    dustCover(true), h('span', { class: 'dust-tap', 'aria-hidden': 'true' }, t('dust.tap')));

  // pressione: prima le ragnatele del pulsante vengono spazzate via, poi la carta compare sotto la polvere
  let busy = false;
  let regrowTimer: number | undefined;
  const press = () => {
    if (busy) return;
    if (reducedMotion()) return draw();
    busy = true;
    window.clearTimeout(regrowTimer);
    btn.classList.remove('regrow');
    btn.classList.add('sweep');
    window.setTimeout(() => {
      busy = false;
      draw();
      // le ragnatele si riformano dopo la spazzata della carta
      regrowTimer = window.setTimeout(() => {
        growButtonWebs();
        btn.classList.remove('sweep');
        btn.classList.add('regrow');
      }, SWEEP_MS);
    }, BTN_SWEEP_MS);
  };

  const render = (animate = false) => {
    const d = ctx.data();
    const coll = ctx.collection();
    allWrap.hidden = !coll;
    allBox.checked = fromAll;
    btnLabel.textContent = drawn && current >= 0 ? t('dust.again') : t('dust.button');
    if (!d) return;
    if (!drawn) {
      root.replaceChildren(h('div', { class: 'dust-scene is-empty' }, waiting()));
      return;
    }
    if (current < 0) {
      // nessuna carta da pescare (per esempio nessuna carta dimenticata tra quelle possedute)
      root.replaceChildren(h('div', { class: 'dust-scene is-empty' }, waiting(),
        h('div', { class: 'qinfo dust-info' },
          h('p', null, coll && !fromAll ? t('dust.noneOwned', { n: fmtInt(fullPool(d).length) }) : t('dust.none')))));
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
      h('h3', { class: 'qtitle', id: 'dustTitle' }, c.n),
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

    const img = h('img', {
      src: imageUrl(id, 'normal'), alt: t('dust.imageAlt', { name: c.n }), width: 488, height: 680, decoding: 'async',
      dataset: ref && ref[0] !== id ? { fallback: imageUrl(ref[0], 'normal') } : undefined,
    });
    const stage = h('button', { class: 'dust-stage', type: 'button', 'aria-label': t('quick.imageAlt', { name: c.n }) }, img);
    stage.addEventListener('click', () => {
      // un tocco trascinato serve a inclinare la carta, non apre la scheda
      if (stage.dataset.dragged) return void delete stage.dataset.dragged;
      ctx.openArtworks(stage, current, owned);
    });
    root.replaceChildren(h('div', { class: 'dust-scene' + (owned && owned.total > 0 ? ' is-owned' : '') },
      stage, h('div', { class: 'qinfo dust-info' }, ...info)));
    if (animate) {
      root.scrollIntoView({ block: 'nearest' });
      // la carta in 3D si attiva alla fine della spazzata
      if (!reducedMotion()) sweep(stage, img, () => enableTilt(stage));
    } else if (!reducedMotion()) {
      enableTilt(stage);
    }
  };

  // ragnatele del pulsante (una per angolo, nuove a ogni ricrescita) e della voce in testata
  const growButtonWebs = () => {
    btn.querySelectorAll('.bweb').forEach((el) => el.remove());
    btn.prepend(...(['tl', 'tr', 'br'] as Corner[]).map((k, i) =>
      h('span', { class: `bweb bweb-${k}`, 'aria-hidden': 'true' }, cobwebs(44, 44, [[k, 0.95, i * 0.06]], 0.6), puff(k, i * 0.06))));
  };
  growButtonWebs();
  document.querySelector('#navDust .nd-web')?.replaceChildren(cobwebs(26, 26, [['tr', 0.95]], 0.3));
  btn.addEventListener('click', press);
  allBox.addEventListener('change', () => {
    fromAll = allBox.checked;
    if (drawn) draw();
  });
  return { refresh: () => render(false) };
}

/* ---------- animazione ---------- */

/** Copertura di polvere e ragnatele sopra la carta; parte quando l'immagine è pronta e poi si rimuove. */
function sweep(stage: HTMLElement, img: HTMLImageElement, done: () => void): void {
  const cover = dustCover();
  stage.appendChild(cover);
  let started = false;
  const start = () => {
    if (started || !cover.isConnected) return;
    started = true;
    cover.classList.add('go');
    // alla fine di tutte le animazioni la copertura si rimuove: la carta resta intera, senza nulla sopra.
    // Si aspettano solo le animazioni finite (l'oscillazione a riposo è infinita e viene sostituita dallo strappo).
    const anims = (typeof cover.getAnimations === 'function' ? cover.getAnimations({ subtree: true }) : [])
      .filter((x) => x.effect?.getTiming().iterations !== Infinity);
    const end = () => {
      cover.remove();
      done();
    };
    if (anims.length) void Promise.all(anims.map((a) => a.finished)).then(end, end);
    else window.setTimeout(end, SWEEP_MS);
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
function dustCover(still = false): HTMLElement {
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
  return h('div', { class: 'dust-cover' + (still ? ' still' : ''), 'aria-hidden': 'true' },
    h('div', { class: 'dust-film' }, tex),
    // ragnatele: si strappano seguendo la spazzata (in alto a sinistra, poi in basso a sinistra, poi a destra)
    cobwebs(280, 390, [['tl', 0.62, 0.25], ['bl', 0.36, 0.45], ['tr', 0.42, 0.75]], 1),
    puff('tl', 0.25), puff('bl', 0.45), puff('tr', 0.75),
    specks,
    h('div', { class: 'dust-puff' }));
}
