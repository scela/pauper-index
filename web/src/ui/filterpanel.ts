// Pannello "Filtri" (colore, costo di mana, tipo, testo delle regole) ed etichette dei filtri attivi.
// Su desktop il pannello si apre sotto la barra (dialog non modale, i risultati restano visibili e si aggiornano);
// su mobile si apre dal basso (dialog modale). I filtri non si salvano mai: ripartono azzerati a ogni visita.

import { getLang, t, type Key } from '../i18n';
import { COLORS, MVS, mvLabel, textWords, type CardFilters, type ColorKey } from '../lib/cardfilter';
import { $, h, svg } from '../lib/dom';

/** Tipi con un nome tradotto; gli altri (improbabili tra le carte giocate) restano in inglese, come nei dati. */
const KNOWN_TYPES = new Set(['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Land', 'Kindred', 'Tribal',
  'Planeswalker', 'Battle']);
export const typeLabel = (x: string): string => (KNOWN_TYPES.has(x) ? t(`ftype.${x}` as Key) : x);
export const colorLabel = (c: ColorKey): string => t(`color.${c}` as Key);

export interface PanelDeps {
  filters: () => CardFilters;
  types: () => string[];
  /** i filtri sono cambiati: ricalcolare l'elenco */
  change: () => void;
  /** carte mostrate con i filtri attuali (per "Mostra N carte") */
  count: () => number;
  /** scarica texts.json (una volta sola); false se non è disponibile */
  loadTexts: () => Promise<boolean>;
}

export interface Chip {
  label: string;
  remove: () => void;
}

/** Etichette dei filtri attivi, nell'ordine del pannello. */
export function chips(f: CardFilters): Chip[] {
  const out: Chip[] = [];
  if (f.colorMode === 'only' && f.colors.length) {
    out.push({ label: t('chip.colorsOnly', { list: f.colors.map(colorLabel).join(', ') }), remove: () => { f.colors = []; } });
  } else {
    for (const c of f.colors) out.push({ label: colorLabel(c), remove: () => { f.colors = f.colors.filter((x) => x !== c); } });
  }
  if (f.mv.length) out.push({ label: t('chip.mv', { v: mvLabel(f.mv) }), remove: () => { f.mv = []; } });
  for (const x of f.types) out.push({ label: typeLabel(x), remove: () => { f.types = f.types.filter((y) => y !== x); } });
  if (textWords(f.text).length) out.push({ label: t('chip.text', { q: f.text.trim() }), remove: () => { f.text = ''; } });
  return out;
}

export function clearFilters(f: CardFilters): void {
  Object.assign(f, { colors: [], colorMode: 'any', mv: [], types: [], text: '' });
}

const toggle = <T>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function initFilterPanel(deps: PanelDeps): { render(): void; close(): void } {
  const panel = $('#fpanel') as HTMLDialogElement;
  const openBtn = $('#filtersBtn') as HTMLButtonElement;
  const text = $('#fpText') as HTMLInputElement;
  const status = $('#fpTextStatus');
  const mobile = window.matchMedia('(max-width: 640px)');
  let textsState: 'idle' | 'loading' | 'ready' = 'idle';
  let built = ''; // lingua e tipi con cui sono stati creati i pulsanti

  // texts.json si scarica solo al primo uso del campo; se non arriva si riprova al prossimo uso
  const ensureTexts = () => {
    if (textsState !== 'idle') return;
    textsState = 'loading';
    status.textContent = t('fp.textLoading');
    void deps.loadTexts().then((ok) => {
      textsState = ok ? 'ready' : 'idle';
      status.textContent = ok ? '' : t('fp.textError');
      if (ok && textWords(deps.filters().text).length) deps.change();
    });
  };

  const open = () => {
    if (panel.open) return;
    if (mobile.matches) panel.showModal();
    else panel.show();
    openBtn.setAttribute('aria-expanded', 'true');
    render();
  };
  const close = () => {
    if (!panel.open) return;
    panel.close();
  };
  panel.addEventListener('close', () => {
    openBtn.setAttribute('aria-expanded', 'false');
    openBtn.focus();
  });

  openBtn.addEventListener('click', () => (panel.open ? close() : open()));
  $('#fpClose').addEventListener('click', close);
  $('#fpDone').addEventListener('click', close);
  // non modale: Esc chiude il pannello (il modale lo fa da sé)
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.matches(':modal')) {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  });
  // modale: un tocco sullo sfondo (fuori dal contenuto) chiude
  panel.addEventListener('click', (e) => {
    if (e.target === panel) close();
  });

  panel.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-f]');
    if (!b) return;
    const f = deps.filters();
    const v = b.dataset.v!;
    if (b.dataset.f === 'color') f.colors = toggle(f.colors, v as ColorKey);
    else if (b.dataset.f === 'mv') f.mv = toggle(f.mv, Number(v));
    else if (b.dataset.f === 'type') f.types = toggle(f.types, v);
    deps.change();
  });
  panel.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    if (el.name !== 'colorMode') return;
    deps.filters().colorMode = el.value === 'only' ? 'only' : 'any';
    deps.change();
  });
  text.addEventListener('focus', ensureTexts);
  text.addEventListener('input', () => {
    ensureTexts();
    deps.filters().text = text.value;
    deps.change();
  });
  $('#fpClear').addEventListener('click', () => {
    clearFilters(deps.filters());
    deps.change();
  });
  $('#activeFilters').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-chip]');
    if (!b) return;
    const list = chips(deps.filters());
    const i = Number(b.dataset.chip);
    if (i < 0) clearFilters(deps.filters());
    else list[i]?.remove();
    deps.change();
    // il focus resta tra le etichette (o torna sul pulsante "Filtri" se non ce ne sono più)
    const next = $('#activeFilters').querySelector<HTMLButtonElement>(`button[data-chip="${Math.max(0, i - 1)}"]`)
      || $('#activeFilters').querySelector<HTMLButtonElement>('button[data-chip]');
    (next || openBtn).focus();
  });

  const pressed = (on: boolean) => ({ type: 'button' as const, 'aria-pressed': String(on) });

  function render(): void {
    const f = deps.filters();
    const list = chips(f);
    // pulsante "Filtri (N)"
    $('#filtersBtnText').textContent = list.length ? t('filters.moreN', { n: list.length }) : t('filters.more');
    openBtn.classList.toggle('on', list.length > 0);
    // etichette dei filtri attivi
    const bar = $('#activeFilters');
    bar.hidden = !list.length;
    const x = () => svg('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false' }, svg('path', { d: 'M4 4l8 8M12 4l-8 8' }));
    bar.replaceChildren(...list.map((c, i) => h('button', { class: 'fchip', type: 'button', dataset: { chip: String(i) },
      'aria-label': t('chip.remove', { f: c.label }) }, h('span', null, c.label), x())),
    ...(list.length ? [h('button', { class: 'linkbtn', type: 'button', dataset: { chip: '-1' } }, t('chip.clearAll'))] : []));
    if (!panel.open) return;
    // pulsanti del pannello: creati una volta (e al cambio di lingua), poi si aggiorna solo aria-pressed,
    // così il pulsante appena premuto mantiene il focus
    const types = deps.types();
    const key = `${getLang()}|${types.join(',')}`;
    if (built !== key) {
      built = key;
      $('#fpColors').replaceChildren(...COLORS.map((c) => h('button', { class: 'fbtn', ...pressed(false), dataset: { f: 'color', v: c } },
        h('span', { class: `cdot c-${c}`, 'aria-hidden': 'true' }), colorLabel(c))));
      $('#fpMv').replaceChildren(...MVS.map((m) => h('button', { class: 'fbtn', ...pressed(false), dataset: { f: 'mv', v: String(m) } },
        m === 6 ? '6+' : String(m))));
      $('#fpTypes').replaceChildren(...types.map((x) => h('button', { class: 'fbtn', ...pressed(false), dataset: { f: 'type', v: x } },
        typeLabel(x))));
    }
    panel.querySelectorAll<HTMLButtonElement>('button[data-f]').forEach((b) => {
      const v = b.dataset.v!;
      const on = b.dataset.f === 'color' ? f.colors.includes(v as ColorKey)
        : b.dataset.f === 'mv' ? f.mv.includes(Number(v)) : f.types.includes(v);
      b.setAttribute('aria-pressed', String(on));
    });
    panel.querySelectorAll<HTMLInputElement>('input[name="colorMode"]').forEach((r) => { r.checked = r.value === f.colorMode; });
    if (text.value !== f.text) text.value = f.text;
    $('#fpDone').textContent = t('fp.show', { n: deps.count() });
  }

  return { render, close };
}
