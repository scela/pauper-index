// Dati integrati (data/*.json) e indici costruiti nel browser.

import { norm, splitFaces } from './norm';
import type { CardsFile, MetaFile, PrintingsFile } from './types';

export interface Data {
  cards: CardsFile;
  prints: PrintingsFile;
  names: Record<string, number>;
  meta: MetaFile;
  /** Scryfall ID -> [indice carta, indice printing] */
  byId: Map<string, [number, number]>;
  /** "set|numero" (minuscolo) -> [indice carta, indice printing] */
  bySetCn: Map<string, [number, number]>;
}

export function buildData(cards: CardsFile, prints: PrintingsFile, names: Record<string, number>, meta: MetaFile): Data {
  const byId = new Map<string, [number, number]>();
  const bySetCn = new Map<string, [number, number]>();
  prints.p.forEach((list, ci) => {
    list.forEach((p, pi) => {
      byId.set(p[0], [ci, pi]);
      const k = `${p[1]}|${p[2]}`.toLowerCase();
      if (!bySetCn.has(k)) bySetCn.set(k, [ci, pi]);
    });
  });
  return { cards, prints, names, meta, byId, bySetCn };
}

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

export async function loadData(base = 'data/'): Promise<Data> {
  const [cards, prints, names, meta] = await Promise.all([
    getJSON<CardsFile>(base + 'cards.json'),
    getJSON<PrintingsFile>(base + 'printings.json'),
    getJSON<Record<string, number>>(base + 'names.json'),
    getJSON<MetaFile>(base + 'meta.json'),
  ]);
  return buildData(cards, prints, names, meta);
}

/** Indice della carta dal nome: nome intero, poi faccia frontale, poi "A/B" come "A // B". */
export function cardByName(d: Data, name: string): number {
  const direct = d.names[norm(name)];
  if (direct !== undefined) return direct;
  const faces = splitFaces(name);
  if (faces.length > 1) {
    const joined = d.names[norm(faces.join(' // '))];
    if (joined !== undefined) return joined;
    const front = d.names[norm(faces[0])];
    if (front !== undefined) return front;
  } else if (name.includes('/')) {
    return cardByName(d, name.replace('/', ' // '));
  }
  return -1;
}

export function imageUrl(id: string, size: 'small' | 'normal' | 'large' = 'small', face: 'front' | 'back' = 'front'): string {
  const safe = /^[0-9a-f-]{36}$/.test(id) ? id : '00000000-0000-0000-0000-000000000000';
  return `https://cards.scryfall.io/${size}/${face}/${safe[0]}/${safe[1]}/${safe}.jpg`;
}
