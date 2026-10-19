// Pagina "Debutti" (#debutti): carte apparse per la prima volta nei tornei di recente, con l'analisi del metagame
// calcolata dalla pipeline (data/debuts.json, scaricato solo all'apertura della pagina). Ogni carta apre la scheda
// del sito (pulsanti .cardbtn, gestiti in main.ts come nel resto del sito).

import { fmtDate, fmtDateShort, fmtEur, fmtInt, fmtPct, fmtResult, getLang, t, type Key } from '../i18n';
import { imageUrl, type Data } from '../lib/data';
import {
  DEFAULT_PERIOD, KINDS, PERIODS, famName, inPeriod, isThisWeek, kindCounts, summary,
  validDebuts, visibleDebuts, watchList, weekShares, type DebutFilters, type DebutRow, type DebutsFile,
} from '../lib/debuts';
import { $, h, svg } from '../lib/dom';
import { cheapestPrice, type PricesFile } from '../lib/prices';

export interface DebutsDeps {
  data: () => Data | null;
  owned: () => ((idx: number) => number) | null;
  prices: () => PricesFile | null;
}

let pending: Promise<DebutsFile | null> | null = null;

function load(d: Data): Promise<DebutsFile | null> {
  if (!pending) {
    pending = fetch('data/debuts.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => (validDebuts(j, d.cards.c.length) ? j : null))
      .catch(() => null)
      .then((x) => {
        if (!x) pending = null; // si riprova con "Riprova"
        return x;
      });
  }
  return pending;
}

const pct = (x: number) => fmtPct(x);
const permille = (x: number) => fmtPct(x / 1000);

export function initDebuts(deps: DebutsDeps): { show(): void; refresh(): void } {
  // filtri che nascondono carte: mai salvati, si riparte da 90 giorni a ogni visita
  const F: DebutFilters = { days: DEFAULT_PERIOD, kind: '', ownedOnly: false };
  let file: DebutsFile | null = null;
  let failed = false;
  let loading = false;
  const periodSel = $('#debPeriod') as HTMLSelectElement;
  const kindSel = $('#debKind') as HTMLSelectElement;
  const ownedChk = $('#debOwned') as HTMLInputElement;
  const list = $('#debutsList');
  const status = $('#debStatus');

  periodSel.addEventListener('change', () => { F.days = Number(periodSel.value); render(); });
  kindSel.addEventListener('change', () => { F.kind = kindSel.value as DebutFilters['kind']; render(); });
  ownedChk.addEventListener('change', () => { F.ownedOnly = ownedChk.checked; render(); });
  // analisi costruita solo quando si apre
  list.addEventListener('toggle', (e) => {
    const det = e.target as HTMLDetailsElement;
    if (!det.matches?.('details.deb-an') || !det.open || det.dataset.built) return;
    const row = file?.c.find((r) => r.c === Number(det.dataset.card));
    if (row && file) {
      det.dataset.built = '1';
      det.append(analysis(file, row));
    }
  }, true);

  const cardBtn = (idx: number, cls = '') => {
    const d = deps.data()!;
    return h('button', { class: `cardbtn ${cls}`.trim(), type: 'button', dataset: { idx: String(idx) }, 'aria-haspopup': 'dialog', 'aria-label': t('card.open', { name: d.cards.c[idx].n }) },
      d.cards.c[idx].n);
  };

  function renderControls(f: DebutsFile): void {
    const counts = kindCounts(inPeriod(f, F.days));
    const all = inPeriod(f, F.days).length;
    periodSel.replaceChildren(...PERIODS.map((n) => h('option', { value: String(n) }, t('deb.periodN', { n, count: fmtInt(inPeriod(f, n).length) }))));
    periodSel.value = String(F.days);
    kindSel.replaceChildren(h('option', { value: '' }, t('deb.kindAll', { n: all })),
      ...KINDS.filter((k) => counts[k] > 0 || F.kind === k).map((k) => h('option', { value: k }, t('deb.kindN', { label: t(`deb.kind.${k}` as Key), n: counts[k] }))));
    kindSel.value = F.kind;
    $('#debOwnedWrap').hidden = !deps.owned();
    ownedChk.checked = F.ownedOnly;
  }

  function badge(r: DebutRow, anchor: string): (HTMLElement | null)[] {
    return [h('span', { class: `deb-badge k-${r.k}` }, t(`deb.badge.${r.k}` as Key)),
      isThisWeek(r, anchor) ? h('span', { class: 'deb-badge week' }, t('deb.week')) : null];
  }

  function card(f: DebutsFile, r: DebutRow): HTMLElement {
    const d = deps.data()!;
    const c = d.cards.c[r.c];
    const pr = d.prints.p[r.c]?.[c.r];
    const own = deps.owned();
    const price = cheapestPrice(deps.prices(), r.c);
    const n = own ? own(r.c) : 0;
    const img = pr
      ? h('button', { class: 'cardbtn deb-img', type: 'button', dataset: { idx: String(r.c) }, 'aria-haspopup': 'dialog', 'aria-label': t('card.open', { name: c.n }) },
        h('img', { src: imageUrl(pr[0], 'small'), srcset: `${imageUrl(pr[0], 'small')} 146w, ${imageUrl(pr[0], 'normal')} 488w`, sizes: '(max-width: 640px) 76px, 110px', alt: '', loading: 'lazy', decoding: 'async', width: 146, height: 204 }))
      : null;
    const own_ = own
      ? h('span', { class: 'deb-own' + (n > 0 ? ' yes' : '') }, n > 0 ? t('deb.owned', { n }) : t('deb.notOwned'))
      : null;
    return h('li', { class: 'deb-card', dataset: { card: String(r.c) } },
      img,
      h('div', { class: 'deb-body' },
        h('h3', { class: 'deb-name' }, cardBtn(r.c, 'deb-title')),
        h('p', { class: 'deb-stats' }, ...badge(r, f.anchor),
          t('deb.stats', { decks: fmtInt(r.d), players: fmtInt(r.p), date: fmtDateShort(r.u || r.f, Number(f.anchor.slice(0, 4))) }),
          own_ ? ' · ' : null, own_,
          price ? ' · ' : null, price ? h('span', { class: 'deb-price' }, t('deb.price', { price: fmtEur(price) })) : null),
        h('p', { class: 'deb-sum' }, summary(f, r, d.cards, getLang()))),
      // l'analisi occupa tutta la larghezza della scheda (sotto immagine e testo)
      h('details', { class: 'deb-an', dataset: { card: String(r.c) } }, h('summary', null, t('deb.analysis'))));
  }

  function bar(share: number): HTMLElement {
    const fill = h('span', { class: 'deb-fill' });
    fill.style.width = `${Math.max(1, Math.round(share * 1000) / 10)}%`;
    return h('span', { class: 'deb-bar', 'aria-hidden': 'true' }, fill);
  }

  function weeksChart(f: DebutsFile, r: DebutRow): HTMLElement {
    const shares = weekShares(r);
    const max = Math.max(...shares, 0.01);
    const W = 280, H = 72, n = shares.length, gap = 3;
    const bw = Math.max(4, (W - gap * (n - 1)) / n);
    const start = Date.parse(r.w0 + 'T00:00:00Z');
    const iso = (k: number) => new Date(start + k * 7 * 86400000).toISOString().slice(0, 10);
    const partial = f.lastWeekPartial === 1;
    const year = Number(f.anchor.slice(0, 4));
    const bars = shares.map((s, k) => {
      const bh = Math.max(1, Math.round((s / max) * (H - 4)));
      return svg('rect', { x: Math.round(k * (bw + gap)), y: H - bh, width: Math.round(bw), height: bh, rx: 1, class: k === n - 1 && partial ? 'partial' : '' });
    });
    const desc = shares.map((s, k) => t('deb.a.weekLabel', { date: fmtDate(iso(k)), pct: pct(s) }) + (k === n - 1 && partial ? ` (${t('deb.a.weekPartial')})` : '')).join('; ');
    const chart = svg('svg', { class: 'deb-weeks', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': t('deb.a.weeksAlt', { list: desc }) }, ...bars);
    return h('div', { class: 'deb-chart' }, chart,
      h('p', { class: 'deb-axis' }, h('span', null, fmtDateShort(r.w0, year)), h('span', null, t('deb.a.weekMax', { pct: pct(max) })),
        h('span', null, partial ? t('deb.a.weekPartialNote') : fmtDateShort(iso(n - 1), year))));
  }

  function analysis(f: DebutsFile, r: DebutRow): HTMLElement {
    const sec = (title: Key, ...body: (Node | null)[]) => h('section', { class: 'deb-sec' }, h('h4', null, t(title)), ...body);
    const archs = h('ul', { class: 'deb-rows' }, ...r.a.map(([fam, k, tot]) => h('li', null,
      h('span', { class: 'deb-lbl' }, famName(f, fam) || t('deb.unclassified')), bar(k / r.d),
      h('span', { class: 'deb-val' }, t(fam === 'x' ? 'deb.a.archRowX' : 'deb.a.archRow',
        { pct: pct(k / r.d), adopt: pct(tot ? k / tot : 0), arch: famName(f, fam) })))));
    const copies = h('p', null, [1, 2, 3, 4].map((n, i) => (r.q[i] ? `${t(n === 4 ? 'deb.a.copy4' : 'deb.a.copyN', { n })} ${pct(r.q[i] / r.d)}` : '')).filter(Boolean).join(' · '));
    const zone = h('p', null, t('deb.a.zoneRow', { main: pct(r.z[0] / r.d), side: pct(r.z[1] / r.d), both: pct(r.z[2] / r.d) }));
    const reps: HTMLElement[] = [];
    for (const [v, k, tot, , nd, rows] of r.r) {
      const variant = f.arch[v] || t('deb.unclassified');
      if (nd) reps.push(h('p', null, t('deb.a.newDeck', { variant })));
      else if (rows.length) {
        reps.push(h('div', { class: 'deb-rep' }, h('p', null, t('deb.a.repHead', { variant, adopt: pct(k / tot) })),
          h('ul', { class: 'deb-rows' }, ...rows.map(([c, a, b, w]) => h('li', null, cardBtn(c, 'deb-link'), ' ',
            h('span', { class: 'deb-val' }, [t('deb.a.repBefore', { pct: permille(a) }), t('deb.a.repWith', { pct: permille(b) }),
              w >= 0 ? t('deb.a.repWithout', { pct: permille(w) }) : ''].filter(Boolean).join(' · ')))))));
      }
    }
    const best = h('ul', { class: 'deb-rows deb-best' }, ...r.b.map(([tid, res]) => {
      const tour = f.t[String(tid)];
      if (!tour) return null;
      const place = fmtResult(res);
      return h('li', null, place ? h('b', null, place) : null, place ? ' · ' : '',
        h('a', { href: tour[2], target: '_blank', rel: 'noopener noreferrer' }, tour[1]),
        ` · ${t(tour[3] === 'm' ? 'decks.mtgo' : 'decks.paper')} · ${fmtDate(tour[0])}`);
    }));
    return h('div', { class: 'deb-anbody' },
      sec('deb.a.archs', archs),
      sec('deb.a.copies', zone, copies),
      reps.length ? sec('deb.a.replaces', ...reps, h('p', { class: 'note' }, t('deb.a.repNote'))) : null,
      r.co.length ? sec('deb.a.together', h('ul', { class: 'deb-with' }, ...r.co.map(([c, k]) => h('li', null, cardBtn(c, 'deb-link'), ` ${pct(k / r.d)}`)))) : null,
      sec('deb.a.weeks', weeksChart(f, r)),
      r.b.length ? sec('deb.a.best', best) : null);
  }

  function watch(f: DebutsFile): HTMLElement | null {
    const rows = watchList(f, F.days);
    if (!rows.length) return null;
    return h('details', { class: 'deb-watch', id: 'debWatch' },
      h('summary', null, t('deb.watch', { n: rows.length, decks: f.minDecks, players: f.minPlayers })),
      h('ul', { class: 'deb-rows' }, ...rows.map((o) => h('li', null, cardBtn(o.c, 'deb-link'), ' ',
        h('span', { class: 'deb-val' }, `${t(`deb.badge.${o.k}` as Key)} · `,
          o.why === 'decks' ? h('b', null, t('deb.watchDecks', { n: o.d })) : t('deb.watchDecks', { n: o.d }), ' · ',
          o.why === 'players' ? h('b', null, t('deb.watchPlayers', { n: o.p })) : t('deb.watchPlayers', { n: o.p }),
          ` ${t(o.why === 'decks' ? 'deb.watchNeedDecks' : 'deb.watchNeedPlayers', { n: o.why === 'decks' ? f.minDecks : f.minPlayers })}`)))));
  }

  function render(): void {
    const d = deps.data();
    if (!d) return;
    if (!file) {
      status.hidden = false;
      $('#debBody').hidden = true;
      if (failed) {
        status.replaceChildren(h('span', null, t('deb.error')), ' ', h('button', { class: 'btn small', type: 'button', id: 'debRetry', onclick: () => { failed = false; void start(); } }, t('decks.retry')));
      } else status.textContent = t('deb.loading');
      return;
    }
    status.hidden = true;
    $('#debBody').hidden = false;
    const f = file;
    renderControls(f);
    const rows = visibleDebuts(f, F, deps.owned());
    const total = inPeriod(f, F.days).length;
    $('#debCount').textContent = t('deb.count', { n: total, days: F.days });
    $('#debRule').textContent = t('deb.rule', { decks: f.minDecks, players: f.minPlayers, date: fmtDate(f.anchor) });
    // aperti e focus restano dopo un ridisegno (cambio di prezzi o di collezione)
    const open = new Set([...list.querySelectorAll<HTMLDetailsElement>('details.deb-an[open]')].map((x) => x.dataset.card));
    const watchOpen = ($('#debWatchBox').querySelector('details') as HTMLDetailsElement | null)?.open;
    list.replaceChildren(...rows.map((r) => card(f, r)));
    for (const det of list.querySelectorAll<HTMLDetailsElement>('details.deb-an')) if (open.has(det.dataset.card)) det.open = true;
    $('#debNone').hidden = rows.length > 0;
    const w = watch(f);
    $('#debWatchBox').replaceChildren(...(w ? [w] : []));
    if (w && watchOpen) (w as HTMLDetailsElement).open = true;
  }

  async function start(): Promise<void> {
    const d = deps.data();
    if (!d || loading) return;
    loading = true;
    render();
    file = await load(d);
    loading = false;
    failed = !file;
    render();
  }

  return {
    show() {
      if (file) render();
      else if (!loading) void start();
    },
    refresh() {
      if (file && !$('#viewDebuts').hidden) render();
      else if (!$('#viewDebuts').hidden && !file && !loading && !failed) void start();
    },
  };
}
