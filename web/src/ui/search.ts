// "Cerca una carta": un solo campo (inglese o italiano) al posto del controllo rapido e della ricerca dell'elenco.
// Mentre si scrive filtra l'elenco e suggerisce tutte le carte (anche mai giocate), con lo schema ARIA "combobox".
// Invio con un suggerimento scelto con le frecce, o con un nome esatto (anche italiano), apre la scheda della carta;
// Invio con un testo parziale chiude i suggerimenti e la tastiera e lascia l'elenco filtrato.

import { t } from '../i18n';
import type { Data } from '../lib/data';
import { h } from '../lib/dom';
import { loadItalian } from '../lib/italian';
import { buildNameIndex, exactEntry, suggest, type NameEntry } from '../lib/quick';

export interface SearchCtx {
  data(): Data | null;
  /** testo cambiato: filtra l'elenco */
  query(q: string): void;
  /** apre la scheda della carta (giocata o mai giocata) */
  open(anchor: HTMLElement, e: NameEntry): void;
  /** arrivati tutti i nomi: la nota "apri la scheda" può ora trovare anche le carte mai giocate */
  ready(): void;
}

export interface SearchApi {
  /** dati o lingua cambiati: indice e suggerimenti aggiornati, Invio in attesa ripreso */
  refresh(): void;
  /** la carta che il testo indica (nome esatto, altrimenti il primo suggerimento): per la nota "apri la scheda" */
  best(q: string): NameEntry | null;
  /** apre la scheda di una voce (dalla nota sotto l'elenco) */
  open(e: NameEntry): void;
}

const LIMIT = 8;

export function initSearch(ctx: SearchCtx): SearchApi {
  const input = document.getElementById('search') as HTMLInputElement;
  const list = document.getElementById('searchList') as HTMLUListElement;
  let entries: NameEntry[] = [];
  let builtFor: Data | null = null;
  let allLoaded = false;
  let loading: Promise<void> | null = null;
  let allNames: Promise<[string, string][]> | null = null;
  let items: NameEntry[] = [];
  let active = -1; // nessun suggerimento evidenziato finché non si usano le frecce
  // Invio con un testo arrivato prima dei suggerimenti: vale solo se è un nome esatto, appena i nomi sono pronti
  let pending: string | null = null;

  const ensureIndex = () => {
    const d = ctx.data();
    if (d && builtFor !== d) {
      entries = buildNameIndex(d);
      builtFor = d;
    }
  };

  // tutti i nomi (anche mai giocati) e i nomi italiani: scaricati solo al primo uso del campo
  const loadAll = () => {
    if (allLoaded || loading) return loading;
    allNames ??= fetch('data/cardnames.json').then((r) => (r.ok ? r.json() : [])).catch(() => []);
    const d0 = ctx.data();
    if (!d0) return null;
    loading = Promise.all([allNames, loadItalian(d0.cards.c.length, true)])
      .then(([all, it]) => {
        const d = ctx.data();
        if (d && all.length) {
          entries = buildNameIndex(d, all, it);
          builtFor = d;
          allLoaded = true;
          ctx.ready();
          // suggerimenti aggiornati solo se l'elenco è aperto (dopo una scelta non si riapre)
          if (pending === null && document.activeElement === input && input.value.trim() && !list.hidden) update();
        } else allNames = null;
      })
      .catch(() => { allNames = null; })
      .finally(() => {
        loading = null;
        retryPending();
      });
    return loading;
  };

  const retryPending = () => {
    if (pending === null) return;
    if (input.value !== pending) {
      pending = null;
      return;
    }
    if (!ctx.data()) return;
    ensureIndex();
    const exact = exactEntry(entries, pending);
    if (exact) {
      pending = null;
      choose(exact);
    } else if (allLoaded || !allNames) {
      pending = null; // non è un nome esatto: resta l'elenco filtrato
    } else void loadAll();
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
      input.setAttribute('aria-activedescendant', `sopt-${i}`);
      list.querySelector<HTMLElement>(`#sopt-${i}`)?.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  };

  const same = (a: NameEntry, b: NameEntry) => a.name === b.name && a.search === b.search;

  const update = () => {
    ensureIndex();
    const q = input.value;
    // la voce scelta con le frecce resta scelta anche se i suggerimenti si aggiornano (per esempio quando arrivano
    // tutti i nomi): si ritrova per carta e nome cercato, non per posizione
    const was = active >= 0 ? items[active] : null;
    items = suggest(entries, q, LIMIT);
    if (!q.trim()) {
      close();
      return;
    }
    list.replaceChildren(...(items.length
      ? items.map((e, i) => h('li', { id: `sopt-${i}`, role: 'option', 'aria-selected': 'false', dataset: { i: String(i) } },
        h('span', { class: 'qname' }, e.label), e.card < 0 ? h('span', { class: 'qtag' }, t('quick.tagNever')) : null))
      : [h('li', { class: 'qnone', role: 'presentation' }, t('quick.noResults'))]));
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(was ? items.findIndex((e) => same(e, was)) : -1);
  };

  const choose = (e: NameEntry) => {
    // nell'elenco resta il nome cercato (inglese o italiano), che trova la carta
    input.value = e.it ? e.search : e.name;
    ctx.query(input.value);
    close();
    ctx.open(input, e);
  };

  // chiusura differita dopo il blur (per permettere il clic su un suggerimento), annullata se il campo torna attivo
  let blurTimer: number | undefined;
  input.addEventListener('focus', () => {
    window.clearTimeout(blurTimer);
    void loadAll();
  });
  input.addEventListener('input', () => {
    pending = null;
    void loadAll();
    ctx.query(input.value);
    update();
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      if (list.hidden) update();
      if (!items.length) return;
      ev.preventDefault();
      const n = items.length;
      setActive(ev.key === 'ArrowDown' ? (active + 1) % n : active <= 0 ? n - 1 : active - 1);
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      const q = input.value;
      if (!list.hidden && active >= 0 && items[active]) return choose(items[active]);
      ensureIndex();
      const exact = q.trim() ? exactEntry(entries, q) : null;
      if (exact) return choose(exact);
      if (q.trim() && (!ctx.data() || !allLoaded)) {
        // suggerimenti non ancora pronti: se è un nome esatto la scheda si apre appena arrivano
        pending = q;
        retryPending();
      }
      // testo parziale: resta l'elenco filtrato, senza suggerimenti né tastiera
      close();
      input.blur();
    } else if (ev.key === 'Escape') {
      // il campo è type="search": senza preventDefault il browser lo svuoterebbe già al primo Esc
      ev.preventDefault();
      pending = null;
      if (!list.hidden) close();
      else if (input.value) {
        input.value = '';
        ctx.query('');
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
  // su mobile i suggerimenti coprono l'elenco: toccare fuori o scorrere la pagina li chiude (e la tastiera)
  const outside = (ev: Event) => {
    if (list.hidden) return;
    const el = ev.target as Node;
    if (list.contains(el) || el === input) return;
    close();
    if (ev.type === 'touchmove') input.blur();
  };
  document.addEventListener('pointerdown', outside);
  document.addEventListener('touchmove', outside, { passive: true });

  return {
    refresh: () => {
      const stale = builtFor !== ctx.data();
      retryPending();
      if (stale && pending === null && document.activeElement === input && input.value.trim() && !list.hidden) {
        void loadAll();
        update();
      }
    },
    best: (q) => {
      if (!q.trim() || !ctx.data()) return null;
      ensureIndex();
      return exactEntry(entries, q) || suggest(entries, q, 1)[0] || null;
    },
    open: (e) => ctx.open(input, e),
  };
}
