// Persistenza locale: IndexedDB per la collezione (può superare i limiti di localStorage),
// localStorage solo per piccole preferenze. Tutto con chiavi proprie: su GitHub Pages l'origine
// è condivisa con gli altri siti dello stesso utente, quindi niente localStorage.clear().

const DB = 'pauper-index';
const STORE = 'kv';
export const LS_PREFIX = 'pauper-index:';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise<T | undefined>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    }).finally(() => db.close());
  } catch {
    return undefined;
  }
}

export async function idbSet(key: string, value: unknown): Promise<boolean> {
  try {
    const db = await open();
    return await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    }).finally(() => db.close());
  } catch {
    return false;
  }
}

export function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(LS_PREFIX + key);
  } catch {
    return null;
  }
}

export function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(LS_PREFIX + key, value);
  } catch {
    /* modalità privata o spazio esaurito: si ignora */
  }
}

/** sessionStorage: dura quanto la scheda del browser (per esempio le carte già rispolverate). */
export function ssGet(key: string): string | null {
  try {
    return sessionStorage.getItem(LS_PREFIX + key);
  } catch {
    return null;
  }
}

export function ssSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(LS_PREFIX + key, value);
  } catch {
    /* ignora */
  }
}

/** "Cancella i miei dati": elimina il database IndexedDB e le chiavi localStorage e sessionStorage dell'app. */
export async function clearAll(): Promise<void> {
  for (const get of [() => localStorage, () => sessionStorage]) {
    try {
      const st = get();
      const keys: string[] = [];
      for (let i = 0; i < st.length; i++) {
        const k = st.key(i);
        if (k && k.startsWith(LS_PREFIX)) keys.push(k);
      }
      keys.forEach((k) => st.removeItem(k));
    } catch {
      /* ignora */
    }
  }
  await new Promise<void>((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(DB);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}
