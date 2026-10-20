// Preferite salvate nel browser: IndexedDB (chiave "favorites"), come la collezione ma in una chiave a sé, così
// "Rimuovi collezione" non le tocca; "Cancella i miei dati" elimina tutto il database e quindi anche loro.
// Ogni modifica rilegge la lista salvata prima di scriverla: due schede aperte non si cancellano le aggiunte.

import { isFavFile, type Fav, type FavFile } from './favorites';
import { idbGet, idbSet } from './store';

const KEY = 'favorites';

export async function readFavs(): Promise<Fav[]> {
  const f = await idbGet<unknown>(KEY);
  return isFavFile(f) ? f.list : [];
}

let queue: Promise<unknown> = Promise.resolve();

/** Applica `fn` alla lista salvata e la riscrive (le modifiche della stessa scheda vanno in fila). */
export function updateFavs(fn: (list: Fav[]) => Fav[]): Promise<{ list: Fav[]; ok: boolean }> {
  const run = queue.then(async () => {
    const list = fn(await readFavs());
    const ok = await idbSet(KEY, { v: 1, list } satisfies FavFile);
    return { list, ok };
  });
  queue = run.catch(() => undefined);
  return run;
}
