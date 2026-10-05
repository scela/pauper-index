// Test SOLO LOCALE sui file reali in reference/private/ (ignorata da git).
// Non stampa e non salva nulla del contenuto: controlla solo i conteggi.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { summarize } from '../src/lib/compare';
import { buildData } from '../src/lib/data';
import { parseTextList } from '../src/lib/text';
import type { Group } from '../src/lib/types';

const here = dirname(fileURLToPath(import.meta.url));
const TEXT = resolve(here, '../../reference/private/esempio-testo.txt');
const DATA = resolve(here, '../../data');
const read = (f: string) => JSON.parse(readFileSync(resolve(DATA, f), 'utf-8'));

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
