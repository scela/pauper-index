// Tier list degli archetipi (#mazzi): schede per tier (Tier 1, 2, 3, poi "Altri"), filtri per colore, tier, prezzo e
// completamento. Le famiglie, i tier e le carte simbolo vengono dalla pipeline (data/decks-61.json, formato v2).
// Illustrazioni (art_crop di Scryfall): mai testo o livelli sopra, l'artista sotto ogni immagine e la riga del
// copyright nella stessa pagina (regola di Scryfall, vedi CLAUDE.md).

import { fmtDate, fmtEur, fmtEurAbout, fmtInt, fmtPct, getLang, t, type Key } from '../i18n';
import { COLORS, type ColorKey } from '../lib/cardfilter';
import { imageUrl, type Data } from '../lib/data';
import {
  closestDeck, emptyTierFilters, families, listPrice, variantLabels, visibleFamilies,
  type Completion, type Deck, type DecksFile, type Family, type FamilyScore, type TierFilters,
} from '../lib/decks';
import { $, h, svg } from '../lib/dom';
import { cheapestPrice, type PricesFile } from '../lib/prices';
import { colorLabel } from './filterpanel';
import { manaIcon, type ManaSymbol } from './mana';

/** Righe degli "Altri" mostrate prima di "Mostra tutti". */
const OTHERS_SHOWN = 12;
/** Soglie del prezzo (euro): della lista tipica senza collezione, del costo per completare con la collezione. */
export const PRICE_LIST = [50, 75, 100, 150];
export const PRICE_MISSING = [0, 10, 25, 50, 100];
/** Completamento minimo della lista più vicina. */
const MINS = [0, 0.5, 0.75, 0.9, 1];

export interface TierCtx {
  data(): Data | null;
  loaded(): { file: DecksFile; decks: Deck[]; basics: Set<number> } | null;
  owned(): ((idx: number) => number) | null;
  prices(): PricesFile | null;
  /** completamento di ogni lista del file (con la collezione), con main/side scelti */
  comp(): Map<number, Completion> | null;
  side(): boolean;
  setSide(v: boolean): void;
}

const colorNames = (colors: string) => [...colors].map((c) => t(`color.${c}` as Key).toLocaleLowerCase(getLang()));

/** Simboli di mana dei colori (almeno 18–20 px nella tier list), con il nome dei colori come testo alternativo. */
export function manaPips(colors: string): HTMLElement {
  const list = (colors ? [...colors] : ['C']) as ManaSymbol[];
  return h('span', { class: 'pips big', role: 'img', 'aria-label': colors ? t('decks.colors', { v: colorNames(colors).join(', ') }) : t('decks.colorless') },
    ...list.map((c) => manaIcon(c)));
}


/** Illustrazione ritagliata della carta simbolo, con l'artista sotto (mai sopra l'immagine). */
export function familyArt(d: Data, symbol: number, big = false): HTMLElement | null {
  const c = d.cards.c[symbol];
  const pr = c ? d.prints.p[symbol]?.[c.r] : null;
  if (!c || !pr) return null;
  const artist = d.prints.artists[pr[3]] || '';
  return h('figure', { class: 'fam-art' + (big ? ' big' : '') },
    h('img', { src: imageUrl(pr[0], 'art_crop'), alt: '', loading: 'lazy', decoding: 'async', width: 640, height: 480 }),
    // nelle schede orizzontali su mobile (illustrazione stretta) compare la forma breve, sempre con l'artista
    h('figcaption', { class: 'fam-artist' }, ...(artist
      ? [h('span', { class: 'fa-long' }, t('tier.artist', { name: artist, card: c.n })), h('span', { class: 'fa-short' }, t('tier.artistShort', { name: artist }))]
      : [c.n])));
}

export function initTier(ctx: TierCtx): { render(): void } {
  const F: TierFilters = emptyTierFilters(); // filtri che nascondono archetipi: mai salvati
  let showAllOthers = false;
  let built = '';
  // su mobile i filtri partono chiusi, perché altrimenti occupano tutto il primo schermo
  if (window.matchMedia('(max-width: 640px)').matches) ($('#tfBox') as HTMLDetailsElement).open = false;
  const priceSel = $('#tfPrice') as HTMLSelectElement;
  const minSel = $('#tfMin') as HTMLSelectElement;
  const gotoSel = $('#tfGoto') as HTMLSelectElement;

  const priceOf = (idx: number) => cheapestPrice(ctx.prices(), idx);

  /** Prezzo filtrato e completamento della lista più vicina (con la collezione). */
  const score = (fam: Family): FamilyScore & { closest: ReturnType<typeof closestDeck>; list: number | null } => {
    const L = ctx.loaded()!;
    const pr = ctx.prices();
    const comp = ctx.comp();
    const list = pr && fam.typical ? listPrice(fam.typical, priceOf, L.basics, true).cents : null;
    if (!comp) return { price: list, pct: null, closest: null, list };
    const closest = closestDeck(fam, comp, priceOf);
    return { price: pr && closest ? closest.cost : null, pct: closest ? closest.pct : null, closest, list };
  };

  const pressed = (on: boolean) => ({ type: 'button' as const, 'aria-pressed': String(on) });
  const check = () => svg('svg', { class: 'fcheck', viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false' }, svg('path', { d: 'M3 8.5l3.2 3L13 4.5' }));

  function renderControls(fams: Family[]): void {
    const coll = !!ctx.owned();
    const pr = !!ctx.prices();
    const key = `${getLang()}|${coll}|${pr}`;
    if (built !== key) {
      built = key;
      $('#tfColors').replaceChildren(...COLORS.map((c) => h('button', { class: 'fbtn', ...pressed(false), dataset: { tf: 'color', v: c } },
        check(), manaIcon(c), colorLabel(c))));
      $('#tfTiers').replaceChildren(...[1, 2, 3, 4].map((n) => h('button', { class: 'fbtn', ...pressed(false), dataset: { tf: 'tier', v: String(n) } },
        check(), n === 4 ? t('tier.others') : t('tier.n', { n }))));
      // il prezzo filtrato cambia con la collezione: l'etichetta lo dice
      $('#tfPriceLabel').textContent = coll ? t('tier.priceMissing') : t('tier.priceList');
      const steps = coll ? PRICE_MISSING : PRICE_LIST;
      priceSel.replaceChildren(h('option', { value: '' }, pr ? t('tier.priceAny') : t('tier.pricePending')),
        ...steps.map((e) => h('option', { value: String(e) }, coll && e === 0 ? t('tier.priceDone') : t('tier.priceUpTo', { v: fmtEur(e * 100) }))));
      priceSel.disabled = !pr;
      minSel.replaceChildren(...MINS.map((m) => h('option', { value: String(m) },
        m === 0 ? t('decks.minAny') : m === 1 ? t('decks.minFull') : t('decks.minPct', { p: fmtPct(m) }))));
    }
    $('#tfColors').querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.setAttribute('aria-pressed', String(F.colors.includes(b.dataset.v as ColorKey))));
    $('#tfTiers').querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.setAttribute('aria-pressed', String(F.tiers.includes(Number(b.dataset.v)))));
    document.querySelectorAll<HTMLInputElement>('input[name="tColorMode"]').forEach((r) => { r.checked = r.value === F.colorMode; });
    priceSel.value = F.maxPrice === null ? '' : String(F.maxPrice / 100);
    $('#tfMinWrap').hidden = !coll;
    $('#tfSideWrap').hidden = !coll;
    minSel.value = String(F.min);
    document.querySelectorAll<HTMLInputElement>('input[name="tSide"]').forEach((r) => { r.checked = (r.value === 'side') === ctx.side(); });
    gotoSel.replaceChildren(h('option', { value: '' }, t('tier.gotoPick')),
      ...fams.map((f) => h('option', { value: f.id }, f.name)));
  }

  function famCard(d: Data, fam: Family, s: ReturnType<typeof score>): HTMLElement {
    const vars = fam.variants;
    const labels = variantLabels(vars.map((v) => v.name));
    const total = fam.apps || 1;
    const shownVars = vars.slice(0, 3);
    const comp = s.closest;
    let compEl: HTMLElement | null = null;
    if (ctx.comp() && comp) {
      const bar = h('span', { class: 'dk-fill' });
      bar.style.width = `${Math.round(comp.pct * 1000) / 10}%`;
      compEl = h('p', { class: 'fam-comp' + (comp.pct >= 1 ? ' full' : '') },
        h('span', { class: 'dk-bar', 'aria-hidden': 'true' }, bar),
        h('span', null, comp.pct >= 1 ? t('tier.closestFull') : t('tier.closest', { p: fmtPct(comp.pct) })),
        ctx.prices() && comp.pct < 1 ? h('span', { class: 'muted' }, ` · ${t('tier.toComplete', { v: fmtEurAbout(comp.cost) })}`) : null);
    }
    return h('li', { class: 'fam' }, h('a', { class: 'fam-card', href: `#mazzi/${fam.id}` },
      fam.symbol >= 0 ? familyArt(d, fam.symbol) : null,
      h('span', { class: 'fam-body' },
        h('span', { class: 'fam-title' }, h('span', { class: 'fam-name' }, fam.name), manaPips(fam.colors)),
        h('span', { class: 'fam-stats' }, t('tier.stats', { pct: fmtPct(fam.share), lists: fmtInt(fam.lists) })),
        vars.length > 1 ? h('span', { class: 'fam-vars' }, shownVars.map((v, i) => `${labels[i]} ${fmtPct(v.apps / total)}`).join(' · ')
          + (vars.length > 3 ? ` · ${t('tier.moreVariants', { n: vars.length - 3 })}` : '')) : null,
        h('span', { class: 'fam-price' }, s.list !== null ? t('tier.typicalPrice', { v: fmtEurAbout(s.list) }) : ctx.prices() ? '' : t('tier.pricePending')),
        compEl)));
  }

  function famRow(fam: Family): HTMLElement {
    return h('li', { class: 'fam-row' }, h('a', { href: `#mazzi/${fam.id}` },
      h('span', { class: 'fam-name' }, fam.name), manaPips(fam.colors),
      h('span', { class: 'muted' }, t('tier.stats', { pct: fmtPct(fam.share), lists: fmtInt(fam.lists) }))));
  }

  function render(): void {
    const d = ctx.data();
    const L = ctx.loaded();
    if (!d || !L) return;
    const all = families(L.file, L.decks);
    renderControls(all);
    const scores = new Map(all.map((f) => [f.id, score(f)]));
    const shown = visibleFamilies(all, F, (f) => scores.get(f.id)!);
    // riepilogo: tutti gli archetipi del periodo (l'insieme del titolo); la nota dice se i filtri ne mostrano meno
    const apps = L.decks.reduce((a, x) => a + x.apps.length, 0);
    $('#tVerdict').textContent = t('tier.verdict', { n: all.length });
    const sub = [t('tier.sub', { date: fmtDate(L.file.anchor), apps: fmtInt(apps), tours: fmtInt(Object.keys(L.file.t).length) })];
    if (ctx.comp()) {
      const full = all.filter((f) => (scores.get(f.id)!.pct ?? 0) >= 1).length;
      sub.push(t('tier.subColl', { n: full }));
    }
    $('#tSub').textContent = sub.join(' ');
    renderNote(all.length, shown.length);

    const sections: HTMLElement[] = [];
    for (const tier of [1, 2, 3, 4]) {
      const fams = shown.filter((f) => f.tier === tier);
      if (!fams.length) continue;
      const head = h('h3', { class: 'tier-head' }, h('span', { class: `tier-badge t${tier}` }, tier === 4 ? t('tier.others') : t('tier.n', { n: tier })),
        h('span', { class: 'tier-count' }, t('tier.count', { n: fams.length })),
        // su mobile la frase sul tier è tolta: resta il link accanto al primo titolo
        sections.length ? null : h('a', { class: 'tier-what', href: '#informazioni', 'aria-label': t('tier.whatAria') }, t('tier.leadLink')));
      if (tier < 4) {
        sections.push(h('section', { class: `tier-sec t${tier}` }, head,
          h('ul', { class: 'fam-grid' }, ...fams.map((f) => famCard(d, f, scores.get(f.id)!)))));
      } else {
        const rows = showAllOthers ? fams : fams.slice(0, OTHERS_SHOWN);
        sections.push(h('section', { class: 'tier-sec t4' }, head,
          h('ul', { class: 'fam-rows' }, ...rows.map(famRow)),
          fams.length > rows.length ? h('button', { class: 'btn small', type: 'button', id: 'tOthersAll' }, t('tier.othersAll', { n: fams.length })) : null));
      }
    }
    // liste non classificate: niente tier, una riga in fondo (con i filtri di colore e prezzo non si mostra)
    const unclassified = L.decks.filter((x) => x.kind === 'x');
    if (unclassified.length && !F.colors.length && !F.tiers.length && F.maxPrice === null && !F.min) {
      const n = unclassified.reduce((a, x) => a + x.apps.length, 0);
      sections.push(h('p', { class: 'fam-unclassified' }, h('a', { href: '#mazzi/x' },
        t('tier.unclassified', { n: fmtInt(n), pct: fmtPct(n / (apps || 1)) }))));
    }
    if (!sections.length) sections.push(h('p', { class: 'nores' }, t('tier.none')));
    $('#tierSections').replaceChildren(...sections);
  }

  function renderNote(total: number, shown: number): void {
    const el = $('#tNote');
    const why: string[] = [];
    const lower = (x: string) => x.toLocaleLowerCase(getLang());
    if (F.colors.length) {
      why.push(F.colorMode === 'only'
        ? t('why.colorOnly', { v: F.colors.map((c) => lower(colorLabel(c))).join(t('why.and')) })
        : t('why.color', { v: F.colors.map((c) => lower(colorLabel(c))).join(t('why.or')) }));
    }
    if (F.tiers.length) why.push(F.tiers.map((n) => (n === 4 ? lower(t('tier.others')) : t('tier.n', { n }))).join(t('why.or')));
    if (F.maxPrice !== null) {
      why.push(ctx.owned()
        ? (F.maxPrice === 0 ? t('tier.whyDone') : t('tier.whyMissing', { v: fmtEur(F.maxPrice) }))
        : t('tier.whyList', { v: fmtEur(F.maxPrice) }));
    }
    if (F.min) why.push(F.min >= 1 ? t('decks.whyFull') : t('decks.whyMin', { p: fmtPct(F.min) }));
    el.hidden = !why.length;
    $('#tfCount').textContent = why.length ? ` (${why.length})` : '';
    if (el.hidden) return el.replaceChildren();
    el.replaceChildren(t('tier.filtered', { n: fmtInt(shown), total: fmtInt(total), why: why.join(', ') }), ' · ',
      h('button', { class: 'linkbtn', type: 'button', id: 'tClear' }, t('res.clearFilters')));
  }

  /* eventi */
  $('#tierFilters').addEventListener('submit', (e) => e.preventDefault());
  $('#tierFilters').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-tf]');
    if (!b) return;
    const v = b.dataset.v!;
    if (b.dataset.tf === 'color') F.colors = F.colors.includes(v as ColorKey) ? F.colors.filter((x) => x !== v) : [...F.colors, v as ColorKey];
    else F.tiers = F.tiers.includes(Number(v)) ? F.tiers.filter((x) => x !== Number(v)) : [...F.tiers, Number(v)];
    render();
  });
  $('#tierFilters').addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    if (el.name === 'tColorMode') F.colorMode = el.value === 'only' ? 'only' : 'any';
    else if (el.name === 'tSide') ctx.setSide(el.value === 'side');
    else if (el.id === 'tfPrice') F.maxPrice = el.value === '' ? null : Number(el.value) * 100;
    else if (el.id === 'tfMin') F.min = Number(el.value) || 0;
    else if (el.id === 'tfGoto') {
      if (el.value) location.hash = `#mazzi/${el.value}`;
      return;
    }
    render();
  });
  $('#dTier').addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    if (el.id === 'tOthersAll') {
      showAllOthers = true;
      render();
      document.querySelectorAll<HTMLElement>('.tier-sec.t4 .fam-row a')[OTHERS_SHOWN]?.focus();
    } else if (el.id === 'tClear') {
      Object.assign(F, emptyTierFilters());
      render();
    }
  });

  return { render };
}
