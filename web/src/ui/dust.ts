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

function dustCover(): HTMLElement {
  // polvere: puntini sparsi; ognuno vola via quando passa la "scopa" (ritardo in base alla posizione)
  const specks = svg('svg', { class: 'dust-specks', viewBox: '0 0 100 140', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  for (let i = 0; i < 90; i++) {
    const x = rand(2, 98);
    const c = svg('circle', { cx: x.toFixed(1), cy: rand(2, 138).toFixed(1), r: rand(0.35, 1.3).toFixed(2), class: i % 3 ? 'sp' : 'sp dark' });
    c.style.setProperty('--dx', `${rand(14, 40).toFixed(0)}px`);
    c.style.setProperty('--dy', `${rand(-34, 6).toFixed(0)}px`);
    c.style.setProperty('--d', `${(300 + x * 6 + rand(0, 80)).toFixed(0)}ms`);
    specks.appendChild(c);
  }
  return h('div', { class: 'dust-cover', 'aria-hidden': 'true' },
    h('div', { class: 'dust-film' }),
    specks,
    cobweb('web-tl'),
    cobweb('web-tr'),
    cobweb('web-bl'),
    h('div', { class: 'dust-broom' }));
}

/** Ragnatela disegnata a mano nell'angolo in alto a sinistra (le altre sono specchiate via CSS). */
function cobweb(cls: string): SVGElement {
  const threads = 7;
  const len = 92;
  const rings = [16, 30, 45, 60, 76];
  const pt = (r: number, k: number) => {
    const a = (k / (threads - 1)) * (Math.PI / 2);
    return [r * Math.cos(a), r * Math.sin(a)];
  };
  let d = '';
  for (let k = 0; k < threads; k++) {
    const [x, y] = pt(len * (0.86 + (k % 2) * 0.14), k);
    d += `M0 0L${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  rings.forEach((r, ri) => {
    for (let k = 0; k < threads - 1; k++) {
      const [x1, y1] = pt(r, k);
      const [x2, y2] = pt(r, k + 1);
      // il filo si incurva verso il centro della ragnatela
      const sag = 0.78 - ri * 0.015;
      const [mx, my] = pt(r * sag, k + 0.5);
      d += `M${x1.toFixed(1)} ${y1.toFixed(1)}Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
    }
  });
  return svg('svg', { class: `web ${cls}`, viewBox: '-2 -2 100 100', 'aria-hidden': 'true' },
    svg('path', { d, class: 'web-shadow' }),
    svg('path', { d, class: 'web-line' }));
}
