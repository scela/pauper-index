// Mazzi recenti (data/decks-61.json e data/decks-365.json, vedi CLAUDE.md "Funzione 4: mazzi"): completamento con
// la collezione, ordinamento, migliore piazzamento ed export. Logica pura, senza DOM.

import { matchColors, type ColorKey } from './cardfilter';
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
  /** archetipo -> [nome ("" se non classificato), colori, tipo c|a|x, famiglia (v2)] */
  a: Record<string, [string, string, string] | [string, string, string, string]>;
  /** (v2) famiglia -> [nome, tier 1–4, quota a 61 giorni in centesimi di punto, carta simbolo, lista tipica (indice in l)] */
  f?: Record<string, [string, number, number, number, number]>;
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
  /** famiglia (v2): c<n> o a<id>; "" per le liste non classificate o con un file v1 */
  fam: string;
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
      i, arch, name: a[0], colors: colors || a[1] || '', kind: (a[2] as Deck['kind']) || 'x', fam: a[3] || '',
      main: pairs(main), side: pairs(side), apps, last, best,
    };
  }));
}

/**
 * Completamento: per ogni carta il minimo tra copie possedute e richieste. Le terre base normali sono escluse dal
 * calcolo (sempre disponibili); le Snow-Covered contano come carte normali. La stessa carta in main e side (con il
 * side) somma le copie.
 */
export function completion(deck: Deck, owned: (idx: number) => number, withSide: boolean, basics: Set<number>): Completion {
  // cicli semplici, senza Map né copie: si calcola per migliaia di liste (23.000 in un anno) a ogni cambio di opzione
  let need = 0;
  let have = 0;
  const missing: Missing[] = [];
  const { main, side } = deck;
  const ns = withSide ? side.length : 0;
  for (let k = 0, all = main.length + ns; k < all; k++) {
    const [idx, c] = k < main.length ? main[k] : side[k - main.length];
    let n = c;
    if (k < main.length) {
      for (let j = 0; j < ns; j++) if (side[j][0] === idx) n += side[j][1]; // stessa carta in main e side: si sommano
    } else {
      let dup = false;
      for (let j = 0; j < main.length && !dup; j++) dup = main[j][0] === idx;
      if (dup) continue;
    }
    if (basics.has(idx)) continue;
    const h = Math.min(owned(idx), n);
    need += n;
    have += h;
    if (h < n) missing.push({ idx, n: n - h });
  }
  return { need, have, pct: need ? have / need : 1, missing };
}

export interface DeckFilters {
  /** archetipo (variante) scelto ("" = tutti) */
  arch: string;
  /** completamento minimo, 0–1 (0 = nessun limite) */
  min: number;
  /** famiglia della pagina dell'archetipo ("" = tutte, "x" = liste non classificate) */
  fam?: string;
}

/** Ordine: con la collezione per completamento, senza per ultima apparizione; poi apparizioni e data. */
export function sortDecks(decks: Deck[], comp: Map<number, Completion> | null): Deck[] {
  // chiavi calcolate una volta (niente Map.get nel confronto); le date sono ISO, quindi basta il confronto tra stringhe
  const desc = (x: string, y: string) => (x < y ? 1 : x > y ? -1 : 0);
  return decks.map((d) => ({ d, pct: comp ? comp.get(d.i)!.pct : 0 }))
    .sort(({ d: a, pct: pa }, { d: b, pct: pb }) => {
      if (comp) {
        if (pb !== pa) return pb - pa;
      } else if (a.last !== b.last) return desc(a.last, b.last);
      return b.apps.length - a.apps.length || desc(a.last, b.last) || a.i - b.i;
    })
    .map((x) => x.d);
}

/** I mazzi che l'elenco mostra (senza ordinamento). */
export function visibleDecks(decks: Deck[], f: DeckFilters, comp: Map<number, Completion> | null): Deck[] {
  return decks.filter((x) => (!f.fam || (f.fam === 'x' ? x.kind === 'x' : x.fam === f.fam))
    && (!f.arch || x.arch === f.arch) && (!comp || !f.min || comp.get(x.i)!.pct >= f.min - 1e-9));
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

/** Lista acquisti delle carte mancanti: "N Nome", una riga per carta, con i nomi della decklist (campo dn). */
export function missingText(cards: CardRow[], missing: Missing[]): string {
  const lines = missing.map((m) => `${m.n} ${cards[m.idx].dn ?? cards[m.idx].n}`);
  return lines.length ? lines.join('\n') + '\n' : '';
}

/**
 * Decklist in testo importabile in ManaBox (formato di MTG Arena): main "4 Nome", una riga vuota, l'intestazione
 * "Sideboard" e il side. Sempre il mazzo intero, terre base comprese. Nomi come in MTG Arena: completi per le carte
 * divise ("Fire // Ice"), solo la prima faccia per le altre con più facce ("Delver of Secrets"), dal campo dn.
 */
export function deckText(cards: CardRow[], deck: Deck): string {
  const line = ([idx, n]: [number, number]) => `${n} ${cards[idx].dn ?? cards[idx].n}`;
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

/* ---------- tier list: famiglie di archetipi (restyling dei Mazzi) ---------- */

export interface Variant {
  arch: string;
  name: string;
  colors: string;
  lists: number;
  apps: number;
}

export interface Family {
  id: string;
  name: string;
  /** 1–3, 4 = "Altri" (calcolato nella pipeline, con la banda) */
  tier: number;
  /** quota dei mazzi a 61 giorni, tra 0 e 1 */
  share: number;
  /** carta simbolo (indice in cards.json), -1 se manca */
  symbol: number;
  /** colori della variante più giocata */
  colors: string;
  /** varianti di colore, dalla più giocata */
  variants: Variant[];
  lists: number;
  apps: number;
  decks: Deck[];
  /** lista tipica (la più vicina alla media della famiglia, scelta dalla pipeline) */
  typical: Deck | null;
}

/** Famiglie del file (v2), con le liste e le varianti; le liste non classificate restano fuori. */
export function families(f: DecksFile, decks: Deck[]): Family[] {
  const meta = f.f || {};
  const out = new Map<string, Family>();
  const byIndex = new Map(decks.map((x) => [x.i, x]));
  for (const x of decks) {
    if (!x.fam || !meta[x.fam]) continue;
    let fam = out.get(x.fam);
    if (!fam) {
      const [name, tier, share, symbol, typical] = meta[x.fam];
      fam = { id: x.fam, name, tier, share: share / 10000, symbol, colors: '', variants: [], lists: 0, apps: 0, decks: [], typical: byIndex.get(typical) || null };
      out.set(x.fam, fam);
    }
    fam.decks.push(x);
    fam.lists++;
    fam.apps += x.apps.length;
    let v = fam.variants.find((y) => y.arch === x.arch);
    if (!v) fam.variants.push(v = { arch: x.arch, name: x.name, colors: f.a[x.arch]?.[1] || x.colors, lists: 0, apps: 0 });
    v.lists++;
    v.apps += x.apps.length;
  }
  for (const fam of out.values()) {
    fam.variants.sort((a, b) => b.apps - a.apps || a.name.localeCompare(b.name, 'en'));
    fam.colors = fam.variants[0]?.colors || '';
  }
  return [...out.values()].sort((a, b) => a.tier - b.tier || b.share - a.share || b.apps - a.apps || a.name.localeCompare(b.name, 'en'));
}

/** Prezzo di una lista: per ogni carta (non terra base) la stampa non foil più economica × copie; main e side. */
export function listPrice(deck: Deck, priceOf: (idx: number) => number, basics: Set<number>, withSide = true): { cents: number; unpriced: number } {
  let cents = 0;
  let unpriced = 0;
  for (const [idx, n] of withSide ? [...deck.main, ...deck.side] : deck.main) {
    if (basics.has(idx)) continue;
    const c = priceOf(idx);
    if (c) cents += c * n;
    else unpriced++;
  }
  return { cents, unpriced };
}

/** Costo per completare: le copie mancanti × la stampa non foil più economica. */
export function missingCost(comp: Completion, priceOf: (idx: number) => number): number {
  return comp.missing.reduce((a, m) => a + (priceOf(m.idx) || 0) * m.n, 0);
}

/** La lista della famiglia più vicina a essere completa: completamento più alto, a parità costo più basso. */
export function closestDeck(fam: Family, comp: Map<number, Completion>, priceOf: (idx: number) => number): { deck: Deck; pct: number; cost: number } | null {
  let best: { deck: Deck; pct: number; cost: number } | null = null;
  for (const x of fam.decks) {
    const c = comp.get(x.i);
    if (!c) continue;
    const cost = missingCost(c, priceOf);
    if (!best || c.pct > best.pct || (c.pct === best.pct && cost < best.cost)) best = { deck: x, pct: c.pct, cost };
  }
  return best;
}

export interface TierFilters {
  colors: ColorKey[];
  colorMode: 'any' | 'only';
  /** tier scelti (1–4); vuoto = tutti */
  tiers: number[];
  /** prezzo massimo in centesimi: della lista tipica senza collezione, del costo per completare con la collezione;
   *  null = qualsiasi, 0 = solo già completi (con la collezione) */
  maxPrice: number | null;
  /** completamento minimo della lista più vicina (con la collezione), 0 = nessun limite */
  min: number;
}

export const emptyTierFilters = (): TierFilters => ({ colors: [], colorMode: 'any', tiers: [], maxPrice: null, min: 0 });

export interface FamilyScore {
  /** prezzo filtrato: lista tipica (senza collezione) o costo per completare la lista più vicina (con la collezione) */
  price: number | null;
  /** completamento della lista più vicina (con la collezione) */
  pct: number | null;
}

/**
 * Famiglie che passano i filtri. I colori valgono per le varianti: una famiglia resta se almeno una variante passa.
 * Il prezzo si filtra solo quando è noto (prezzi arrivati); senza prezzo la famiglia resta fuori dal filtro di prezzo.
 */
export function visibleFamilies(fams: Family[], f: TierFilters, score: (fam: Family) => FamilyScore): Family[] {
  const cf = { colors: f.colors, colorMode: f.colorMode, mv: [], types: [], text: '' };
  return fams.filter((fam) => {
    if (f.tiers.length && !f.tiers.includes(fam.tier)) return false;
    if (f.colors.length && !fam.variants.some((v) => matchColors(v.colors, cf))) return false;
    const s = score(fam);
    if (f.maxPrice !== null && (s.price === null || s.price > f.maxPrice)) return false;
    // "già completo" vuol dire completo, non "costo zero": le carte mancanti senza prezzo costerebbero 0
    if (f.maxPrice === 0 && (s.pct === null || s.pct < 1)) return false;
    if (f.min && (s.pct === null || s.pct < f.min - 1e-9)) return false;
    return true;
  });
}

/** Nomi brevi delle varianti: senza le parole finali comuni a tutte ("Mono-Blue Terror" -> "Mono-Blue"). */
export function variantLabels(names: string[]): string[] {
  if (names.length < 2) return names;
  const words = names.map((n) => n.split(' '));
  let k = 0;
  while (words.every((w) => w.length > k + 1 && w[w.length - 1 - k] === words[0][words[0].length - 1 - k])) k++;
  return words.map((w) => (k ? w.slice(0, w.length - k).join(' ') : w.join(' ')));
}
