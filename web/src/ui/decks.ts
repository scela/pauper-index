// Pagina "Mazzi" (#mazzi): mazzi recenti, completamento con la collezione, decklist ed export.
// I dati si scaricano solo quando si apre la pagina: data/decks-61.json, e data/decks-365.json su richiesta.

import { fmtDate, fmtEur, fmtInt, fmtPct, fmtResult, getLang, t, type Key } from '../i18n';
import type { Data } from '../lib/data';
import {
  archetypes, completion, deckText, missingText, readDecks, SECTIONS, sectionOf, sortDecks, validDecks, visibleDecks,
  type Completion, type Deck, type DeckFilters, type DecksFile, type Section,
} from '../lib/decks';
import { $, h } from '../lib/dom';
import { lsGet, lsSet } from '../lib/store';
import { cheapestPrice, type PricesFile } from '../lib/prices';

const PAGE = 10;
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

/** Pallini dei colori (non simboli di mana), con il nome dei colori per chi usa un lettore di schermo. */
function pips(colors: string) {
  const list = colors ? [...colors] : ['C'];
  return h('span', { class: 'pips', role: 'img', 'aria-label': colors ? t('decks.colors', { v: colorNames(colors).join(', ') }) : t('decks.colorless') },
    ...list.map((c) => h('span', { class: `cdot c-${c}`, 'aria-hidden': 'true' })));
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
    f: { arch: '', min: 0 } as DeckFilters,
    shown: PAGE,
    cur: null as Loaded | null,
    view: [] as Deck[],
    comp: null as Map<number, Completion> | null,
    token: 0,
  };
  const list = $('#deckList');
  const periodSel = $('#dPeriod') as HTMLSelectElement;
  const archSel = $('#dArch') as HTMLSelectElement;
  const minSel = $('#dMin') as HTMLSelectElement;

  function status(msg: string, retry = false): void {
    const el = $('#dStatus');
    el.hidden = !msg;
    el.replaceChildren(msg, retry ? ' ' : '', retry ? h('button', { class: 'linkbtn', type: 'button', id: 'dRetry' }, t('decks.retry')) : '');
  }

  async function show(): Promise<void> {
    const d = deps.data();
    if (!d) return;
    const my = ++S.token;
    renderControls();
    if (!S.cur || S.cur.file.days !== S.days) {
      status(t(S.days === 61 ? 'decks.loading' : 'decks.loadingYear'));
      $('#dResults').hidden = true;
      const x = await load(S.days, d);
      if (my !== S.token) return;
      if (!x) {
        status(t('decks.error'), true);
        return;
      }
      S.cur = x;
    }
    status('');
    $('#dResults').hidden = false;
    compute();
    render();
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

  function renderArchetypes(): void {
    const arch = archetypes(S.cur!.decks);
    if (S.f.arch && !arch.some((a) => a.id === S.f.arch)) S.f.arch = '';
    archSel.replaceChildren(h('option', { value: '' }, t('decks.archAll', { n: fmtInt(arch.length) })),
      ...arch.map((a) => h('option', { value: a.id, selected: a.id === S.f.arch },
        t('decks.archOption', { name: a.kind === 'x' ? `${t('decks.unclassified')}${a.colors ? ` (${colorNames(a.colors).join(', ')})` : ''}` : a.name, n: fmtInt(a.lists) }))));
    archSel.value = S.f.arch;
  }

  function render(): void {
    const cur = S.cur!;
    const all = cur.decks;
    renderArchetypes();
    renderControls();
    const comp = S.comp;
    S.view = sortDecks(visibleDecks(all, S.f, comp), comp);
    // riepilogo: tutti i mazzi del periodo (l'insieme del titolo); la nota dice se i filtri ne mostrano meno
    const apps = all.reduce((a, x) => a + x.apps.length, 0);
    const tours = Object.keys(cur.file.t).length;
    $('#dVerdict').textContent = t('decks.verdict', { n: all.length });
    const sub = [t(S.days === 61 ? 'decks.sub61' : 'decks.sub365', { date: fmtDate(cur.file.anchor), apps: fmtInt(apps), tours: fmtInt(tours) })];
    if (comp) {
      const full = all.filter((x) => comp.get(x.i)!.pct >= 1).length;
      const most = all.filter((x) => comp.get(x.i)!.pct >= 0.75).length;
      sub.push(t('decks.subColl', { full: t('decks.fullN', { n: full }), most: fmtInt(most) }));
    }
    sub.push(t(comp ? 'decks.sortComp' : 'decks.sortLast'));
    $('#dSub').textContent = sub.join(' ');
    renderNote(all.length);
    renderList();
  }

  function renderNote(total: number): void {
    const el = $('#dNote');
    const why: string[] = [];
    if (S.f.arch) {
      const a = archetypes(S.cur!.decks).find((x) => x.id === S.f.arch);
      why.push(t('decks.whyArch', { v: a ? (a.kind === 'x' ? t('decks.unclassified') : a.name) : S.f.arch }));
    }
    if (S.comp && S.f.min) why.push(S.f.min >= 1 ? t('decks.whyFull') : t('decks.whyMin', { p: fmtPct(S.f.min) }));
    el.hidden = S.view.length === total && !why.length;
    if (el.hidden) return el.replaceChildren();
    el.replaceChildren(t('decks.filtered', { n: fmtInt(S.view.length), why: why.join(', ') }), ' · ',
      h('button', { class: 'linkbtn', type: 'button', id: 'dClear' }, t('res.clearFilters')));
  }

  function renderList(focusFrom = -1): void {
    const rows = S.view.slice(0, S.shown);
    $('#dMore').hidden = S.view.length <= rows.length;
    const count = $('#dShown');
    count.hidden = !rows.length;
    count.textContent = t('decks.shown', { n: fmtInt(rows.length), total: fmtInt(S.view.length) });
    if (!rows.length) {
      list.replaceChildren(h('li', { class: 'nores' }, t('decks.none')));
      return;
    }
    list.replaceChildren(...rows.map(deckItem));
    if (focusFrom >= 0) list.querySelectorAll<HTMLElement>('.dk-name')[focusFrom]?.focus();
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
    return h('li', { class: 'deck' }, h('article', { class: 'dk', 'aria-label': name },
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
    S.shown += PAGE;
    renderList(first);
  });
  $('#viewDecks').addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    if (el.id === 'dRetry') return void show();
    if (el.id === 'dClear') {
      S.f = { arch: '', min: 0 };
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
      if (!S.cur) return void show();
      compute();
      render();
    },
  };
}
