// Mazzi recenti (data/decks-61.json e data/decks-365.json, vedi CLAUDE.md "Funzione 4: mazzi"): completamento con
// la collezione, ordinamento, migliore piazzamento ed export. Logica pura, senza DOM.

import type { CardRow } from './types';

/** [data, nome, Tournament.Uri, "m" | "p"] */
export type DeckTournament = [string, string, string, 'm' | 'p'];

/** [archetipo, colori, main (coppie indice carta, copie), side, apparizioni [torneo, piazzamento]] */
export type DeckList = [string, string, number[], number[], [number, number | string | null][]];

export interface DecksFile {
  v: number;
  days: number;
  anchor: string;
  /** indici delle terre base normali: sempre disponibili, escluse dal completamento */
  basics: number[];
  t: Record<string, DeckTournament>;
  /** archetipo -> [nome ("" se non classificato), colori, tipo c|a|x] */
  a: Record<string, [string, string, string]>;
  l: DeckList[];
}

export interface Appearance {
  tour: DeckTournament | null;
  result: number | string | null;
}

export interface Deck {
  /** posizione nel file */
  i: number;
  arch: string;
  name: string;
  /** colori della lista (WUBRG) */
  colors: string;
  kind: 'c' | 'a' | 'x';
  main: [number, number][];
  side: [number, number][];
  apps: Appearance[];
  /** data dell'ultima apparizione (AAAA-MM-GG) */
  last: string;
  best: Appearance;
}

export interface Missing {
  idx: number;
  /** copie che mancano */
  n: number;
}

export interface Completion {
  /** copie richieste (senza le terre base) */
  need: number;
  /** copie possedute, al massimo quelle richieste per ogni carta */
  have: number;
  /** have / need, tra 0 e 1 (1 se il mazzo ha solo terre base) */
  pct: number;
  missing: Missing[];
}

const pairs = (flat: number[]): [number, number][] => {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
};

/**
 * Valore per confrontare i piazzamenti (più basso = migliore): il posto in classifica; un record senza sconfitte
 * (le liste 5-0 delle League) vale come subito dopo la top 8; gli altri record e i valori sconosciuti vengono dopo.
 */
export function placementScore(r: number | string | null): number {
  if (typeof r === 'number') return r;
  const m = typeof r === 'string' ? r.match(/^(\d+)-(\d+)$/) : null;
  if (m) return Number(m[2]) === 0 ? 8.5 : 100 + Number(m[2]);
  return 1e6;
}

/** Il file è coerente con le carte caricate (stessa build della pipeline)? */
export function validDecks(f: unknown, cardCount: number): f is DecksFile {
  const d = f as DecksFile;
  if (!d || !Array.isArray(d.l) || !Array.isArray(d.basics) || typeof d.t !== 'object' || typeof d.a !== 'object') return false;
  return d.l.every((x) => Array.isArray(x) && Array.isArray(x[2]) && Array.isArray(x[3]) && Array.isArray(x[4])
    && x[2].every((v, i) => (i % 2 ? v > 0 : v >= 0 && v < cardCount))
    && x[3].every((v, i) => (i % 2 ? v > 0 : v >= 0 && v < cardCount)));
}

/**
 * Mazzi del file, con archetipo, apparizioni, ultima data e migliore piazzamento. Si scartano le liste con il main
 * di sole terre base (per esempio 60 Island: segnaposto di chi non ha registrato la lista).
 */
export function readDecks(f: DecksFile): Deck[] {
  const basics = new Set(f.basics);
  const real = (x: DeckList) => x[2].some((v, k) => k % 2 === 0 && !basics.has(v));
  return f.l.flatMap((x, i) => (real(x) ? [x] : []).map(() => {
    const [arch, colors, main, side, raw] = x;
    const a = f.a[arch] || ['', colors, 'x'];
    const apps: Appearance[] = raw.map(([tid, result]) => ({ tour: f.t[String(tid)] || null, result }));
    const last = apps.reduce((m, ap) => (ap.tour && ap.tour[0] > m ? ap.tour[0] : m), '');
    // migliore piazzamento; a parità il più recente
    const best = apps.reduce((b, ap) => {
      const d = placementScore(ap.result) - placementScore(b.result);
      return d < 0 || (d === 0 && (ap.tour?.[0] || '') > (b.tour?.[0] || '')) ? ap : b;
    }, apps[0] || { tour: null, result: null });
    return {
      i, arch, name: a[0], colors: colors || a[1] || '', kind: (a[2] as Deck['kind']) || 'x',
      main: pairs(main), side: pairs(side), apps, last, best,
    };
  }));
}

/** Copie richieste per carta: il main, più il side se richiesto (stessa carta nei due: si sommano). */
export function required(deck: Deck, withSide: boolean): Map<number, number> {
  const need = new Map<number, number>();
  for (const [idx, n] of withSide ? [...deck.main, ...deck.side] : deck.main) need.set(idx, (need.get(idx) || 0) + n);
  return need;
}

/**
 * Completamento: per ogni carta il minimo tra copie possedute e richieste. Le terre base normali sono escluse dal
 * calcolo (sempre disponibili); le Snow-Covered contano come carte normali.
 */
export function completion(deck: Deck, owned: (idx: number) => number, withSide: boolean, basics: Set<number>): Completion {
  let need = 0;
  let have = 0;
  const missing: Missing[] = [];
  for (const [idx, n] of required(deck, withSide)) {
    if (basics.has(idx)) continue;
    const h = Math.min(owned(idx), n);
    need += n;
    have += h;
    if (h < n) missing.push({ idx, n: n - h });
  }
  return { need, have, pct: need ? have / need : 1, missing };
}

export interface DeckFilters {
  /** archetipo scelto ("" = tutti) */
  arch: string;
  /** completamento minimo, 0–1 (0 = nessun limite) */
  min: number;
}

/** Ordine: con la collezione per completamento, senza per ultima apparizione; poi apparizioni e data. */
export function sortDecks(decks: Deck[], comp: Map<number, Completion> | null): Deck[] {
  return [...decks].sort((a, b) => {
    if (comp) {
      const d = comp.get(b.i)!.pct - comp.get(a.i)!.pct;
      if (d) return d;
    } else if (a.last !== b.last) return b.last.localeCompare(a.last);
    return b.apps.length - a.apps.length || b.last.localeCompare(a.last) || a.i - b.i;
  });
}

/** I mazzi che l'elenco mostra (senza ordinamento). */
export function visibleDecks(decks: Deck[], f: DeckFilters, comp: Map<number, Completion> | null): Deck[] {
  return decks.filter((x) => (!f.arch || x.arch === f.arch) && (!comp || !f.min || comp.get(x.i)!.pct >= f.min - 1e-9));
}

export interface ArchetypeCount {
  id: string;
  name: string;
  colors: string;
  kind: 'c' | 'a' | 'x';
  lists: number;
  apps: number;
}

/** Archetipi presenti, dal più frequente (apparizioni), poi i non classificati in fondo, poi per nome. */
export function archetypes(decks: Deck[]): ArchetypeCount[] {
  const m = new Map<string, ArchetypeCount>();
  for (const x of decks) {
    let e = m.get(x.arch);
    if (!e) m.set(x.arch, (e = { id: x.arch, name: x.name, colors: x.kind === 'x' ? x.arch.slice(1) : x.colors, kind: x.kind, lists: 0, apps: 0 }));
    e.lists++;
    e.apps += x.apps.length;
  }
  return [...m.values()].sort((a, b) => b.apps - a.apps || Number(a.kind === 'x') - Number(b.kind === 'x') || a.name.localeCompare(b.name, 'en'));
}

/** Lista acquisti delle carte mancanti: "N Nome", una riga per carta. */
export function missingText(cards: CardRow[], missing: Missing[]): string {
  const lines = missing.map((m) => `${m.n} ${cards[m.idx].n}`);
  return lines.length ? lines.join('\n') + '\n' : '';
}

/**
 * Decklist in testo importabile in ManaBox (formato di MTG Arena): main "4 Nome", una riga vuota, l'intestazione
 * "Sideboard" e il side. Sempre il mazzo intero, terre base comprese.
 */
export function deckText(cards: CardRow[], deck: Deck): string {
  const line = ([idx, n]: [number, number]) => `${n} ${cards[idx].n}`;
  const out = deck.main.map(line);
  if (deck.side.length) out.push('', 'Sideboard', ...deck.side.map(line));
  return out.join('\n') + '\n';
}

/** Gruppi della decklist per tipo principale, nell'ordine abituale. */
export const SECTIONS = ['creature', 'planeswalker', 'instant', 'sorcery', 'artifact', 'enchantment', 'battle', 'land', 'other'] as const;
export type Section = (typeof SECTIONS)[number];

/** Tipo principale di una carta (prima faccia): creatura prima di tutto, poi terra (anche le terre artefatto). */
export function sectionOf(c: CardRow): Section {
  const tl = (c.tl || '').split('//')[0].split('—')[0].toLowerCase();
  for (const s of ['creature', 'land', 'planeswalker', 'instant', 'sorcery', 'battle', 'artifact', 'enchantment'] as const) {
    if (new RegExp(`\\b${s}\\b`).test(tl)) return s;
  }
  return 'other';
}
