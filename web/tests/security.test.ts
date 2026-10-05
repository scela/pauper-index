import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { readTable } from '../src/lib/csv';
import { parseTextList } from '../src/lib/text';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe('sicurezza', () => {
  it('nessuna API che interpreta HTML nel codice dell\'app', () => {
    const bad = /\b(innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\s*\(|new Function)\b/;
    const hits = files(SRC).filter((f) => /\.(ts|js)$/.test(f)).filter((f) => bad.test(readFileSync(f, 'utf-8')));
    expect(hits).toEqual([]);
  });

  it('un CSV malevolo resta testo: nessun campo viene interpretato', () => {
    const evil = 'Name,Set code,Quantity,Binder Name\n'
      + '"<img src=x onerror=""window.__xss=1"">",<b>X</b>,1,"<script>window.__xss=1</script>"\n'
      + '"javascript:alert(1)",SET,2,"Binder"\n';
    const res = readTable('evil.csv', evil);
    if (!('groups' in res)) throw new Error('atteso groups');
    expect(res.groups[0].name).toBe('<script>window.__xss=1</script>');
    expect(res.groups[0].rows[0].n).toBe('<img src=x onerror="window.__xss=1">');
    expect(parseTextList('1 <svg onload=alert(1)> (SET) 1').rows[0].n).toBe('<svg onload=alert(1)>');
  });
});
