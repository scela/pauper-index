// Ragnatele d'angolo realistiche per "Carta dimenticata": scena, pulsante grande, pulsante della testata.
//
// Combinazione dei tre stili approvati dall'utente:
//   - groviglio (fili tesi a caso vicino all'angolo) con un velo di polvere,
//   - tela a raggi vecchia e rotta, con grumi di polvere impigliati,
//   - fili lunghi e sottilissimi che cedono verso il basso, penzolano e mandano qualche riflesso.
// Generate a caso a ogni uso. Solo SVG originale; i valori casuali passano da style.setProperty (CSSOM), mai da
// attributi style (CSP). Ogni angolo è un gruppo che oscilla appena; dentro, i fili sono divisi in frammenti per
// settore, così alla spazzata si tendono, si strappano e volano via a pezzi (vedi style.css, "ragnatele").

import { h, svg } from '../lib/dom';

export type Corner = 'tl' | 'tr' | 'bl' | 'br';
/** 1 = scena (carta), 0.6 = pulsante grande, 0.3 = pulsante della testata. */
export type Detail = 1 | 0.6 | 0.3;

type Pt = [number, number];
const SHARDS = 4;

let uid = 0;
const f = (n: number) => (Math.round(n * 10) / 10).toString();
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Fili di un angolo, raggruppati per frammento e per spessore/opacità (pochi tracciati, leggeri da animare). */
class Silk {
  shards = Array.from({ length: SHARDS }, () => ({ faint: '', thin: '', mid: '', glint: '', all: '', clumps: [] as [number, number, number][] }));
  haze: string[] = [];

  constructor(private origin: Pt, private sx: number, private sy: number) {}

  /** Frammento in base alla direzione dall'angolo: pezzi contigui, che si staccano insieme. */
  private shardOf(p: Pt): number {
    const a = Math.atan2((p[1] - this.origin[1]) * this.sy, (p[0] - this.origin[0]) * this.sx);
    return Math.max(0, Math.min(SHARDS - 1, Math.floor((a / (Math.PI / 2)) * SHARDS)));
  }

  add(d: string, at: Pt, kind: 'faint' | 'thin' | 'mid'): void {
    const s = this.shards[this.shardOf(at)];
    s[kind] += d;
    s.all += d;
  }

  glint(d: string, at: Pt): void {
    this.shards[this.shardOf(at)].glint += d;
  }

  clump(p: Pt, r: number): void {
    this.shards[this.shardOf(p)].clumps.push([p[0], p[1], r]);
  }
}

interface Frame {
  c: Pt; // angolo
  sx: number; // verso interno lungo x (+1 / -1)
  sy: number; // verso interno lungo y
  at(a: number, r: number, from?: Pt): Pt; // a = 0 lungo il bordo orizzontale, π/2 lungo quello verticale
}

function frame(cx: number, cy: number, sx: number, sy: number): Frame {
  return {
    c: [cx, cy], sx, sy,
    at: (a, r, from = [cx, cy]) => [from[0] + sx * r * Math.cos(a), from[1] + sy * r * Math.sin(a)],
  };
}

/** Curva tra due punti che cede verso il basso dello schermo (gravità) e un po' verso il centro della tela. */
function sag(p1: Pt, p2: Pt, hub: Pt, amount: number): string {
  const mx = (p1[0] + p2[0]) / 2;
  const my = (p1[1] + p2[1]) / 2;
  const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  const k = rand(0.12, 0.24);
  return `M${f(p1[0])} ${f(p1[1])}Q${f(mx + (hub[0] - mx) * k)} ${f(my + (hub[1] - my) * k + len * amount)} ${f(p2[0])} ${f(p2[1])}`;
}

function dangle(silk: Silk, p: Pt, l: number, kind: 'faint' | 'thin' = 'faint'): void {
  silk.add(`M${f(p[0])} ${f(p[1])}c${f(rand(-0.2, 0.2) * l)} ${f(l * 0.4)} ${f(rand(-0.3, 0.3) * l)} ${f(l * 0.8)} ${f(rand(-0.15, 0.15) * l)} ${f(l)}`, p, kind);
}

interface OrbOpts {
  spokes: [number, number];
  reach: number;
  broken: number; // probabilità di un tratto di spirale mancante
  faint: number;
  sag: number;
  glints: number;
  clumps: number;
  anchors: number;
}

/** Tela a raggi irregolare: spaziature diverse, spirale che cede, tratti spezzati e penzolanti, ancoraggi ai bordi. */
function orb(silk: Silk, fr: Frame, size: number, o: OrbOpts): void {
  const hub = fr.at(Math.PI / 4, size * rand(0.04, 0.1));
  const n = o.spokes[0] + Math.floor(Math.random() * (o.spokes[1] - o.spokes[0] + 1));
  // raggi a spaziature irregolari, ma dentro l'angolo
  const steps = Array.from({ length: n - 1 }, () => rand(0.35, 1.65));
  const tot = steps.reduce((x, y) => x + y, 0);
  const span = Math.PI / 2 + rand(0.1, 0.16);
  const ang = [rand(-0.12, -0.06)];
  for (const st of steps) ang.push(ang[ang.length - 1] + (span * st) / tot);
  const len = ang.map((_, i) => size * (i === 0 || i === n - 1 ? rand(0.95, 1.1) : rand(0.6, 1.05)));
  const P = (i: number, r: number) => fr.at(ang[i], r, hub);

  ang.forEach((_, i) => {
    const e = P(i, len[i]);
    const m = P(i, len[i] * 0.5);
    silk.add(`M${f(hub[0])} ${f(hub[1])}Q${f(m[0] + rand(-0.015, 0.015) * size)} ${f(m[1] + rand(0, 0.03) * size)} ${f(e[0])} ${f(e[1])}`,
      m, Math.random() < 0.5 ? 'mid' : 'thin');
    if (Math.random() < o.glints) silk.glint(`M${f(m[0])} ${f(m[1])}L${f(e[0])} ${f(e[1])}`, m);
  });

  let r = size * rand(0.07, 0.12);
  while (r < size * o.reach) {
    for (let i = 0; i < n - 1; i++) {
      if (r > len[i] * 0.95 || r > len[i + 1] * 0.95) continue;
      if (Math.random() < o.broken) {
        if (Math.random() < 0.45) dangle(silk, P(i, r * rand(0.95, 1.05)), size * rand(0.05, 0.17));
        continue;
      }
      const p1 = P(i, r * rand(0.93, 1.07));
      const p2 = P(i + 1, r * rand(0.93, 1.07));
      silk.add(sag(p1, p2, hub, o.sag * rand(0.6, 1.4)), p1, Math.random() < o.faint ? 'faint' : Math.random() < 0.7 ? 'thin' : 'mid');
      if (Math.random() < o.glints * 0.25) silk.glint(sag(p1, p2, hub, o.sag), p1);
      if (Math.random() < o.clumps) silk.clump(p1, size * rand(0.012, 0.037));
    }
    r += size * rand(0.05, 0.12) + r * 0.1;
  }

  // ancoraggi: dal capo esterno di un raggio al bordo vicino
  for (let k = 0; k < o.anchors; k++) {
    const i = Math.floor(Math.random() * n);
    const s = P(i, len[i] * rand(0.85, 1));
    const e: Pt = ang[i] < Math.PI / 4 ? [s[0] + fr.sx * size * rand(0.1, 0.35), fr.c[1]] : [fr.c[0], s[1] + fr.sy * size * rand(0.1, 0.35)];
    silk.add(sag(s, e, s, 0.04), s, 'faint');
  }
}

/** Groviglio: fili tesi a caso tra i bordi e punti interni, più fitti verso l'angolo. */
function tangle(silk: Silk, fr: Frame, size: number, points: number, chords: number, clumps: number): void {
  const pts: Pt[] = [];
  for (let i = 0; i < points; i++) {
    const t = Math.pow(Math.random(), 1.6);
    const edge = Math.random();
    if (edge < 0.33) pts.push([fr.c[0] + fr.sx * size * t * 1.1, fr.c[1] + fr.sy * size * 0.01]);
    else if (edge < 0.66) pts.push([fr.c[0] + fr.sx * size * 0.01, fr.c[1] + fr.sy * size * t * 1.1]);
    else pts.push(fr.at(Math.random() * Math.PI / 2, size * Math.pow(Math.random(), 1.3) * 0.7));
  }
  const hub = fr.at(Math.PI / 4, size * 0.2);
  for (let k = 0; k < chords; k++) {
    const p1 = pts[Math.floor(Math.random() * pts.length)];
    const p2 = pts[Math.floor(Math.random() * pts.length)];
    if (p1 === p2) continue;
    silk.add(sag(p1, p2, hub, rand(0.05, 0.2)), p1, Math.random() < 0.5 ? 'faint' : Math.random() < 0.85 ? 'thin' : 'mid');
    if (Math.random() < clumps) silk.clump([(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2 + size * 0.02], size * rand(0.012, 0.04));
  }
}

/** Fili lunghi e sottilissimi che cedono e penzolano, con un riflesso di luce. */
function drapes(silk: Silk, fr: Frame, size: number, count: number): void {
  for (let k = 0; k < count; k++) {
    const p1: Pt = [fr.c[0] + fr.sx * size * rand(0.3, 1.2), fr.c[1] + fr.sy * size * rand(0, 0.04)];
    const p2: Pt = [fr.c[0] + fr.sx * size * rand(0, 0.04), fr.c[1] + fr.sy * size * rand(0.3, 1.2)];
    const d = sag(p1, p2, fr.c, rand(0.15, 0.35));
    silk.add(d, p1, 'faint');
    if (Math.random() < 0.6) silk.glint(d, p1);
    if (Math.random() < 0.5) dangle(silk, p1, size * rand(0.15, 0.4));
  }
}

/** Velo di polvere a ventaglio nell'angolo (bordi sfumati). */
function haze(silk: Silk, fr: Frame, size: number): void {
  let d = `M${f(fr.c[0])} ${f(fr.c[1])}`;
  for (let a = -0.05; a <= Math.PI / 2 + 0.05; a += 0.18) {
    const p = fr.at(a, size * rand(0.4, 0.8));
    d += `L${f(p[0])} ${f(p[1])}`;
  }
  silk.haze.push(d + 'Z');
}

/**
 * Ragnatele negli angoli di un riquadro W × H (unità circa uguali ai pixel CSS).
 * corners: [angolo, lato della ragnatela rispetto al lato minore, ritardo dello strappo in secondi].
 *
 * Struttura pensata per animare solo il compositore: ogni angolo è un riquadro HTML grande quanto la sua ragnatela
 * (oscilla e si tende come un tutto); dentro, il velo di polvere e ogni frammento sono SVG separati e fermi al loro
 * interno, che si muovono solo con transform e opacity. Filtri e sfocature restano su elementi che non cambiano.
 */
export function cobwebs(W: number, H: number, corners: [Corner, number, number?][], detail: Detail): HTMLElement {
  const m = Math.min(W, H);
  const sw = detail === 1 ? 1 : detail === 0.6 ? 1.1 : 1.25; // spessore base: i fili restano tra mezzo pixel e un pixel
  const root = h('div', { class: 'cw', 'aria-hidden': 'true' });
  const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(2)}%`;

  for (const [k, frac, order = 0] of corners) {
    const size = m * frac;
    // riquadro dell'angolo: poco più grande della ragnatela (fili penzolanti e ancoraggi), mai oltre il contenitore
    const bw = Math.min(W, size * 1.45);
    const bh = Math.min(H, size * 1.55);
    const right = k.includes('r');
    const bottom = k.includes('b');
    const fr = frame(right ? bw : 0, bottom ? bh : 0, right ? -1 : 1, bottom ? -1 : 1);
    const silk = new Silk(fr.c, fr.sx, fr.sy);
    if (detail === 1) {
      haze(silk, fr, size);
      tangle(silk, fr, size * 0.65, 18, 34, 0.08);
      orb(silk, fr, size, { spokes: [7, 10], reach: 0.95, broken: 0.25, faint: 0.45, sag: 0.18, glints: 0.3, clumps: 0.08, anchors: 3 });
      drapes(silk, fr, size, 2);
    } else if (detail === 0.6) {
      tangle(silk, fr, size * 0.5, 8, 10, 0.05);
      orb(silk, fr, size, { spokes: [5, 7], reach: 0.95, broken: 0.2, faint: 0.35, sag: 0.18, glints: 0.35, clumps: 0.06, anchors: 1 });
      drapes(silk, fr, size, 1);
    } else {
      orb(silk, fr, size, { spokes: [4, 5], reach: 0.9, broken: 0.15, faint: 0.2, sag: 0.15, glints: 0.3, clumps: 0.04, anchors: 1 });
    }

    const box = h('div', { class: `cw-corner cw-${k}` });
    box.style.setProperty('width', pct(bw, W));
    box.style.setProperty('height', pct(bh, H));
    box.style.setProperty('--sway', `${rand(4.5, 7).toFixed(2)}s`);
    box.style.setProperty('--phase', `${(-rand(0, 6)).toFixed(2)}s`);
    box.style.setProperty('--t0', `${order}s`);
    const layer = (cls: string, ...children: SVGElement[]) =>
      svg('svg', { class: cls, viewBox: `0 0 ${f(bw)} ${f(bh)}`, preserveAspectRatio: 'none', focusable: 'false' }, ...children);

    if (silk.haze.length) {
      const id = `cw${++uid}`;
      box.append(layer('cw-haze',
        svg('defs', {},
          svg('filter', { id: `${id}n`, x: '0', y: '0', width: '1', height: '1' },
            svg('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.09', numOctaves: '3', seed: String(Math.floor(rand(1, 999))) }),
            svg('feColorMatrix', { type: 'matrix', values: '0 0 0 0 0.78  0 0 0 0 0.76  0 0 0 0 0.72  1.6 0 0 0 -0.55' })),
          svg('filter', { id: `${id}s`, x: '-20%', y: '-20%', width: '140%', height: '140%' }, svg('feGaussianBlur', { stdDeviation: f(m / 25) })),
          svg('mask', { id: `${id}m`, maskUnits: 'userSpaceOnUse', x: '0', y: '0', width: f(bw), height: f(bh) },
            svg('path', { d: silk.haze.join(''), fill: '#fff', filter: `url(#${id}s)` }))),
        svg('rect', { width: f(bw), height: f(bh), filter: `url(#${id}n)`, mask: `url(#${id}m)` })));
    }
    silk.shards.forEach((sh, i) => {
      if (!sh.all) return;
      const id = `cw${++uid}`;
      const defs = sh.clumps.length ? [svg('defs', {},
        svg('filter', { id: `${id}b`, x: '-50%', y: '-50%', width: '200%', height: '200%' }, svg('feGaussianBlur', { stdDeviation: f(sw * 0.6) })),
        svg('radialGradient', { id: `${id}g` },
          svg('stop', { offset: '0', 'stop-color': '#dcd6c9', 'stop-opacity': '0.95' }),
          svg('stop', { offset: '0.6', 'stop-color': '#b9b2a4', 'stop-opacity': '0.6' }),
          svg('stop', { offset: '1', 'stop-color': '#b9b2a4', 'stop-opacity': '0' })))] : [];
      const shard = layer('cw-shard', ...defs,
        svg('path', { class: 'cw-shadow', d: sh.all, 'stroke-width': f(sw * 1.6), transform: `translate(${f(sw * 0.35)} ${f(sw * 0.5)})` }),
        svg('path', { class: 'cw-faint', d: sh.faint, 'stroke-width': f(sw * 0.45) }),
        svg('path', { class: 'cw-thin', d: sh.thin, 'stroke-width': f(sw * 0.6) }),
        svg('path', { class: 'cw-mid', d: sh.mid, 'stroke-width': f(sw * 0.8) }),
        svg('path', { class: 'cw-glint', d: sh.glint, 'stroke-width': f(sw * 0.7), 'stroke-dasharray': `${f(sw * 1.6)} ${f(sw * 18)}` }),
        ...sh.clumps.map(([x, y, r]) => svg('ellipse', { cx: f(x), cy: f(y), rx: f(r * 1.3), ry: f(r), fill: `url(#${id}g)`, filter: `url(#${id}b)` })));
      // strappo: ogni frammento ruota attorno al suo settore e vola via nella direzione della spazzata (verso destra)
      const mid = ((i + 0.5) / SHARDS) * (Math.PI / 2);
      const o = fr.at(mid, size * 0.45);
      shard.style.setProperty('transform-origin', `${pct(o[0], bw)} ${pct(o[1], bh)}`);
      shard.style.setProperty('--dx', `${f(-fr.sx * m * rand(0.03, 0.1) + m * rand(0.12, 0.3))}px`);
      shard.style.setProperty('--dy', `${f(m * rand(0.05, 0.22) * (0.5 + i / (SHARDS - 1)))}px`);
      shard.style.setProperty('--rot', `${rand(-30, 30).toFixed(0)}deg`);
      shard.style.setProperty('--d', `${rand(0, 0.06).toFixed(2)}s`);
      box.append(shard);
    });
    root.append(box);
  }
  return root;
}

/** Nuvoletta di polvere in un angolo (si alza quando la ragnatela viene strappata). */
export function puff(corner: Corner, order = 0): HTMLElement {
  const el = h('span', { class: `cw-puff cw-puff-${corner}`, 'aria-hidden': 'true' });
  el.style.setProperty('--t0', `${order}s`);
  return el;
}
