// Controllo rapido di una carta: campo con suggerimenti (schema ARIA "combobox") e risultato immediato.
// Pensato per smistare il bulk a mano, anche da telefono: tocca, scrivi poche lettere, scegli.

import { getLang, t, type Key } from '../i18n';
import { deckShare, typicalCopies, type Opts } from '../lib/compare';
import { imageUrl, type Data } from '../lib/data';
import { track } from '../lib/analytics';
import { h } from '../lib/dom';
import { fmtDate, fmtInt, fmtPct, fmtPrint, lastSeen } from '../lib/format';
import { loadItalian } from '../lib/italian';
import { buildNameIndex, exactEntry, ownedFor, suggest, type CollectionIndex, type NameEntry, type Owned } from '../lib/quick';

export interface QuickCtx {
  data(): Data | null;
  opts(): Opts;
  /** null se non c'è una collezione caricata (con almeno un gruppo incluso) */
  collection(): CollectionIndex | null;
  openArtworks(anchor: HTMLElement, idx: number, owned: Owned | null): void;
}

const LIMIT = 8;

export function initQuick(ctx: QuickCtx): { refresh(): void } {
  const input = document.getElementById('quickInput') as HTMLInputElement;
  const list = document.getElementById('quickList') as HTMLUListElement;
  const result = document.getElementById('quickResult') as HTMLElement;
  let entries: NameEntry[] = [];
  let builtFor: Data | null = null;
  let allLoaded = false;
  let loading: Promise<void> | null = null;
  let items: NameEntry[] = [];
  let active = -1;
  let current: NameEntry | null = null;

  const ensureIndex = () => {
    const d = ctx.data();
    if (d && builtFor !== d) {
      entries = buildNameIndex(d);
      builtFor = d;
    }
  };

  // Tutti i nomi (anche mai giocati) e i nomi italiani: scaricati solo al primo uso del campo.
  const loadAll = () => {
    if (allLoaded || loading) return loading;
    const d0 = ctx.data();
    loading = Promise.all([
      fetch('data/cardnames.json').then((r) => (r.ok ? r.json() : [])).catch(() => []),
      d0 ? loadItalian(d0.cards.c.length, true) : Promise.resolve(null),
    ])
      .then(([all, it]: [[string, string][], Awaited<ReturnType<typeof loadItalian>>]) => {
        const d = ctx.data();
        if (d && all.length) {
          entries = buildNameIndex(d, all, it);
          builtFor = d;
          allLoaded = true;
          // aggiorna i suggerimenti solo se sono ancora aperti: dopo una scelta (Invio, clic) l'elenco non si riapre
          if (document.activeElement === input && input.value.trim() && !list.hidden) update();
        }
      })
      .catch(() => undefined)
      .finally(() => { loading = null; });
    return loading;
  };

  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  };

  const setActive = (i: number) => {
    active = i;
    list.querySelectorAll<HTMLElement>('[role="option"]').forEach((li, k) => li.setAttribute('aria-selected', String(k === i)));
    if (i >= 0) {
      input.setAttribute('aria-activedescendant', `qopt-${i}`);
      list.querySelector<HTMLElement>(`#qopt-${i}`)?.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  };

  const update = () => {
    ensureIndex();
    const q = input.value;
    items = suggest(entries, q, LIMIT);
    if (!q.trim()) {
      close();
      return;
    }
    list.replaceChildren(...(items.length
      ? items.map((e, i) => h('li', { id: `qopt-${i}`, role: 'option', 'aria-selected': 'false', dataset: { i: String(i) } },
        h('span', { class: 'qname' }, e.label), e.card < 0 ? h('span', { class: 'qtag' }, t('quick.tagNever')) : null))
      : [h('li', { class: 'qnone', role: 'presentation' }, t('quick.noResults'))]));
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(items.length ? 0 : -1);
    // nome esatto: risultato subito, senza dover scegliere
    const exact = exactEntry(entries, q);
    if (exact) show(exact, false);
  };

  const choose = (e: NameEntry) => {
    input.value = e.label;
    close();
    show(e, true);
  };

  const show = (e: NameEntry, final: boolean) => {
    current = e;
    track('controllo-rapido');
    render();
    if (final) result.scrollIntoView({ block: 'nearest' });
  };

  const render = () => {
    const d = ctx.data();
    const e = current;
    if (!d || !e) {
      result.replaceChildren();
      return;
    }
    const opts = ctx.opts();
    const coll = ctx.collection();
    const owned = coll ? ownedFor(coll, e) : null;
    const played = e.card >= 0 ? d.cards.c[e.card] : null;
    const legal = played ? played.l : e.legal;
    const info: (Node | null)[] = [];

    info.push(h('h3', { class: 'qtitle' }, e.name, ' ',
      h('span', { class: `badge q-${legal}` }, t(`quick.legal.${legal}` as Key))));
    // nome italiano sotto quello inglese: con l'interfaccia in italiano, o se la carta è stata cercata in italiano
    if (e.its.length && (getLang() === 'it' || e.it)) {
      info.push(h('p', { class: 'itname', lang: 'it' }, e.it ? [e.search, ...e.its.filter((x) => x !== e.search)].join(' · ') : e.its.join(' · ')));
    }

    let img: HTMLElement | null = null;
    if (played) {
      const prints = d.prints.p[e.card] || [];
      const ref = prints[played.r];
      const ownedId = owned?.prints.map((p) => p.row.i || (p.print >= 0 ? prints[p.print][0] : '')).find(Boolean);
      const id = ownedId || ref?.[0];
      const st = played.s[opts.win];
      const period = t(`periodDesc.${opts.win}` as Key);
      info.push(h('p', { class: 'qstat' }, st
        ? t('quick.played', { pct: fmtPct(deckShare(d, played, opts)), n: fmtInt(opts.side ? st[0] : st[1]), period })
          + t('sheet.typical', { n: typicalCopies(played, opts) })
        : t('quick.notInPeriod', { period })));
      const seen = h('ul', { class: 'seen' });
      for (const [ls, kind] of [[played.lm, 'm'], [played.lp, 'p']] as const) {
        const s = lastSeen(d, ls, kind);
        if (!s) continue;
        seen.appendChild(h('li', null, h('b', null, kind === 'm' ? t('sheet.lastMtgo') : t('sheet.lastPaper')),
          [fmtDate(s.date), s.result, s.copies].filter(Boolean).join(' · '), ' · ',
          s.uri ? h('a', { href: s.uri, target: '_blank', rel: 'noopener noreferrer' }, s.tournament) : s.tournament));
      }
      info.push(seen);
      const entry = played.e ? d.cards.sets[played.e] : null;
      if (entry && played.e) info.push(h('p', { class: 'note' }, t('quick.entry', { set: entry[0], year: entry[1].slice(0, 4) })));
      if (id) {
        img = h('button', { class: 'qimg', type: 'button', 'aria-label': t('quick.imageAlt', { name: e.name }) },
          h('img', { src: imageUrl(id, 'small'), alt: '', width: 146, height: 204, decoding: 'async',
            dataset: ref ? { fallback: imageUrl(ref[0], 'small') } : undefined }));
        img.addEventListener('click', () => ctx.openArtworks(img!, e.card, owned));
      }
    } else {
      info.push(h('p', { class: 'qstat qnever' }, t('quick.never')));
    }

    if (!coll) info.push(h('p', { class: 'note' }, t('quick.noCollection')));
    else if (owned && owned.total > 0) {
      info.push(h('p', { class: 'qowned' }, t('quick.owned', { n: owned.total })),
        h('p', { class: 'note' }, owned.prints.map((p) => `${fmtPrint(p.row)} ×${p.q}`).join(', ')
          + (owned.binders.length ? ` · ${owned.binders.map((b) => b[0]).join(', ')}` : '')));
    } else info.push(h('p', { class: 'qnotowned' }, t('quick.notOwned')));

    if (played && img) {
      const btn = h('button', { class: 'btn small', type: 'button' }, t('quick.artworks'));
      btn.addEventListener('click', () => ctx.openArtworks(btn, e.card, owned));
      info.push(btn);
    }
    result.replaceChildren(h('div', { class: 'qres' + (owned && owned.total > 0 ? ' is-owned' : '') }, img, h('div', { class: 'qinfo' }, ...info)));
  };

  // chiusura differita dopo il blur: annullata se il campo torna attivo prima che scatti
  let blurTimer: number | undefined;
  input.addEventListener('focus', () => {
    window.clearTimeout(blurTimer);
    void loadAll();
    // scrivere la carta successiva sostituisce subito quella precedente
    window.setTimeout(() => input.select(), 0);
  });
  input.addEventListener('input', () => {
    void loadAll();
    update();
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      if (list.hidden) update();
      if (!items.length) return;
      ev.preventDefault();
      const n = items.length;
      setActive(ev.key === 'ArrowDown' ? (active + 1) % n : (active - 1 + n) % n);
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      const pick = items[active >= 0 ? active : 0];
      if (pick && !list.hidden) choose(pick);
    } else if (ev.key === 'Escape') {
      if (!list.hidden) close();
      else {
        input.value = '';
        current = null;
        render();
      }
    }
  });
  list.addEventListener('mousedown', (ev) => ev.preventDefault()); // il campo resta attivo
  list.addEventListener('click', (ev) => {
    const li = (ev.target as HTMLElement).closest<HTMLElement>('[role="option"]');
    if (li) choose(items[Number(li.dataset.i)]);
  });
  input.addEventListener('blur', () => {
    blurTimer = window.setTimeout(() => {
      if (document.activeElement !== input) close();
    }, 120);
  });

  return { refresh: render };
}
