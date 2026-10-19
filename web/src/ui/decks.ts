// Pagina "Mazzi" (#mazzi): mazzi recenti, completamento con la collezione, decklist ed export.
// I dati si scaricano solo quando si apre la pagina: data/decks-61.json, e data/decks-365.json su richiesta.

import { fmtDate, fmtEur, fmtEurAbout, fmtInt, fmtPct, fmtResult, getLang, t, type Key } from '../i18n';
import type { Data } from '../lib/data';
import {
  archetypes, completion, deckText, listPrice, missingCost, missingText, readDecks, SECTIONS, sectionOf, sortDecks, validDecks, visibleDecks,
  type Completion, type Deck, type DeckFilters, type DecksFile, type Section,
} from '../lib/decks';
import { $, h } from '../lib/dom';
import { lsGet, lsSet } from '../lib/store';
import { cheapestPrice, type PricesFile } from '../lib/prices';
import { manaIcon, type ManaSymbol } from './mana';
import { familyArt, initTier, manaPips, PRICE_LIST, PRICE_MISSING } from './tierlist';

const PAGE = 10;
/** "Carica altri": 20 mazzi alla volta (ogni mazzo è un riquadro grande). */
const STEP = 20;
/** Quante carte mancanti si elencano sotto il mazzo (le altre sono segnate nella decklist). */
const MISSING_SHOWN = 8;
/** Completamento minimo: valori del menu. */
const MINS = [0, 0.5, 0.75, 0.9, 1];

export interface DecksDeps {
  data: () => Data | null;
  /** copie possedute di una carta (indice di cards.json); null senza collezione */
  owned: () => ((idx: number) => number) | null;
  prices: () => PricesFile | null;
  copy: (text: string, what: string) => void;
  save: (text: string, filename: string, what: string) => void;
}

interface Loaded {
  file: DecksFile;
  decks: Deck[];
  basics: Set<number>;
}

const cache = new Map<number, Promise<Loaded | null>>();

function load(days: number, d: Data): Promise<Loaded | null> {
  let p = cache.get(days);
  if (!p) {
    p = fetch(`data/decks-${days}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => (validDecks(j, d.cards.c.length) ? { file: j, decks: readDecks(j), basics: new Set(j.basics) } : null))
      .catch(() => null)
      .then((x) => {
        if (!x) cache.delete(days); // si riprova al prossimo uso
        return x;
      });
    cache.set(days, p);
  }
  return p;
}

/** Nome da mostrare: quello dell'archetipo, oppure "Non classificato". */
const deckName = (x: { name: string }) => x.name || t('decks.unclassified');

const colorNames = (colors: string) => [...colors].map((c) => t(`color.${c}` as Key).toLocaleLowerCase(getLang()));

/** Simboli di mana dei colori del mazzo (almeno 18 px), con il nome dei colori per chi usa un lettore di schermo. */
function pips(colors: string) {
  const list = (colors ? [...colors] : ['C']) as ManaSymbol[];
  return h('span', { class: 'pips big', role: 'img', 'aria-label': colors ? t('decks.colors', { v: colorNames(colors).join(', ') }) : t('decks.colorless') },
    ...list.map((c) => manaIcon(c)));
}

/** Mancanti dalla carta con più copie da trovare, poi per nome: lo stesso ordine nell'elenco e nell'export. */
const byNeed = (cards: Data['cards']['c'], missing: Completion['missing']) =>
  [...missing].sort((a, b) => b.n - a.n || cards[a.idx].n.localeCompare(cards[b.idx].n, 'en'));

const slug = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'deck';

export function initDecks(deps: DecksDeps): { show(): void; refresh(): void } {
  const S = {
    days: 61,
    side: lsGet('deckSide') !== 'main',
    // filtri che nascondono mazzi: mai salvati
    f: { arch: '', min: 0, fam: '' } as DeckFilters,
    /** prezzo massimo delle liste (centesimi): della lista senza collezione, del costo per completare con la collezione */
    maxPrice: null as number | null,
    /** vista: tier list (null) o pagina di una famiglia (id, "x" per le non classificate) */
    fam: null as string | null,
    tier61: null as Loaded | null,
    comp61: null as Map<number, Completion> | null,
    shown: PAGE,
    cur: null as Loaded | null,
    view: [] as Deck[],
    comp: null as Map<number, Completion> | null,
    token: 0,
    // caricamento in corso o fallito: un ridisegno (prezzi, lingua, collezione) non lo riavvia, si riprova con "Riprova"
    pending: false,
    failed: false,
  };
  const list = $('#deckList');
  const periodSel = $('#dPeriod') as HTMLSelectElement;
  const archSel = $('#dArch') as HTMLSelectElement;
  const minSel = $('#dMin') as HTMLSelectElement;
  const priceSel = $('#dPrice') as HTMLSelectElement;
  const priceOf = (idx: number) => cheapestPrice(deps.prices(), idx);

  const tier = initTier({
    data: deps.data,
    loaded: () => S.tier61,
    owned: deps.owned,
    prices: deps.prices,
    comp: () => S.comp61,
    side: () => S.side,
    setSide: (v) => {
      S.side = v;
      lsSet('deckSide', v ? 'side' : 'main');
      computeTier();
    },
  });

  /** Completamento delle liste dei 61 giorni (tier list), con main/side scelti. */
  function computeTier(): void {
    const owned = deps.owned();
    const L = S.tier61;
    S.comp61 = owned && L ? new Map(L.decks.map((x) => [x.i, completion(x, owned, S.side, L.basics)])) : null;
  }

  /** Vista dall'indirizzo: #mazzi = tier list, #mazzi/<famiglia> = pagina dell'archetipo. */
  function routeFam(): string | null {
    const m = /^#mazzi\/([a-z0-9]+)$/i.exec(location.hash);
    return m ? m[1] : null;
  }

  function status(msg: string, retry = false): void {
    const el = $('#dStatus');
    el.hidden = !msg;
    el.replaceChildren(msg, retry ? ' ' : '', retry ? h('button', { class: 'linkbtn', type: 'button', id: 'dRetry' }, t('decks.retry')) : '');
  }

  async function show(): Promise<void> {
    const d = deps.data();
    if (!d) return;
    const my = ++S.token;
    const fam = routeFam();
    if (fam !== S.fam) {
      // nuova vista: i filtri della pagina dell'archetipo ripartono azzerati
      S.fam = fam;
      S.f = { arch: '', min: 0, fam: fam || '' };
      S.maxPrice = null;
      S.shown = PAGE;
    }
    $('#dTier').hidden = true;
    $('#dArchHead').hidden = true;
    $('#deckFilters').hidden = fam === null;
    if (fam === null) {
      // tier list: sempre sui 61 giorni
      $('#dResults').hidden = true;
      if (!S.tier61) {
        status(t('decks.loading'));
        S.pending = true;
        S.failed = false;
        const x = await load(61, d);
        if (my !== S.token) return;
        S.pending = false;
        if (!x) {
          S.failed = true;
          status(t('decks.error'), true);
          return;
        }
        S.tier61 = x;
      }
      status('');
      computeTier();
      $('#dNoColl').hidden = !!deps.owned();
      $('#dTier').hidden = false;
      tier.render();
      return;
    }
    renderControls();
    // l'intestazione (tier, quota, lista tipica) viene sempre dai 61 giorni, come la tier list
    if (!S.tier61) {
      const x = await load(61, d);
      if (my !== S.token) return;
      if (x) S.tier61 = x;
    }
    if (!S.cur || S.cur.file.days !== S.days) {
      status(t(S.days === 61 ? 'decks.loading' : 'decks.loadingYear'));
      $('#dResults').hidden = true;
      S.pending = true;
      S.failed = false;
      const x = await load(S.days, d);
      if (my !== S.token) return;
      S.pending = false;
      if (!x) {
        S.failed = true;
        status(t('decks.error'), true);
        return;
      }
      S.cur = x;
    }
    status('');
    $('#dResults').hidden = false;
    compute();
    renderHead();
    render();
  }

  /** Intestazione della pagina dell'archetipo: illustrazione con l'artista, nome, colori, tier, quota, prezzo. */
  function renderHead(): void {
    const d = deps.data()!;
    const cur = S.cur!;
    const el = $('#dArchHead');
    el.hidden = false;
    const back = h('a', { class: 'arch-back', href: '#mazzi' }, t('arch.back'));
    if (S.fam === 'x') {
      el.replaceChildren(back, h('div', { class: 'arch-head' }, h('div', { class: 'arch-info' },
        h('h3', { class: 'arch-name' }, t('arch.unclassified')), h('p', { class: 'note' }, t('arch.unclassifiedLead')))));
      return;
    }
    const src = S.tier61?.file.f?.[S.fam!] ? S.tier61 : cur;
    const meta = src.file.f?.[S.fam!];
    if (!meta) {
      el.replaceChildren(back, h('p', { class: 'note' }, t('arch.notFound')));
      return;
    }
    const [name, tierN, share, symbol, typicalIdx] = meta;
    const decks = src.decks.filter((x) => x.fam === S.fam);
    const apps = new Map<string, number>();
    for (const x of decks) apps.set(x.colors, (apps.get(x.colors) || 0) + x.apps.length);
    const colors = [...apps.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const typical = src.decks.find((x) => x.i === typicalIdx);
    const pr = deps.prices();
    const price = pr && typical ? listPrice(typical, priceOf, src.basics, true).cents : null;
    el.replaceChildren(back, h('div', { class: 'arch-head' },
      symbol >= 0 ? familyArt(d, symbol, true) : null,
      h('div', { class: 'arch-info' },
        h('h3', { class: 'arch-name' }, h('span', null, name), manaPips(colors)),
        h('p', { class: 'arch-line' }, h('span', { class: `tier-badge t${tierN}` }, tierN === 4 ? t('tier.others') : t('tier.n', { n: tierN })), ' ',
          t('arch.line', { tier: '', pct: fmtPct(share / 10000), lists: fmtInt(decks.length) }).replace(/^ · /, '')),
        price !== null ? h('p', { class: 'arch-price' }, t('arch.typical', { v: fmtEurAbout(price) })) : null,
        h('p', { class: 'note' }, t('tier.lead'), ' ', h('a', { href: '#informazioni' }, t('tier.leadLink'))),
        h('p', { class: 'artcredit' }, t('tier.copyright')))));
  }

  /** Completamento di ogni mazzo (con la collezione). */
  function compute(): void {
    const owned = deps.owned();
    const cur = S.cur!;
    S.comp = owned ? new Map(cur.decks.map((x) => [x.i, completion(x, owned, S.side, cur.basics)])) : null;
  }

  function renderControls(): void {
    const coll = !!deps.owned();
    periodSel.value = String(S.days);
    $('#dMinWrap').hidden = !coll;
    $('#dSideWrap').hidden = !coll;
    $('#dNoColl').hidden = coll;
    minSel.replaceChildren(...MINS.map((m) => h('option', { value: String(m), selected: m === S.f.min },
      m === 0 ? t('decks.minAny') : m === 1 ? t('decks.minFull') : t('decks.minPct', { p: fmtPct(m) }))));
    for (const r of document.querySelectorAll<HTMLInputElement>('input[name="dSide"]')) r.checked = (r.value === 'side') === S.side;
  }

  /** Varianti della famiglia (o colori delle liste non classificate); nascosto se c'è una sola variante. */
  function renderArchetypes(): void {
    const own = S.cur!.decks.filter((x) => (S.fam === 'x' ? x.kind === 'x' : x.fam === S.fam));
    const arch = archetypes(own);
    if (S.f.arch && !arch.some((a) => a.id === S.f.arch)) S.f.arch = '';
    const x = S.fam === 'x';
    $('#dArchLabel').textContent = x ? t('decks.colorsLabel') : t('decks.variant');
    $('#dArchWrap').hidden = arch.length < 2;
    archSel.replaceChildren(h('option', { value: '' }, t(x ? 'decks.colorsAll' : 'decks.variantAll', { n: fmtInt(arch.length) })),
      ...arch.map((a) => h('option', { value: a.id, selected: a.id === S.f.arch },
        t('decks.archOption', { name: a.kind === 'x' ? (a.colors ? colorNames(a.colors).join(', ') : t('decks.colorless')) : a.name, n: fmtInt(a.lists) }))));
    archSel.value = S.f.arch;
  }

  /** Prezzo filtrato di una lista: senza collezione il prezzo della lista, con la collezione il costo per completarla. */
  function priceFor(x: Deck): number | null {
    if (!deps.prices()) return null;
    const comp = S.comp?.get(x.i);
    return comp ? missingCost(comp, priceOf) : listPrice(x, priceOf, S.cur!.basics, S.side).cents;
  }

  function renderPriceSel(): void {
    const coll = !!deps.owned();
    const pr = !!deps.prices();
    $('#dPriceLabel').textContent = coll ? t('tier.priceMissingOne') : t('tier.priceListOne');
    const steps = coll ? PRICE_MISSING : PRICE_LIST;
    priceSel.replaceChildren(h('option', { value: '' }, pr ? t('tier.priceAny') : t('tier.pricePending')),
      ...steps.map((e) => h('option', { value: String(e) }, coll && e === 0 ? t('tier.priceDone') : t('tier.priceUpTo', { v: fmtEur(e * 100) }))));
    priceSel.disabled = !pr;
    priceSel.value = S.maxPrice === null ? '' : String(S.maxPrice / 100);
  }

  function render(): void {
    const cur = S.cur!;
    const all = cur.decks;
    renderArchetypes();
    renderControls();
    renderPriceSel();
    const comp = S.comp;
    // riepilogo: tutte le liste della famiglia nel periodo (l'insieme del titolo); la nota dice se i filtri ne mostrano meno
    const famDecks = visibleDecks(all, { arch: '', min: 0, fam: S.f.fam }, null);
    const max = S.maxPrice;
    S.view = sortDecks(visibleDecks(all, S.f, comp).filter((x) => {
      if (max === null) return true;
      if (max === 0 && comp) return comp.get(x.i)!.pct >= 1;
      const p = priceFor(x);
      return p !== null && p <= max;
    }), comp);
    const apps = famDecks.reduce((a, x) => a + x.apps.length, 0);
    const tours = new Set(famDecks.flatMap((x) => x.apps.map((ap) => ap.tour?.[0] + (ap.tour?.[1] || '')))).size;
    $('#dVerdict').textContent = t('decks.verdict', { n: famDecks.length });
    const sub = [t(S.days === 61 ? 'decks.sub61' : 'decks.sub365', { date: fmtDate(cur.file.anchor), apps: fmtInt(apps), tours: fmtInt(tours) })];
    if (comp) {
      const full = famDecks.filter((x) => comp.get(x.i)!.pct >= 1).length;
      const most = famDecks.filter((x) => comp.get(x.i)!.pct >= 0.75).length;
      sub.push(t('decks.subColl', { full: t('decks.fullN', { n: full }), most: fmtInt(most) }));
    }
    sub.push(t(comp ? 'decks.sortComp' : 'decks.sortLast'));
    $('#dSub').textContent = sub.join(' ');
    renderNote(famDecks.length);
    renderList();
  }

  function renderNote(total: number): void {
    const el = $('#dNote');
    const why: string[] = [];
    if (S.f.arch) {
      const a = archetypes(S.cur!.decks).find((x) => x.id === S.f.arch);
      why.push(t('decks.whyVariant', { v: a ? (a.kind === 'x' ? colorNames(a.colors).join(', ') : a.name) : S.f.arch }));
    }
    if (S.comp && S.f.min) why.push(S.f.min >= 1 ? t('decks.whyFull') : t('decks.whyMin', { p: fmtPct(S.f.min) }));
    if (S.maxPrice !== null) {
      why.push(S.comp ? (S.maxPrice === 0 ? t('tier.whyDone') : t('decks.whyMissingPrice', { v: fmtEur(S.maxPrice) }))
        : t('decks.whyPrice', { v: fmtEur(S.maxPrice) }));
    }
    el.hidden = S.view.length === total && !why.length;
    if (el.hidden) return el.replaceChildren();
    el.replaceChildren(t('decks.filtered', { n: fmtInt(S.view.length), why: why.join(', ') }), ' · ',
      h('button', { class: 'linkbtn', type: 'button', id: 'dClear' }, t('res.clearFilters')));
  }

  function renderList(focusFrom = -1): void {
    const rows = S.view.slice(0, S.shown);
    $('#dMore').hidden = S.view.length <= rows.length;
    const left = S.view.length - rows.length;
    $('#dMore').textContent = left > STEP ? t('decks.moreN', { n: STEP, left: fmtInt(left) })
      : left === 1 ? t('decks.moreOne') : t('decks.moreLast', { n: left });
    const count = $('#dShown');
    count.hidden = !rows.length;
    count.textContent = t('decks.shown', { n: fmtInt(rows.length), total: fmtInt(S.view.length) });
    if (!rows.length) {
      list.replaceChildren(h('li', { class: 'nores' }, t('decks.none')));
      return;
    }
    // "Carica altri": si aggiungono solo i mazzi nuovi, senza ridisegnare quelli già mostrati
    if (focusFrom > 0 && list.querySelectorAll('#deckList > li.deck').length === focusFrom) list.append(...rows.slice(focusFrom).map(deckItem));
    else list.replaceChildren(...rows.map(deckItem));
    if (focusFrom >= 0) list.querySelectorAll<HTMLElement>('.dk-name')[focusFrom]?.focus();
  }

  /**
   * Ridisegna senza perdere il punto in cui si è (per esempio all'arrivo dei prezzi): le decklist aperte e il focus,
   * ritrovato per mazzo e per elemento dentro il mazzo.
   */
  function keepPlace(draw: () => void): void {
    const key = (li: Element) => (li as HTMLElement).dataset.key || '';
    const open = new Set([...list.querySelectorAll<HTMLDetailsElement>('details[open]')]
      .map((dt) => key(dt.closest('#deckList > li')!) + '/' + [...dt.closest('#deckList > li')!.querySelectorAll('details')].indexOf(dt)));
    const active = document.activeElement as HTMLElement | null;
    const li = active && list.contains(active) ? active.closest<HTMLElement>('#deckList > li') : null;
    const cls = active?.classList[0];
    const pos = li && cls ? [...li.querySelectorAll(`.${cls}`)].indexOf(active!) : -1;
    draw();
    for (const item of list.children) {
      item.querySelectorAll('details').forEach((dt, k) => { if (open.has(key(item) + '/' + k)) dt.open = true; });
    }
    if (li && cls && pos >= 0) {
      const again = [...list.children].find((x) => key(x) === key(li));
      again?.querySelectorAll<HTMLElement>(`.${cls}`)[pos]?.focus({ preventScroll: true });
    }
  }

  function deckItem(x: Deck): HTMLElement {
    const d = deps.data()!;
    const cards = d.cards.c;
    const comp = S.comp?.get(x.i) || null;
    const pr = deps.prices();
    const name = deckName(x);
    const best = x.best;
    const tour = best.tour;
    const res = fmtResult(best.result);
    const head = h('div', { class: 'dk-head' },
      h('h4', { class: 'dk-name', tabindex: '-1' }, pips(x.colors), h('span', null, name)),
      h('span', { class: 'dk-times' }, t('decks.times', { n: x.apps.length })));
    const where = tour
      ? h('p', { class: 'dk-best' }, h('span', { class: 'dk-lbl' }, t('decks.best')), ' ',
        res ? h('b', null, res) : null, res ? ' · ' : '',
        h('a', { href: tour[2], target: '_blank', rel: 'noopener noreferrer' }, tour[1]),
        ` · ${t(tour[3] === 'm' ? 'decks.mtgo' : 'decks.paper')} · ${fmtDate(tour[0])}`,
        x.apps.length > 1 && x.last !== tour[0] ? h('span', { class: 'dk-last' }, ` · ${t('decks.last', { date: fmtDate(x.last) })}`) : null)
      : null;
    let compEl: HTMLElement | null = null;
    let missEl: HTMLElement | null = null;
    if (comp) {
      const bar = h('span', { class: 'dk-fill' });
      bar.style.width = `${Math.round(comp.pct * 1000) / 10}%`;
      compEl = h('div', { class: 'dk-comp' + (comp.pct >= 1 ? ' full' : '') },
        h('span', { class: 'dk-bar', 'aria-hidden': 'true' }, bar),
        h('span', { class: 'dk-pct' }, fmtPct(comp.pct)),
        h('span', { class: 'dk-cnt' }, t('decks.have', { have: fmtInt(comp.have), need: fmtInt(comp.need) })));
      if (comp.missing.length) {
        const sorted = byNeed(cards, comp.missing);
        const copies = comp.missing.reduce((a, m) => a + m.n, 0);
        let cost = 0;
        let unpriced = 0;
        for (const m of comp.missing) {
          const c = cheapestPrice(pr, m.idx);
          if (c) cost += c * m.n;
          else unpriced++;
        }
        const total = pr
          ? ` · ${t('decks.cost', { v: fmtEur(cost) })}${unpriced ? ` (${t('price.unpriced', { n: fmtInt(unpriced) })})` : ''}`
          : '';
        const shown = sorted.slice(0, MISSING_SHOWN);
        missEl = h('div', { class: 'dk-missing' },
          h('p', { class: 'dk-mhead' }, h('b', null, t('decks.missing', { n: copies })), total, ' ',
            h('button', { class: 'linkbtn', type: 'button', dataset: { dcopy: 'missing', deck: String(x.i) } }, t('decks.copyMissing'))),
          h('ul', { class: 'dk-mlist' }, ...shown.map((m) => {
            const c = cheapestPrice(pr, m.idx);
            return h('li', null, h('span', { class: 'dk-q' }, String(m.n)), ' ',
              h('button', { class: 'cardbtn dk-card', type: 'button', dataset: { idx: String(m.idx) }, 'aria-haspopup': 'dialog', 'aria-label': t('card.open', { name: cards[m.idx].n }) }, cards[m.idx].n),
              pr ? h('span', { class: 'dk-price' }, c ? fmtEur(c * m.n) : '—') : null);
          })),
          sorted.length > shown.length ? h('p', { class: 'note' }, t('decks.moreMissing', { n: sorted.length - shown.length })) : null);
      } else {
        missEl = h('p', { class: 'dk-done' }, t('decks.complete'));
      }
    }
    return h('li', { class: 'deck', dataset: { key: String(x.i) } }, h('article', { class: 'dk', 'aria-label': name },
      head, compEl, where, missEl, decklist(x, comp !== null)));
  }

  /** Decklist per tipo, con le carte possedute segnate e le copie mancanti in evidenza (copie assegnate prima al main). */
  function decklist(x: Deck, coll: boolean): HTMLElement {
    const d = deps.data()!;
    const cards = d.cards.c;
    const owned = deps.owned();
    const basics = S.cur!.basics;
    const left = new Map<number, number>();
    const avail = (idx: number) => (basics.has(idx) ? Infinity : left.has(idx) ? left.get(idx)! : owned ? owned(idx) : 0);
    const line = ([idx, n]: [number, number]) => {
      const a = avail(idx);
      const have = Math.min(a, n);
      if (!basics.has(idx)) left.set(idx, a - have);
      const miss = n - have;
      const cls = !coll ? '' : basics.has(idx) ? 'basic' : miss === 0 ? 'have' : have > 0 ? 'part' : 'miss';
      return h('li', { class: cls },
        h('span', { class: 'dk-q' }, String(n)), ' ',
        h('button', { class: 'cardbtn dk-card', type: 'button', dataset: { idx: String(idx) }, 'aria-haspopup': 'dialog', 'aria-label': t('card.open', { name: cards[idx].n }) }, cards[idx].n),
        coll && cls === 'have' ? h('span', { class: 'dk-ok' }, h('span', { 'aria-hidden': 'true' }, '✓'), h('span', { class: 'sr' }, t('decks.owned'))) : null,
        coll && miss > 0 ? h('span', { class: 'dk-miss' }, t('decks.missCopies', { n: miss })) : null);
    };
    const groups = new Map<Section, [number, number][]>();
    for (const p of x.main) {
      const s = sectionOf(cards[p[0]]);
      groups.set(s, [...(groups.get(s) || []), p]);
    }
    const count = (ps: [number, number][]) => ps.reduce((a, p) => a + p[1], 0);
    const blocks = SECTIONS.filter((s) => groups.has(s)).map((s) => h('div', { class: 'dk-sec' },
      h('h5', null, `${t(`decks.sec.${s}` as Key)} (${count(groups.get(s)!)})`),
      h('ul', null, ...groups.get(s)!.map(line))));
    if (x.side.length) {
      blocks.push(h('div', { class: 'dk-sec dk-side' }, h('h5', null, `${t('decks.sideboard')} (${count(x.side)})`),
        h('ul', null, ...x.side.map(line))));
    }
    return h('details', { class: 'dk-list' },
      h('summary', null, t('decks.decklist'), h('span', { class: 'muted' }, ` · ${t('decks.sizes', { main: count(x.main), side: count(x.side) })}`)),
      h('div', { class: 'dk-cols' }, ...blocks),
      h('div', { class: 'dk-export' },
        h('button', { class: 'btn small', type: 'button', dataset: { dcopy: 'deck', deck: String(x.i) } }, t('decks.copyDeck')),
        h('button', { class: 'btn small', type: 'button', dataset: { dsave: 'deck', deck: String(x.i) } }, t('decks.saveDeck')),
        coll && S.comp?.get(x.i)?.missing.length
          ? h('button', { class: 'btn small', type: 'button', dataset: { dsave: 'missing', deck: String(x.i) } }, t('decks.saveMissing')) : null),
      h('p', { class: 'note' }, t('decks.exportNote')));
  }

  function exportText(kind: string, i: number): { text: string; what: string; file: string } | null {
    const d = deps.data();
    const x = S.cur?.decks.find((y) => y.i === i);
    if (!d || !x) return null;
    const name = slug(deckName(x));
    if (kind === 'deck') return { text: deckText(d.cards.c, x), what: t('decks.labelDeck'), file: t('decks.fileDeck', { name }) };
    const comp = S.comp?.get(i);
    return { text: comp ? missingText(d.cards.c, byNeed(d.cards.c, comp.missing)) : '', what: t('decks.labelMissing'), file: t('decks.fileMissing', { name }) };
  }

  /* eventi */
  periodSel.addEventListener('change', () => {
    S.days = Number(periodSel.value) === 365 ? 365 : 61;
    S.shown = PAGE;
    void show();
  });
  archSel.addEventListener('change', () => {
    S.f.arch = archSel.value;
    S.shown = PAGE;
    if (S.cur) render();
  });
  minSel.addEventListener('change', () => {
    S.f.min = Number(minSel.value) || 0;
    S.shown = PAGE;
    if (S.cur) render();
  });
  priceSel.addEventListener('change', () => {
    S.maxPrice = priceSel.value === '' ? null : Number(priceSel.value) * 100;
    S.shown = PAGE;
    if (S.cur) render();
  });
  $('#dSideWrap').addEventListener('change', (e) => {
    S.side = (e.target as HTMLInputElement).value === 'side';
    lsSet('deckSide', S.side ? 'side' : 'main');
    S.shown = PAGE;
    if (S.cur) {
      compute();
      render();
    }
  });
  $('#deckFilters').addEventListener('submit', (e) => e.preventDefault());
  $('#dMore').addEventListener('click', () => {
    const first = S.shown;
    S.shown += STEP;
    renderList(first);
  });
  $('#viewDecks').addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    if (el.id === 'dRetry') return void show();
    if (el.id === 'dClear') {
      S.f = { arch: '', min: 0, fam: S.f.fam };
      S.maxPrice = null;
      S.shown = PAGE;
      return render();
    }
    const b = el.closest<HTMLElement>('[data-dcopy], [data-dsave]');
    if (!b) return;
    const x = exportText(b.dataset.dcopy || b.dataset.dsave!, Number(b.dataset.deck));
    if (!x) return;
    if (b.dataset.dcopy) deps.copy(x.text, x.what);
    else deps.save(x.text, x.file, x.what);
  });

  return {
    show: () => void show(),
    /** collezione, lingua o prezzi cambiati: ridisegna senza tornare alle prime 10 */
    refresh: () => {
      if ($('#viewDecks').hidden) return;
      if (S.fam === null) {
        if (!S.tier61) {
          if (!S.pending && !S.failed) void show();
          return;
        }
        computeTier();
        $('#dNoColl').hidden = !!deps.owned();
        tier.render();
        return;
      }
      if (!S.cur || S.cur.file.days !== S.days) {
        if (!S.pending && !S.failed) void show();
        return;
      }
      compute();
      renderHead();
      keepPlace(render);
    },
  };
}
