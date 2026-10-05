// Parsing CSV dell'export ManaBox, portato da reference/ce-lho.html (delimitatore automatico,
// colonne riconosciute senza distinzione di maiuscole).

import type { Group, Row } from './types';

export function detectDelim(text: string): string {
  const line = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] || '';
  let best = ',';
  let max = -1;
  for (const d of [',', ';', '\t']) {
    let n = 0;
    let q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === d && !q) n++;
    }
    if (n > max) {
      max = n;
      best = d;
    }
  }
  return best;
}

export function parseCSV(text: string): string[][] {
  text = text.replace(/^﻿/, '');
  const d = detectDelim(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let f = '';
  let q = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          f += '"';
          i += 2;
          continue;
        }
        q = false;
        i++;
        continue;
      }
      f += ch;
      i++;
      continue;
    }
    if (ch === '"' && f === '') {
      q = true;
      i++;
      continue;
    }
    if (ch === d) {
      row.push(f);
      f = '';
      i++;
      continue;
    }
    if (ch === '\r') {
      i++;
      continue;
    }
    if (ch === '\n') {
      row.push(f);
      rows.push(row);
      row = [];
      f = '';
      i++;
      continue;
    }
    f += ch;
    i++;
  }
  if (f !== '' || row.length) {
    row.push(f);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const COLS: Record<string, string[]> = {
  name: ['name', 'card name', 'cardname', 'card'],
  set: ['set code', 'setcode', 'set', 'edition code'],
  setName: ['set name', 'edition'],
  num: ['collector number', 'card number', 'collector #', 'number', 'cn'],
  foil: ['foil', 'finish', 'printing'],
  qty: ['quantity', 'qty', 'count', 'amount'],
  lang: ['language', 'lang'],
  sid: ['scryfall id', 'scryfall_id', 'scryfallid'],
  binder: ['binder name', 'binder', 'list name', 'folder name', 'folder'],
  btype: ['binder type'],
};

export type ColMap = Partial<Record<keyof typeof COLS | 'proxy', number>>;

export function mapHeaders(h: string[]): ColMap {
  const low = h.map((x) => String(x).trim().toLowerCase());
  const m: ColMap = {};
  for (const k of Object.keys(COLS) as (keyof typeof COLS)[]) {
    for (const c of COLS[k]) {
      const i = low.indexOf(c);
      if (i >= 0) {
        m[k] = i;
        break;
      }
    }
  }
  const p = low.findIndex((x) => x.includes('proxy'));
  if (p >= 0) m.proxy = p;
  return m;
}

export function truthy(v: string): boolean {
  return /^(true|yes|y|1|si|sì|proxy|x)$/i.test(String(v || '').trim());
}

export function isFoil(v: string): boolean {
  v = String(v || '').trim();
  return v !== '' && !/^(normal|false|no|0|nonfoil|non-foil|n)$/i.test(v);
}

export function baseName(f: string): string {
  return String(f || '').replace(/\.[^.]+$/, '');
}

/** Il testo sembra un CSV con intestazione riconoscibile (nome più almeno un'altra colonna nota)? */
export function looksLikeCSV(text: string): boolean {
  const first = parseCSV(text.split(/\r?\n/, 1)[0] || '')[0] || [];
  if (first.length < 2) return false;
  const m = mapHeaders(first);
  return m.name !== undefined && (m.set !== undefined || m.qty !== undefined || m.sid !== undefined
    || m.binder !== undefined || m.num !== undefined);
}

export type TableResult = { groups: Group[] } | { error: 'empty' | 'noname' | 'norows'; headers: string[] };

export function readTable(fname: string, text: string): TableResult {
  const rows = parseCSV(text);
  if (!rows.length) return { error: 'empty', headers: [] };
  const m = mapHeaders(rows[0]);
  if (m.name === undefined) return { error: 'noname', headers: rows[0] };
  const by = new Map<string, Group>();
  for (const r of rows.slice(1)) {
    const g = (c: number | undefined) => (c === undefined ? '' : String(r[c] || '').trim());
    const name = g(m.name);
    if (!name) continue;
    const gname = (m.binder !== undefined && g(m.binder)) || baseName(fname) || 'File';
    const id = gname.toLowerCase();
    if (!by.has(id)) {
      by.set(id, {
        id, name: gname, type: m.btype !== undefined ? g(m.btype).toLowerCase() : '', source: fname,
        rows: [], hasProxy: m.proxy !== undefined, kind: 'csv',
      });
    }
    const q = parseInt(g(m.qty), 10);
    const row: Row = {
      n: name, s: g(m.set), sn: m.set === undefined ? g(m.setName) : '', c: g(m.num), f: g(m.foil),
      q: Number.isFinite(q) && q > 0 ? q : 1, l: g(m.lang), i: g(m.sid).toLowerCase(),
      p: m.proxy !== undefined && truthy(g(m.proxy)) ? 1 : 0,
    };
    by.get(id)!.rows.push(row);
  }
  const groups = [...by.values()];
  if (!groups.length) return { error: 'norows', headers: rows[0] };
  return { groups };
}
