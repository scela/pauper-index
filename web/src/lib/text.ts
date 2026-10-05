// Liste di carte in testo: "4 Ponder", "4x Ponder", "4 Ponder (M12) 73", "Ponder",
// "1 Nome (SET) 58a *F*" (formato condiviso da ManaBox), intestazioni "Deck"/"Sideboard" ignorate.

import type { Row } from './types';

const HEADER = /^(deck|mainboard|main|sideboard|side|commander|companion|maybeboard|about|tokens?)\s*:?\s*(\(\d+\))?\s*$/i;
const MARKER = /\s+\*([A-Za-z]+)\*\s*$/; // *F* foil, *E* etched
const PRINT = /^(.+?)\s+\(([A-Za-z0-9]{2,6})\)(?:\s+(\S+))?\s*$/;
const QTY = /^(\d+)\s*x?\s+(.+)$/i;

export interface TextParse {
  rows: Row[];
  ignored: number; // intestazioni e commenti
}

export function parseTextList(text: string): TextParse {
  const rows: Row[] = [];
  let ignored = 0;
  for (let line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    line = line.trim();
    if (!line) continue;
    if (line.startsWith('//') || line.startsWith('#') || HEADER.test(line)) {
      ignored++;
      continue;
    }
    line = line.replace(/^SB:\s*/i, '');
    let foil = '';
    let m = line.match(MARKER);
    while (m) {
      const k = m[1].toUpperCase();
      if (k === 'F') foil = 'foil';
      else if (k === 'E') foil = 'etched';
      line = line.slice(0, m.index).trimEnd();
      m = line.match(MARKER);
    }
    let q = 1;
    let rest = line;
    const qm = line.match(QTY);
    if (qm) {
      q = parseInt(qm[1], 10) || 1;
      rest = qm[2];
    }
    let s = '';
    let c = '';
    const pm = rest.match(PRINT);
    if (pm) {
      rest = pm[1];
      s = pm[2];
      c = pm[3] || '';
    }
    rest = rest.trim();
    if (!rest) {
      ignored++;
      continue;
    }
    rows.push({ n: rest, s, sn: '', c, f: foil, q, l: '', i: '', p: 0 });
  }
  return { rows, ignored };
}
