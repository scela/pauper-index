import { describe, expect, it } from 'vitest';

import { compute, DEFAULT_OPTS } from '../src/lib/compare';
import { haystacks } from '../src/lib/cardfilter';
import { loose, nameHay, nameHays, nameMatches, type Italian } from '../src/lib/italian';
import { buildNameIndex, exactEntry, suggest } from '../src/lib/quick';
import { visible } from '../src/lib/view';
import { makeData } from './helpers';

// carte di makeData: Brainstorm, Delver, Gush, Island, Pyroblast (dati sintetici)
const IT: Italian = {
  played: [['Tempesta Cerebrale'], ['Scopritore di Segreti // Insetto Aberrante'], ["Getto d'Acqua", 'Getto di Acqua'], [], ['Piroesplosione']],
  // cardnames: 0 Ancestor's Chosen (mai giocata), 1 Black Lotus (nessun nome italiano)
  other: new Map([[0, ["Prescelto dell'Antenata"]]]),
};
const ALL: [string, string][] = [["Ancestor's Chosen", 'n'], ['Black Lotus', 'n']];

describe('nomi: maiuscole, accenti e apostrofi non contano', () => {
  it('apostrofi tolti o come spazi, accenti e maiuscole ignorati', () => {
    const hay = nameHay(["Prescelto dell'Antenata", 'Città Perduta']);
    for (const q of ["dell'antenata", 'DELL ANTENATA', 'dellantenata', 'Dell’Antenata', 'citta perd', 'CITTÀ']) {
      expect(nameMatches(hay, q)).toBe(true);
    }
    expect(nameMatches(hay, 'antenate')).toBe(false);
    expect(loose("Tormod's Crypt")).toBe('tormods crypt');
  });
});

describe('controllo rapido con i nomi italiani', () => {
  const d = makeData();
  const entries = buildNameIndex(d, ALL, IT);

  it('suggerimenti "Nome italiano (Nome inglese)", dopo i nomi inglesi a parità', () => {
    const s = suggest(entries, 'tempesta');
    expect(s[0].label).toBe('Tempesta Cerebrale (Brainstorm)');
    expect(s[0].name).toBe('Brainstorm');
    expect(s[0].card).toBe(0);
    expect(suggest(entries, 'insetto aber')[0].label).toBe('Scopritore di Segreti // Insetto Aberrante (Delver of Secrets // Insectile Aberration)');
    // tutte le traduzioni distinte
    expect(suggest(entries, 'getto').map((e) => e.label)).toEqual(["Getto d'Acqua (Gush)", 'Getto di Acqua (Gush)']);
    expect(suggest(entries, 'getto dacqua')[0].label).toBe("Getto d'Acqua (Gush)");
    // carta mai giocata, con il nome italiano
    const anc = suggest(entries, 'prescelto dell antenata')[0];
    expect([anc.label, anc.card, anc.its]).toEqual(["Prescelto dell'Antenata (Ancestor's Chosen)", -1, ["Prescelto dell'Antenata"]]);
    // a parità, il nome inglese prima
    expect(suggest(entries, 'brain')[0].label).toBe('Brainstorm');
  });

  it('nome esatto italiano, anche di una faccia; carte senza nome italiano con il nome inglese', () => {
    expect(exactEntry(entries, 'tempesta cerebrale')?.name).toBe('Brainstorm');
    expect(exactEntry(entries, 'PRESCELTO DELL ANTENATA')?.name).toBe("Ancestor's Chosen");
    expect(exactEntry(entries, 'prescelto dellantenata')?.name).toBe("Ancestor's Chosen");
    expect(exactEntry(entries, 'insetto aberrante')?.name).toBe('Delver of Secrets // Insectile Aberration');
    expect(exactEntry(entries, 'Black Lotus')?.its).toEqual([]);
    expect(exactEntry(entries, 'island')?.name).toBe('Island');
    // senza i nomi italiani (file non disponibile) restano i nomi inglesi, senza errori
    const plain = buildNameIndex(d, ALL, null);
    expect(suggest(plain, 'tempesta')).toEqual([]);
    expect(exactEntry(plain, 'brainstorm')?.its).toEqual([]);
  });
});

describe('ricerca nell’elenco e testo italiano', () => {
  const d = makeData();
  const all = compute(d, [], {}, { ...DEFAULT_OPTS, win: 3, legalOnly: false });
  const find = (query: string, names: string[] | null) =>
    visible(d, all, { query, seen: 'all', onlyOwned: false, names }).map((x) => d.cards.c[x.idx].n);

  it('nome inglese o italiano', () => {
    const names = nameHays(d.cards.c, IT);
    expect(find('piroesplos', names)).toEqual(['Pyroblast']);
    expect(find('pyro', names)).toEqual(['Pyroblast']);
    expect(find("getto d'acqua", names)).toEqual(['Gush']);
    expect(find('piroesplos', null)).toEqual([]); // nomi italiani non ancora arrivati: solo inglese
  });

  it('il filtro sul testo cerca anche nel testo italiano', () => {
    const hay = haystacks(d.cards.c, ['Draw three cards', '', '', '', ''], ['Pesca tre carte', '', '', '', '']);
    expect(hay[0]).toContain('pesca tre carte');
    expect(hay[0]).toContain('draw three cards');
  });
});
