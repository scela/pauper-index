// Traduzioni: lingua corrente, t() con segnaposto e plurali, formattazione di date e numeri.

import { en } from './en';
import { it, type Key, type Msg } from './it';

export type Lang = 'it' | 'en';
export type { Key };

const DICTS: Record<Lang, Record<Key, Msg>> = { it, en };
const LOCALES: Record<Lang, string> = { it: 'it-IT', en: 'en-US' };
let current: Lang = 'it';

export function detectLang(saved: string | null, browser: readonly string[]): Lang {
  if (saved === 'it' || saved === 'en') return saved;
  return browser.some((l) => /^it\b/i.test(l)) ? 'it' : 'en';
}

export function setLang(l: Lang): void {
  current = l;
}

export function getLang(): Lang {
  return current;
}

export function locale(l: Lang = current): string {
  return LOCALES[l];
}

type Vars = Record<string, string | number>;

function fill(s: string, vars?: Vars): string {
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Traduzione per una lingua qualsiasi (usata anche dai test). `vars.n` sceglie il plurale. */
export function translate(l: Lang, key: Key, vars?: Vars): string {
  const msg = DICTS[l][key] ?? DICTS.it[key];
  if (typeof msg === 'string') return fill(msg, vars);
  const n = Number(vars?.n ?? 0);
  const form = new Intl.PluralRules(LOCALES[l]).select(n) === 'one' ? msg.one : msg.other;
  return fill(form, { ...vars, n: typeof vars?.n === 'number' ? fmtInt(vars.n, l) : (vars?.n ?? '') });
}

export function t(key: Key, vars?: Vars): string {
  return translate(current, key, vars);
}

/** Testo con nodi (per esempio link) al posto dei segnaposto: "Scrivi a {email}" -> ["Scrivi a ", <a>]. */
export function tNodes(key: Key, nodes: Record<string, Node>, vars?: Vars): (string | Node)[] {
  const s = t(key, vars);
  return s.split(/(\{\w+\})/).filter(Boolean).map((part) => {
    const m = /^\{(\w+)\}$/.exec(part);
    return m && nodes[m[1]] ? nodes[m[1]] : part;
  });
}

export function fmtInt(n: number, l: Lang = current): string {
  return n.toLocaleString(LOCALES[l]);
}

/** "2026-10-04" -> "4 ott 2026" / "Oct 4, 2026", senza dipendere dal fuso orario del browser. */
export function fmtDate(iso: string, l: Lang = current): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return iso || '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return new Intl.DateTimeFormat(LOCALES[l], { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
}

export function fmtDateTime(ms: number, l: Lang = current): string {
  return new Date(ms).toLocaleString(LOCALES[l], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function fmtPct(x: number, l: Lang = current): string {
  if (x <= 0) return '0%';
  if (x < 0.001) return `<${(0.1).toLocaleString(LOCALES[l])}%`;
  return (x * 100).toLocaleString(LOCALES[l], { maximumFractionDigits: x < 0.1 ? 1 : 0 }) + '%';
}

/** Piazzamento: 3 -> "3°" / "3rd"; "5-0" resta com'è. */
export function fmtResult(r: number | string | null, l: Lang = current): string {
  if (r === null || r === undefined || r === '') return '';
  if (typeof r !== 'number') return String(r);
  if (l === 'it') return `${r}°`;
  const s = new Intl.PluralRules('en-US', { type: 'ordinal' }).select(r);
  return `${r}${({ one: 'st', two: 'nd', few: 'rd' } as Record<string, string>)[s] || 'th'}`;
}

export const ALL_KEYS = Object.keys(it) as Key[];
export { DICTS };
