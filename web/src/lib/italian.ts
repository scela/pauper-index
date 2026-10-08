// Nomi italiani delle carte (data/itnames.json e data/itnames-other.json) e ricerca per nome che ignora
// maiuscole, accenti e apostrofi. I file si scaricano solo al primo uso della ricerca (o della scheda in italiano).

import { norm } from './norm';
import type { CardRow } from './types';

export interface Italian {
  /** nomi italiani della carta i di cards.json, dal più recente ([] se non ce ne sono) */
  played: string[][];
  /** indice in cardnames.json -> nomi italiani, per le carte mai giocate; null finché non è richiesto */
  other: Map<number, string[]> | null;
}

/** Nome normalizzato senza apostrofi: "Dell'Antenata" -> "dellantenata". */
export const loose = (s: string): string => norm(s).replace(/'/g, '');

/** Nome normalizzato con gli apostrofi come spazi: "Dell'Antenata" -> "dell antenata". */
export const spaced = (s: string): string => norm(s).replace(/'/g, ' ').replace(/\s+/g, ' ').trim();

/** Testo in cui cercare un nome: senza apostrofi e con gli apostrofi come spazi ("dellantenata", "dell antenata"). */
export function nameHay(names: string[]): string {
  const out = new Set<string>();
  for (const n of names) {
    const k = norm(n);
    out.add(k.replace(/'/g, ''));
    if (k.includes("'")) out.add(spaced(n));
  }
  return [...out].join('\n');
}

/** Per ogni carta di cards.json, il testo in cui cercare il nome: inglese e, se ci sono, italiani. */
export function nameHays(cards: CardRow[], it: Italian | null): string[] {
  return cards.map((c, i) => nameHay([c.n, ...(it?.played[i] || [])]));
}

/** La ricerca compare nel nome (inglese o italiano). `q` è il testo scritto. */
export function nameMatches(hay: string, q: string): boolean {
  const k = loose(q);
  return !k || hay.includes(k) || hay.includes(spaced(q));
}

async function getJSON<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

let played: Promise<string[][] | null> | null = null;
let other: Promise<Map<number, string[]> | null> | null = null;
let cache: Italian | null = null;

/**
 * Nomi italiani: `withOther` scarica anche quelli delle carte mai giocate (solo per il controllo rapido).
 * null se il file non c'è o non è allineato alle carte (la ricerca resta solo in inglese, senza errori).
 */
export async function loadItalian(cardCount: number, withOther = false): Promise<Italian | null> {
  played ??= getJSON<{ c?: string[][] }>('data/itnames.json').then((j) => {
    const ok = Array.isArray(j?.c) && j.c.length === cardCount;
    if (!ok) played = null; // si riprova al prossimo uso
    return ok ? j!.c! : null;
  });
  if (withOther) {
    other ??= getJSON<{ o?: [number, ...string[]][] }>('data/itnames-other.json').then((j) => {
      if (!Array.isArray(j?.o)) {
        other = null;
        return null;
      }
      return new Map(j.o.map(([i, ...names]) => [i, names]));
    });
  }
  const [p, o] = await Promise.all([played, withOther ? other : Promise.resolve(cache?.other ?? null)]);
  if (!p) return null;
  cache = { played: p, other: o ?? cache?.other ?? null };
  return cache;
}

/** Nomi già scaricati (senza nuove richieste). */
export const italianLoaded = (): Italian | null => cache;

/** Solo per i test: dimentica i file scaricati. */
export function resetItalian(): void {
  played = other = null;
  cache = null;
}
