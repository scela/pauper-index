import type { Data } from './data';
import type { LastSeen } from './types';

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

/** "2026-10-04" -> "4 ott 2026" (senza dipendere dal fuso orario del browser). */
export function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return iso || '';
  return `${parseInt(m[3], 10)} ${MONTHS[parseInt(m[2], 10) - 1]} ${m[1]}`;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

export function fmtPct(x: number): string {
  if (x <= 0) return '0%';
  if (x < 0.001) return '<0,1%';
  return (x * 100).toLocaleString('it-IT', { maximumFractionDigits: x < 0.1 ? 1 : 0 }) + '%';
}

export function fmtInt(n: number): string {
  return n.toLocaleString('it-IT');
}

export function fmtResult(r: number | string | null): string {
  if (r === null || r === undefined || r === '') return '';
  if (typeof r === 'number') return `${r}°`;
  return String(r);
}

export interface LastSeenText {
  kind: 'MTGO' | 'Cartaceo';
  date: string;
  tournament: string;
  result: string;
  copies: string;
  uri: string;
}

export function lastSeen(d: Data, ls: LastSeen | undefined, kind: 'm' | 'p'): LastSeenText | null {
  if (!ls) return null;
  const t = d.cards.t[ls[0]];
  if (!t) return null;
  const [main, side] = [ls[2], ls[3]];
  const copies = [main ? `${main} main` : '', side ? `${side} side` : ''].filter(Boolean).join(' + ');
  return { kind: kind === 'm' ? 'MTGO' : 'Cartaceo', date: t[0], tournament: t[1], result: fmtResult(ls[1]), copies, uri: t[2] };
}
