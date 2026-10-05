// Selettore "Espansione": campo con ricerca (schema ARIA combobox), gruppi dal più recente.

import { t } from '../i18n';
import { h } from '../lib/dom';
import { searchGroups, type SetGroup } from '../lib/sets';

export interface SetPickerCtx {
  /** Gruppi di set (carica data/sets.json al primo uso). */
  groups(): Promise<Map<string, SetGroup> | null>;
  showHidden(): boolean;
  enableHidden(): void;
  selected(): SetGroup | null;
  select(code: string | null): void;
}

export function initSetPicker(ctx: SetPickerCtx): { refresh(): void } {
  const wrap = document.getElementById('setWrap')!;
  const input = document.getElementById('setInput') as HTMLInputElement;
  const list = document.getElementById('setList') as HTMLUListElement;
  let items: (SetGroup | 'hidden')[] = [];
  let active = -1;

  const label = (g: SetGroup) => t('set.option', { name: g.name, code: g.code.toUpperCase(), year: g.date.slice(0, 4) });

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

  const open = async () => {
    const groups = await ctx.groups();
    if (!groups) return;
    const sel = ctx.selected();
    // con un'espansione già scelta e il campo invariato, mostra l'elenco intero
    const q = sel && input.value === label(sel) ? '' : input.value;
    items = searchGroups(groups, q, ctx.showHidden());
    // nessun risultato tra i set visibili: proponi di cercare anche tra quelli nascosti (l'opzione sotto il campo
    // sarebbe coperta dall'elenco aperto)
    const offerHidden = !items.length && !ctx.showHidden() && q.trim() !== '';
    if (offerHidden) items = ['hidden'];
    list.replaceChildren(...(items.length
      ? items.map((g, i) => h('li', { id: `sopt-${i}`, role: 'option', 'aria-selected': 'false', dataset: { i: String(i) } },
        ...(g === 'hidden'
          ? [h('span', { class: 'qnone-hint' }, t('set.noResults')), h('span', { class: 'qaction' }, t('set.searchHidden'))]
          : [h('span', { class: 'qname' }, g.name), h('span', { class: 'qtag' }, `${g.code.toUpperCase()} · ${g.date.slice(0, 4)}`)])))
      : [h('li', { class: 'qnone', role: 'presentation' }, t('set.noResults'))]));
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(items.length && q ? 0 : -1);
  };

  const choose = (g: SetGroup | 'hidden') => {
    if (g === 'hidden') {
      ctx.enableHidden();
      void open();
      return;
    }
    close();
    ctx.select(g.code);
    input.value = label(g);
  };

  // chiusura differita dopo il blur: annullata se il campo torna attivo prima che scatti
  let blurTimer: number | undefined;
  input.addEventListener('focus', () => {
    window.clearTimeout(blurTimer);
    wrap.classList.add('open');
    void open();
    window.setTimeout(() => input.select(), 0);
  });
  input.addEventListener('input', () => {
    if (!input.value.trim() && ctx.selected()) ctx.select(null); // campo svuotato (anche con la × del campo)
    void open();
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
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
      else if (ctx.selected()) {
        ctx.select(null);
        input.value = '';
      }
    }
  });
  list.addEventListener('mousedown', (ev) => ev.preventDefault());
  list.addEventListener('click', (ev) => {
    const li = (ev.target as HTMLElement).closest<HTMLElement>('[role="option"]');
    if (li) choose(items[Number(li.dataset.i)]);
  });
  input.addEventListener('blur', () => blurTimer = window.setTimeout(() => {
    if (document.activeElement === input) return;
    close();
    const sel = ctx.selected();
    input.value = sel ? label(sel) : '';
  }, 150));
  document.addEventListener('pointerdown', (ev) => {
    if (!wrap.contains(ev.target as Node) && !ctx.selected()) wrap.classList.remove('open');
  });

  return {
    refresh() {
      const sel = ctx.selected();
      wrap.classList.toggle('has-set', !!sel);
      if (document.activeElement !== input) input.value = sel ? label(sel) : '';
      if (!list.hidden) void open();
    },
  };
}
