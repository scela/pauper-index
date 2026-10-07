// "Rispolvera una carta": pesca una carta dimenticata e la mostra mentre ragnatele e polvere vengono spazzate via.
// L'effetto usa solo elementi sovrapposti (SVG e CSS): l'immagine non viene mai filtrata né ricolorata
// (regole di Scryfall) e alla fine la copertura viene rimossa, quindi la carta è interamente visibile.
//
// Fluidità (vedi CLAUDE.md, "Carta dimenticata: fluidità"): la scena resta la stessa tra una pesca e l'altra
// (dimensioni fisse, due livelli d'immagine per la dissolvenza); la carta successiva è scelta in anticipo e la sua
// immagine è già scaricata e decodificata; anche la copertura è preparata in anticipo. La sequenza dura circa 0,9 s
// e anima solo transform e opacity; una nuova pressione durante l'animazione salta subito alla fine.

import { t } from '../i18n';
import type { Opts } from '../lib/compare';
import { imageUrl, type Data } from '../lib/data';
import { h, svg } from '../lib/dom';
import { commitCard, dustPool, historyWindow, peakYear, pickCard } from '../lib/dust';
import { fmtDate, fmtInt, fmtPct, fmtPrint, lastSeen } from '../lib/format';
import type { CollectionIndex, Owned } from '../lib/quick';
import { ssGet, ssSet } from '../lib/store';
import { cobwebs, puff, type Corner } from './cobweb';
import { enableTilt, type Tilt } from './tilt';

export interface DustCtx {
  data(): Data | null;
  opts(): Opts;
  collection(): CollectionIndex | null;
  openArtworks(anchor: HTMLElement, idx: number, owned: Owned | null): void;
}

const IMG_WAIT_MS = 2500; // immagine lenta (non precaricata): la spazzata parte comunque
const INFO_SWAP_MS = 150; // i dettagli cambiano sotto la polvere
const REGROW_MS = 700; // dopo la carta visibile, le ragnatele del pulsante si riformano con calma
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Pick { idx: number; restarted: boolean; id: string; fallback: string; ready: Promise<boolean> }

/** Scarica e decodifica un'immagine (dal CDN di Scryfall, ammesso dalla CSP). */
function preload(url: string): Promise<boolean> {
  const im = new Image();
  im.decoding = 'async';
  im.src = url;
  return im.decode().then(() => true, () => false);
}

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
  let owned: Owned | null = null;
  let note = '';
  let pool: number[] | null = null;
  let poolFor: Data | null = null;
  let next: Pick | null = null;
  let nextCover: HTMLElement | null = null;
  let running: { finish(): void } | null = null;
  let tilt: Tilt | null = null;
  let regrowTimer: number | undefined;

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

  /** Immagine della carta: la printing posseduta, altrimenti quella di riferimento. */
  const imageFor = (d: Data, idx: number) => {
    const prints = d.prints.p[idx] || [];
    const ref = prints[d.cards.c[idx].r];
    const own = ctx.collection()?.byCard.get(idx);
    const ownedId = own?.prints.map((p) => p.row.i || (p.print >= 0 ? prints[p.print][0] : '')).find(Boolean);
    return { id: ownedId || ref?.[0] || '', fallback: ref?.[0] || '' };
  };

  // ---- scena fissa: cornice (due livelli d'immagine) e dettagli; non viene mai ricreata ----
  const imgA = h('img', { class: 'card', alt: '', width: 488, height: 680, decoding: 'async', 'aria-hidden': 'true' });
  const imgB = h('img', { class: 'card', alt: '', width: 488, height: 680, decoding: 'async', 'aria-hidden': 'true' });
  let front = imgA; // immagine visibile
  let back = imgB; // immagine in arrivo
  const tap = h('span', { class: 'dust-tap', 'aria-hidden': 'true' }, t('dust.tap'));
  let cover: HTMLElement | null = dustCover(true);
  const stage = h('button', { class: 'dust-stage dust-empty', type: 'button', 'aria-label': t('dust.tapFrame') }, imgA, imgB, cover, tap);
  const info = h('div', { class: 'qinfo dust-info' });
  const scene = h('div', { class: 'dust-scene' }, stage, info);

  /** Carta successiva scelta in anticipo, con l'immagine già scaricata, e la copertura già pronta. */
  const prepareNext = () => {
    const d = ctx.data();
    if (!d) return;
    const pick = pickCard(d, poolNow(d), seen);
    if (!pick) {
      next = null;
      return;
    }
    if (next && next.idx === pick.idx) return;
    const img = imageFor(d, pick.idx);
    next = { ...pick, ...img, ready: preload(imageUrl(img.id, 'normal')) };
    // generare la copertura (molti elementi SVG) costa qualche millisecondo: lo si fa ora, non alla pressione
    window.setTimeout(() => {
      if (!running) nextCover = dustCover(false);
    }, 50);
  };

  const renderInfo = () => {
    const d = ctx.data();
    const coll = ctx.collection();
    allWrap.hidden = !coll;
    allBox.checked = fromAll;
    btnLabel.textContent = drawn && current >= 0 ? t('dust.again') : t('dust.button');
    tap.textContent = t('dust.tap');
    if (!d) return;
    if (!drawn || current < 0) {
      owned = null;
      scene.classList.remove('is-owned');
      stage.setAttribute('aria-label', t('dust.tapFrame'));
      info.replaceChildren(h('p', { class: drawn ? '' : 'note' }, !drawn ? t('dust.emptyInfo')
        : coll && !fromAll ? t('dust.noneOwned', { n: fmtInt(fullPool(d).length) }) : t('dust.none')));
      return;
    }
    const c = d.cards.c[current];
    const opts = ctx.opts();
    owned = coll ? coll.byCard.get(current) || null : null;
    const st = c.s[historyWindow(d)];
    const decks = st ? (opts.side ? st[0] : st[1]) : 0;
    const peak = peakYear(c, d.cards.yt);
    // ultima apparizione: la più recente tra MTGO e cartaceo
    const last = [lastSeen(d, c.lm, 'm'), lastSeen(d, c.lp, 'p')].filter((x) => x !== null)
      .sort((a, b) => b!.date.localeCompare(a!.date))[0] || null;
    const parts: (Node | null)[] = [
      h('h3', { class: 'qtitle', id: 'dustTitle' }, c.n),
      h('p', null, t('dust.played', { n: fmtInt(decks), from: fmtDate(c.f), to: fmtDate(c.z) })),
      peak ? h('p', null, t('dust.peak', { year: peak.year, pct: fmtPct(peak.share) })) : null,
      last ? h('p', null, t('dust.last', { date: fmtDate(last.date) }),
        last.uri ? h('a', { href: last.uri, target: '_blank', rel: 'noopener noreferrer' }, last.tournament) : last.tournament,
        last.result ? ` · ${last.result}` : '') : null,
    ];
    if (coll) {
      parts.push(owned && owned.total > 0
        ? h('p', { class: 'qowned' }, t('quick.owned', { n: owned.total }), h('span', { class: 'note' }, ' · '
          + owned.prints.map((p) => `${fmtPrint(p.row)} ×${p.q}`).join(', ')))
        : h('p', { class: 'qnotowned' }, t('quick.notOwned')));
    }
    if (note) parts.push(h('p', { class: 'note' }, note));
    info.replaceChildren(...parts.filter((x): x is Node => x !== null));
    scene.classList.toggle('is-owned', !!owned && owned.total > 0);
    stage.setAttribute('aria-label', t('quick.imageAlt', { name: c.n }));
    front.alt = t('dust.imageAlt', { name: c.n });
  };

  /** Mette l'immagine nel livello in arrivo (con il ripiego sulla printing di riferimento). */
  const loadBack = (p: Pick) => {
    back.src = imageUrl(p.id, 'normal');
    if (p.fallback && p.fallback !== p.id) back.dataset.fallback = imageUrl(p.fallback, 'normal');
    else delete back.dataset.fallback;
  };

  /** Fine della sequenza: il livello in arrivo diventa quello visibile, la copertura sparisce. */
  const settle = () => {
    back.classList.remove('card-in');
    front.classList.remove('card-cur', 'card-out');
    back.classList.add('card-cur');
    front.removeAttribute('src');
    front.alt = '';
    front.setAttribute('aria-hidden', 'true');
    [front, back] = [back, front];
    front.removeAttribute('aria-hidden');
    stage.classList.remove('dust-empty');
    tap.hidden = true;
    renderInfo();
  };

  const regrowButtonWebs = () => {
    window.clearTimeout(regrowTimer);
    regrowTimer = window.setTimeout(() => {
      growButtonWebs();
      btn.classList.remove('sweep');
      btn.classList.add('regrow');
    }, REGROW_MS);
  };

  /** Sequenza animata: polvere sulla carta vecchia, dissolvenza tra le due carte, spazzata, ragnatele strappate. */
  const animate = (p: Pick) => {
    const timers: number[] = [];
    let swapped = false;
    let done = false;
    tilt?.pause(); // l'inclinazione torna piatta dolcemente ed è disattivata durante l'animazione
    btn.classList.remove('regrow');
    btn.classList.add('sweep');
    const cv = cover && stage.classList.contains('dust-empty') ? cover : (nextCover || dustCover(false));
    nextCover = null;
    if (cv !== cover) {
      cover?.remove();
      stage.append(cv);
      cv.classList.add('in'); // la polvere copre la carta vecchia
    }
    cover = cv;
    tap.classList.add('gone');
    info.classList.remove('swap-in');
    info.classList.add('swap-out');
    const swapInfo = () => {
      if (swapped) return;
      swapped = true;
      renderInfo();
      info.classList.remove('swap-out');
      info.classList.add('swap-in');
    };
    timers.push(window.setTimeout(swapInfo, INFO_SWAP_MS));

    const end = () => {
      if (done) return;
      done = true;
      timers.forEach((x) => window.clearTimeout(x));
      swapInfo();
      if (!back.getAttribute('src')) loadBack(p);
      // salta alla fine: animazioni finite subito, nessun accumulo
      for (const a of [...cv.getAnimations({ subtree: true }), ...front.getAnimations(), ...back.getAnimations()]) {
        if (a.effect?.getTiming().iterations !== Infinity) a.finish();
      }
      cv.remove();
      if (cover === cv) cover = null;
      settle();
      info.classList.remove('swap-out');
      running = null;
      if (!reducedMotion()) {
        tilt ??= enableTilt(stage);
        tilt.resume();
      }
      regrowButtonWebs();
      prepareNext();
    };
    running = { finish: end };

    const go = () => {
      if (done) return;
      back.classList.add('card-in');
      front.classList.add('card-out');
      stage.classList.remove('dust-empty'); // il bordo tratteggiato della cornice vuota sparisce sotto la polvere
      cv.classList.add('go');
      // alla fine delle animazioni finite la copertura si rimuove: la carta resta intera, senza nulla sopra
      const anims = [...cv.getAnimations({ subtree: true }), ...back.getAnimations()]
        .filter((a) => a.effect?.getTiming().iterations !== Infinity);
      if (anims.length) void Promise.all(anims.map((a) => a.finished)).then(end, end);
      else timers.push(window.setTimeout(end, 950));
    };
    loadBack(p);
    // l'immagine è di solito già pronta (precaricata); se no si aspetta un poco sotto la polvere
    const wait = new Promise<void>((res) => timers.push(window.setTimeout(res, IMG_WAIT_MS)));
    void Promise.race([p.ready.then(() => back.decode().catch(() => undefined)), wait]).then(go);
  };

  const press = () => {
    const d = ctx.data();
    if (!d) return;
    if (running) return running.finish(); // nuova pressione durante l'animazione: salta subito alla fine
    const poolList = poolNow(d);
    let p = next && poolList.includes(next.idx) ? next : null;
    if (!p) {
      const pick = pickCard(d, poolList, seen);
      if (pick) {
        const img = imageFor(d, pick.idx);
        p = { ...pick, ...img, ready: preload(imageUrl(img.id, 'normal')) };
      }
    }
    next = null;
    drawn = true;
    if (!p) {
      // nessuna carta da pescare (per esempio nessuna carta dimenticata tra quelle possedute): cornice vuota
      current = -1;
      note = '';
      resetStage();
      renderInfo();
      return;
    }
    commitCard(d, poolList, seen, p);
    ssSet('dusted', [...seen].join(','));
    current = p.idx;
    note = p.restarted ? t('dust.restarted') : '';
    root.scrollIntoView({ block: 'nearest' });
    if (reducedMotion()) {
      // come prima: niente copertura né animazioni, la carta appare subito
      cover?.remove();
      cover = null;
      loadBack(p);
      back.classList.add('card-cur');
      settle();
      prepareNext();
      return;
    }
    animate(p);
  };

  /** Torna alla cornice vuota (senza carte da mostrare). */
  const resetStage = () => {
    running?.finish();
    for (const im of [imgA, imgB]) {
      im.classList.remove('card-cur', 'card-in', 'card-out');
      im.removeAttribute('src');
      im.alt = '';
    }
    tilt?.pause();
    if (!cover) {
      cover = dustCover(true);
      stage.append(cover);
    }
    stage.classList.add('dust-empty');
    tap.hidden = false;
    tap.classList.remove('gone');
  };

  stage.addEventListener('click', () => {
    if (running) return running.finish();
    if (stage.classList.contains('dust-empty')) return press(); // anche la cornice vuota si tocca per pescare
    // un tocco trascinato serve a inclinare la carta, non apre la scheda
    if (stage.dataset.dragged) return void delete stage.dataset.dragged;
    if (current >= 0) ctx.openArtworks(stage, current, owned);
  });

  // ragnatele del pulsante (una per angolo, nuove a ogni ricrescita) e della voce in testata
  const growButtonWebs = () => {
    btn.querySelectorAll('.bweb').forEach((el) => el.remove());
    btn.prepend(...(['tl', 'tr', 'br'] as Corner[]).map((k, i) =>
      h('span', { class: `bweb bweb-${k}`, 'aria-hidden': 'true' }, cobwebs(44, 44, [[k, 0.95, i * 0.04]], 0.6), puff(k, i * 0.04))));
  };
  growButtonWebs();
  document.querySelector('#navDust .nd-web')?.replaceChildren(cobwebs(26, 26, [['tr', 0.95]], 0.3));
  btn.addEventListener('click', press);
  allBox.addEventListener('change', () => {
    fromAll = allBox.checked;
    next = null;
    if (drawn) press();
    else prepareNext();
  });

  return {
    refresh: () => {
      if (!root.contains(scene)) root.replaceChildren(scene);
      renderInfo();
      if (!running) prepareNext();
    },
  };
}

/* ---------- copertura ---------- */

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

let uid = 0;

/**
 * Copertura: velo di polvere (rumore SVG, fermo), granelli che volano via quando passa la mano, nuvoletta di
 * polvere sul bordo della spazzata, ragnatele negli angoli. Si anima solo con transform e opacity.
 */
function dustCover(still: boolean): HTMLElement {
  const id = ++uid;
  const seed = String(Math.floor(rand(1, 999)));
  const mk = svg;
  // velo: chiazze larghe (bassa frequenza) + grana fine; il colore è un grigio-beige, l'alfa viene dal rumore
  const tex = mk('svg', { class: 'dust-tex', viewBox: '0 0 100 140', preserveAspectRatio: 'none', 'aria-hidden': 'true' },
    mk('defs', {},
      mk('filter', { id: `dblot${id}`, x: '0', y: '0', width: '1', height: '1' },
        mk('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.045', numOctaves: '3', seed }),
        mk('feColorMatrix', { type: 'matrix', values: '0 0 0 0 0.74  0 0 0 0 0.72  0 0 0 0 0.68  1.4 0 0 0 -0.4' })),
      mk('filter', { id: `dgrain${id}`, x: '0', y: '0', width: '1', height: '1' },
        mk('feTurbulence', { type: 'fractalNoise', baseFrequency: '1.6', numOctaves: '1', seed: String(Number(seed) + 7) }),
        mk('feColorMatrix', { type: 'matrix', values: '0 0 0 0 0.62  0 0 0 0 0.6  0 0 0 0 0.56  4 0 0 0 -2.35' })),
      // più polvere verso i bordi, dove si deposita
      mk('radialGradient', { id: `dvig${id}`, cx: '50', cy: '70', r: '86', gradientUnits: 'userSpaceOnUse' },
        mk('stop', { offset: '0.35', 'stop-color': '#bdb6a8', 'stop-opacity': '0.16' }),
        mk('stop', { offset: '1', 'stop-color': '#bdb6a8', 'stop-opacity': '0.5' }))),
    mk('rect', { width: '100', height: '140', fill: `url(#dvig${id})` }),
    mk('rect', { width: '100', height: '140', filter: `url(#dblot${id})` }),
    mk('rect', { width: '100', height: '140', filter: `url(#dgrain${id})` }));

  // granelli e fiocchi (elementi HTML: si muovono nel compositore); partono quando li raggiunge la spazzata
  const specks = h('div', { class: 'dust-specks' });
  for (let i = 0; i < 28; i++) {
    const x = rand(2, 98);
    const y = rand(2, 98);
    const el = h('i', { class: i % 7 === 0 ? 'flake' : i % 3 ? '' : 'dark' });
    const reach = (x + y * 0.45) / 145; // 0..1 lungo la diagonale della spazzata
    el.style.setProperty('left', `${x.toFixed(1)}%`);
    el.style.setProperty('top', `${y.toFixed(1)}%`);
    el.style.setProperty('--dx', `${rand(18, 60).toFixed(0)}px`);
    el.style.setProperty('--dy', `${rand(-20, 40).toFixed(0)}px`);
    el.style.setProperty('--rot', `${rand(-160, 160).toFixed(0)}deg`);
    el.style.setProperty('--d', `${(180 + reach * 320).toFixed(0)}ms`);
    specks.append(el);
  }
  return h('div', { class: 'dust-cover' + (still ? ' still' : ''), 'aria-hidden': 'true' },
    h('div', { class: 'dust-film' }, tex),
    // ragnatele: si strappano seguendo la spazzata (in alto a sinistra, poi in basso a sinistra, poi a destra)
    cobwebs(280, 390, [['tl', 0.62, 0.18], ['bl', 0.36, 0.24], ['tr', 0.42, 0.3]], 1),
    puff('tl', 0.18), puff('bl', 0.24), puff('tr', 0.3),
    specks,
    h('div', { class: 'dust-puff' }));
}
