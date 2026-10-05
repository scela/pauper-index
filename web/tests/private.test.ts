// Test SOLO LOCALE sui file reali in reference/private/ (ignorata da git).
// Non stampa e non salva nulla del contenuto: controlla solo i conteggi.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { summarize } from '../src/lib/compare';
import { isFoil, readTable } from '../src/lib/csv';
import { buildData } from '../src/lib/data';
import { norm } from '../src/lib/norm';
import { parseTextList } from '../src/lib/text';
import type { Group } from '../src/lib/types';

const here = dirname(fileURLToPath(import.meta.url));
const TEXT = resolve(here, '../../reference/private/esempio-testo.txt');
const DATA = resolve(here, '../../data');
const read = (f: string) => JSON.parse(readFileSync(resolve(DATA, f), 'utf-8'));

const PRIVATE = resolve(here, '../../reference/private');
const CSVS = existsSync(PRIVATE) ? readdirSync(PRIVATE).filter((f) => /\.csv$/i.test(f)) : [];

describe.skipIf(!CSVS.length)('export CSV reale della collezione (solo locale)', () => {
  it.each(CSVS)('%s: formato riconosciuto e Name in inglese anche per le carte non inglesi', (f) => {
    const res = readTable(f, readFileSync(resolve(PRIVATE, f), 'utf-8'));
    if (!('groups' in res)) throw new Error(`file non riconosciuto: ${res.error}`);
    const d = buildData(read('cards.json'), read('printings.json'), read('names.json'), read('meta.json'));
    const all = new Set<string>(read('allnames.json'));
    const rows = res.groups.flatMap((g) => g.rows);
    const langs = new Map<string, number>();
    rows.forEach((r) => langs.set(r.l || '?', (langs.get(r.l || '?') || 0) + 1));
    const foreign = rows.filter((r) => r.l && !/^(en|english)$/i.test(r.l));
    const english = (n: string) => all.has(norm(n)) || all.has(norm(n.split('//')[0]));
    const foreignEnglish = foreign.filter((r) => english(r.n)).length;
    const s = summarize(d, res.groups, all);
    const types = new Map<string, number>();
    res.groups.forEach((g) => types.set(g.type || '?', (types.get(g.type || '?') || 0) + 1));
    // solo numeri in output
    console.log(`${f}: righe ${rows.length}, carte ${rows.reduce((a, r) => a + r.q, 0)}, gruppi ${res.groups.length} `
      + `(${[...types].map(([t, n]) => `${t} ${n}`).join(', ')}); lingue ${[...langs].map(([l, n]) => `${l} ${n}`).join(', ')}; `
      + `foil ${rows.filter((r) => isFoil(r.f)).length}, proxy ${rows.filter((r) => r.p).length}, senza Scryfall ID ${rows.filter((r) => !r.i).length}; `
      + `non inglesi con Name inglese ${foreignEnglish}/${foreign.length}; `
      + `nella lista ${s.inList}, mai giocate ${s.notInList}, non riconosciute ${s.unrecognized.length}`);
    expect(foreignEnglish).toBe(foreign.length);
    expect(s.unrecognized.length).toBe(0);
  });
});

describe.skipIf(!existsSync(TEXT))('esempio reale di testo condiviso da ManaBox (solo locale)', () => {
  it('ogni riga non vuota diventa una carta con set e numero', () => {
    const text = readFileSync(TEXT, 'utf-8');
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const { rows, ignored } = parseTextList(text);
    expect(ignored).toBe(0);
    expect(rows.length).toBe(lines.length);
    expect(rows.every((r) => r.s && r.c && r.q >= 1 && !/\*|\(|\)/.test(r.n))).toBe(true);
    expect(rows.filter((r) => r.f === 'foil').length).toBe(lines.filter((l) => l.includes('*F*')).length);
  });

  it('abbinamento con i dati reali: nessuna riga resta senza esito', () => {
    const d = buildData(read('cards.json'), read('printings.json'), read('names.json'), read('meta.json'));
    const { rows } = parseTextList(readFileSync(TEXT, 'utf-8'));
    const g: Group = { id: 't', name: 't', type: '', source: 't', kind: 'text', hasProxy: false, rows };
    const s = summarize(d, [g], new Set<string>(read('allnames.json')));
    // solo numeri in output
    console.log(`righe ${s.rows}: nella lista ${s.inList} (printing non esatta ${s.approxPrint}), `
      + `mai giocate ${s.notInList}, non riconosciute ${s.unrecognized.length}`);
    expect(s.inList + s.notInList + s.unrecognized.length).toBe(s.rows);
    expect(s.unrecognized.length).toBe(0);
    expect(s.approxPrint).toBe(0);
  });
});
