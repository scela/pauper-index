// Conteggio anonimo delle visite con GoatCounter (dashboard https://albafvcens.goatcounter.com).
// - count.js è copiato nel repository (web/public/count.js, licenza ISC) e servito dal sito;
// - si carica solo sul dominio pubblicato e mai nei browser automatizzati (test): in locale, in anteprima
//   e in CI non parte nessuna richiesta, nemmeno quella di count.js;
// - si inviano solo la pagina (il percorso canonico "/") e i nomi fissi degli eventi qui sotto: mai nomi di carte,
//   dati della collezione, filtri o testo inserito. Nessun cookie; il conteggio non scrive nel localStorage
//   (count.js legge solo la chiave "skipgc", impostata da chi visita /#toggle-goatcounter per escludersi).

import { h } from './dom';

export const GC_HOST = 'pauperindex.com';
export const GC_ENDPOINT = 'https://albafvcens.goatcounter.com/count';
export const GC_SCRIPT = '/count.js';

/** Eventi contati: ciascuno al massimo una volta per pagina caricata. */
export const GC_EVENTS = [
  'collezione-caricata', 'controllo-rapido', 'filtro-espansione', 'carta-dimenticata', 'mazzi', 'export', 'ko-fi',
] as const;
export type GcEvent = (typeof GC_EVENTS)[number];

export interface GcVars { path: string; title: string; referrer: string; event: true }
type GcCount = (vars: GcVars) => void;

/** Si conta solo sul sito pubblicato (www reindirizza al dominio principale) e mai con un browser automatizzato. */
export function shouldCount(hostname: string, webdriver: boolean): boolean {
  return hostname === GC_HOST && !webdriver;
}

/**
 * Coda degli eventi: ognuno si invia una volta sola; quelli arrivati prima che count.js sia pronto
 * partono quando lo diventa (flush).
 */
export function makeTracker(counter: () => GcCount | undefined) {
  const sent = new Set<GcEvent>();
  const pending: GcEvent[] = [];
  const send = (name: GcEvent, count: GcCount) => count({ path: name, title: name, referrer: '', event: true });
  return {
    track(name: GcEvent): void {
      if (sent.has(name)) return;
      sent.add(name);
      const count = counter();
      if (count) send(name, count);
      else pending.push(name);
    },
    flush(): void {
      const count = counter();
      if (!count) return;
      for (const name of pending.splice(0)) send(name, count);
    },
  };
}

interface GcWindow { goatcounter?: { count?: GcCount } }
let tracker: ReturnType<typeof makeTracker> | null = null;

/** Carica count.js (che conta la visita della pagina) se siamo sul sito pubblicato. */
export function initAnalytics(): void {
  if (!shouldCount(location.hostname, navigator.webdriver === true)) return;
  const w = window as unknown as GcWindow;
  tracker = makeTracker(() => (w.goatcounter?.count ? (v) => w.goatcounter!.count!(v) : undefined));
  // no_events: niente conteggio automatico dei clic (data-goatcounter-click), solo gli eventi di GC_EVENTS
  document.head.append(h('script', {
    async: true, src: GC_SCRIPT, onload: () => tracker?.flush(),
    dataset: { goatcounter: GC_ENDPOINT, goatcounterSettings: JSON.stringify({ no_events: true }) },
  }));
  // link a Ko-fi (piè di pagina e Informazioni): anche con il clic centrale
  for (const type of ['click', 'auxclick']) {
    document.addEventListener(type, (e) => {
      if ((e.target as Element | null)?.closest?.('a[href^="https://ko-fi.com/"]')) track('ko-fi');
    }, true);
  }
}

/** Conta l'uso di una funzione (solo il nome dell'evento). Fuori dal sito pubblicato non fa nulla. */
export function track(name: GcEvent): void {
  tracker?.track(name);
}
