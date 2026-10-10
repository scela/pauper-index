import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { GC_ENDPOINT, GC_EVENTS, makeTracker, shouldCount, type GcVars } from '../src/lib/analytics';
import { CSP, GC_CONNECT } from '../vite.config';

const here = dirname(fileURLToPath(import.meta.url));

describe('conteggio delle visite (GoatCounter)', () => {
  it('solo sul sito pubblicato e mai con un browser automatizzato', () => {
    expect(shouldCount('pauperindex.com', false)).toBe(true);
    expect(shouldCount('pauperindex.com', true)).toBe(false);
    for (const host of ['localhost', '127.0.0.1', '192.168.1.20', 'www.pauperindex.com', 'scela.github.io', '']) {
      expect(shouldCount(host, false)).toBe(false);
    }
  });

  it('ogni evento si invia una volta, solo con il suo nome, anche se count.js arriva dopo', () => {
    const calls: GcVars[] = [];
    let ready = false;
    const tr = makeTracker(() => (ready ? (v) => calls.push(v) : undefined));
    tr.track('export');
    tr.track('export');
    tr.flush();
    expect(calls).toEqual([]);
    ready = true;
    tr.flush();
    tr.track('mazzi');
    tr.track('export');
    tr.flush();
    expect(calls).toEqual([
      { path: 'export', title: 'export', referrer: '', event: true },
      { path: 'mazzi', title: 'mazzi', referrer: '', event: true },
    ]);
  });

  it('i nomi degli eventi sono fissi e brevi', () => {
    for (const e of GC_EVENTS) expect(e).toMatch(/^[a-z-]{3,24}$/);
  });

  it('CSP: si apre solo l\'endpoint del contatore, in connect-src', () => {
    expect(GC_CONNECT).toBe(GC_ENDPOINT);
    const dirs = Object.fromEntries(CSP.split('; ').map((d) => [d.split(' ')[0], d.split(' ').slice(1)]));
    expect(dirs['connect-src']).toEqual(["'self'", 'https://albafvcens.goatcounter.com/count']);
    expect(dirs['script-src']).toEqual(["'self'"]);
    expect(dirs['img-src']).toEqual(["'self'", 'https://cards.scryfall.io', 'data:']);
    expect(CSP.match(/goatcounter/g)).toHaveLength(1);
  });

  it('count.js è la copia del file ufficiale (ISC), senza modifiche', () => {
    const js = readFileSync(resolve(here, '../public/count.js'));
    expect(js.toString('utf-8')).toMatch(/^\/\/ GoatCounter: https:\/\/www\.goatcounter\.com\n\/\/ This file is released under the ISC license/);
    expect(createHash('sha256').update(js).digest('hex')).toBe('792b7abd26c1fb6ae62906833e09a301251e2641816e69e4f95aba518f3fe3f0');
  });
});
