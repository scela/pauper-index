import { describe, expect, it } from 'vitest';

import {
  allNamesIndex, favKey, favText, italianIndex, isFavFile, mergeFavs, parseFavList, reconcile, removeFav, resolveName,
  toggleFav, type Fav, type NameSource,
} from '../src/lib/favorites';
import { norm } from '../src/lib/norm';
import type { CardRow } from '../src/lib/types';

const card = (o: string, n: string) => ({ o, n, l: 'l', s: [], f: '', z: '', r: 0 }) as unknown as CardRow;
const cards = [card('o-bolt', 'Lightning Bolt'), card('o-fire', 'Fire // Ice'), card('o-delver', 'Delver of Secrets // Insectile Aberration')];
// come cardByName: nome intero, poi faccia frontale
const names: Record<string, number> = { [norm('Lightning Bolt')]: 0, [norm('Fire // Ice')]: 1, [norm('Delver of Secrets // Insectile Aberration')]: 2, [norm('Delver of Secrets')]: 2 };
const cardIdx = (n: string) => names[norm(n)] ?? names[norm(n.replace('/', ' // '))] ?? -1;
const all: [string, string][] = [['Lightning Bolt', 'l'], ['Fire // Ice', 'l'], ['Black Lotus', 'n'], ['Jace, Vryn\'s Prodigy // Jace, Telepath Unbound', 'n']];
const src = (over: Partial<NameSource> = {}): NameSource => ({ cards, cardIdx, all: allNamesIndex(all), ...over });

describe('preferite: aggiunta, rimozione, unione', () => {
  it('il cuore aggiunge in cima e toglie; la chiave è l\'oracle_id, o il nome per le carte mai giocate', () => {
    let { list, added } = toggleFav([], { n: 'Lightning Bolt', o: 'o-bolt' }, 1);
    expect(added).toBe(true);
    ({ list } = toggleFav(list, { n: 'Black Lotus' }, 2));
    expect(list.map((f) => f.n)).toEqual(['Black Lotus', 'Lightning Bolt']);
    expect(favKey(list[0])).toBe('n:black lotus');
    expect(favKey(list[1])).toBe('o:o-bolt');
    ({ list, added } = toggleFav(list, { n: 'Lightning Bolt', o: 'o-bolt' }, 3));
    expect(added).toBe(false);
    expect(list.map((f) => f.n)).toEqual(['Black Lotus']);
    expect(removeFav(list, 'n:black lotus')).toEqual([]);
  });

  it('l\'import unisce e non sostituisce: le già presenti si contano', () => {
    const have: Fav[] = [{ n: 'Lightning Bolt', o: 'o-bolt', at: 5 }];
    const r = mergeFavs(have, [{ n: 'Black Lotus', at: 9 }, { n: 'Lightning Bolt', o: 'o-bolt', at: 9 }]);
    expect(r).toEqual({ list: [{ n: 'Black Lotus', at: 9 }, { n: 'Lightning Bolt', o: 'o-bolt', at: 5 }], added: 1, already: 1 });
  });

  it('file salvato riconosciuto solo se valido', () => {
    expect(isFavFile({ v: 1, list: [{ n: 'A', at: 1 }] })).toBe(true);
    expect(isFavFile({ v: 2, list: [] })).toBe(false);
    expect(isFavFile({ v: 1, list: [{ n: 1, at: 1 }] })).toBe(false);
  });
});

describe('preferite: riconciliazione con i dati', () => {
  it('prima per oracle_id: una carta rinominata si ritrova e il nome salvato si aggiorna', () => {
    const r = reconcile([{ n: 'Lightning Bolt (vecchio nome)', o: 'o-bolt', at: 1 }], src());
    expect(r.changed).toBe(true);
    expect(r.list).toEqual([{ n: 'Lightning Bolt', o: 'o-bolt', at: 1 }]);
    expect(r.entries[0]).toMatchObject({ idx: 0, status: 'card' });
  });

  it('poi per nome: una carta mai giocata che entra in cards.json prende l\'oracle_id', () => {
    const r = reconcile([{ n: 'Fire // Ice', at: 1 }], src());
    expect(r.list).toEqual([{ n: 'Fire // Ice', o: 'o-fire', at: 1 }]);
    expect(r.changed).toBe(true);
  });

  it('carte mai giocate per nome; "non trovata" se il nome sparisce; in attesa senza cardnames.json', () => {
    const list: Fav[] = [{ n: 'Black Lotus', at: 2 }, { n: 'Carta Inesistente', at: 1 }];
    expect(reconcile(list, src()).entries.map((e) => e.status)).toEqual(['never', 'missing']);
    expect(reconcile(list, src({ all: null })).entries.map((e) => e.status)).toEqual(['pending', 'pending']);
    expect(reconcile(list, src()).changed).toBe(false);
  });

  it('due preferite che diventano la stessa carta: se ne tiene una', () => {
    const r = reconcile([{ n: 'Old Name', o: 'o-bolt', at: 2 }, { n: 'Lightning Bolt', at: 1 }], src());
    expect(r.list).toEqual([{ n: 'Lightning Bolt', o: 'o-bolt', at: 2 }]);
  });
});

describe('preferite: import ed export in testo', () => {
  const it_ = italianIndex(cards, [['Fulmine'], [], []], new Map([[2, ['Loto Nero']]]), all);

  it('nomi inglesi o italiani, con e senza numero, facce, "A/B", righe di una decklist', () => {
    const text = '1 Lightning Bolt\nFire/Ice\n4x Delver of Secrets (ISD) 51\n\nSideboard\n2 Loto Nero\nfulmine\nJace, Vryn\'s Prodigy\nCarta Inventata\n';
    const r = parseFavList(text, src({ italian: it_ }), 100);
    expect(r.favs.map((f) => f.n)).toEqual(['Lightning Bolt', 'Fire // Ice', 'Delver of Secrets // Insectile Aberration', 'Black Lotus',
      'Jace, Vryn\'s Prodigy // Jace, Telepath Unbound']);
    expect(r.favs.map((f) => f.o)).toEqual(['o-bolt', 'o-fire', 'o-delver', undefined, undefined]);
    // l'ordine della lista resta: la prima riga è la più recente
    expect(r.favs.map((f) => f.at)).toEqual([100, 99, 98, 97, 96]);
    expect(r.dups).toBe(1); // "fulmine" = Lightning Bolt
    expect(r.unknown).toEqual(['Carta Inventata']);
  });

  it('senza i nomi italiani un nome italiano non si riconosce', () => {
    expect(resolveName(src(), 'Fulmine')).toBeNull();
    expect(resolveName(src({ italian: it_ }), 'Fulminé')).toEqual({ n: 'Lightning Bolt', o: 'o-bolt' });
  });

  it('export "1 Nome", come la lista delle mancanti (nome completo delle carte con più facce)', () => {
    expect(favText([{ n: 'Fire // Ice', o: 'o-fire', at: 2 }, { n: 'Black Lotus', at: 1 }])).toBe('1 Fire // Ice\n1 Black Lotus\n');
    expect(favText([])).toBe('');
    // e l'export si reimporta uguale
    const back = parseFavList(favText([{ n: 'Fire // Ice', at: 2 }, { n: 'Black Lotus', at: 1 }]), src(), 50);
    expect(back.favs.map((f) => f.n)).toEqual(['Fire // Ice', 'Black Lotus']);
  });
});
