// Carta in 3D: segue il puntatore con un'inclinazione morbida (al massimo circa 10 gradi) e un leggero sollevamento.
// Con il mouse finché il cursore è sulla carta; al tocco finché il dito è appoggiato. Torna piatta all'uscita
// o al rilascio, e a riposo è sempre piatta.
//
// Regole di Scryfall: nessun riflesso o livello sopra l'immagine. La profondità viene solo dall'ombra sotto la
// carta, che si sposta al contrario del lato sollevato. Prestazioni: solo transform e box-shadow aggiornati con
// requestAnimationFrame; la posizione della carta si misura una volta all'inizio dell'interazione.

const MAX = 10; // gradi
const EASE = 0.16; // quanto si avvicina al valore voluto a ogni fotogramma
const EASE_FLAT = 0.35; // prima di una nuova pesca: torna piatta in circa 150 ms, sempre dolcemente
const DRAG_PX = 8; // oltre questo spostamento del dito il tocco non apre la scheda

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface Tilt {
  /** Torna piatta dolcemente e ignora il puntatore (durante l'animazione di una nuova pesca). */
  pause(): void;
  resume(): void;
}

export function enableTilt(stage: HTMLElement): Tilt {
  stage.classList.add('tilt');
  let paused = false;
  let ease = EASE;
  let rect: DOMRect | null = null;
  let target = { rx: 0, ry: 0, lift: 0 };
  const cur = { rx: 0, ry: 0, lift: 0 };
  let raf = 0;
  let touchId: number | null = null;
  let start: [number, number] = [0, 0];

  const apply = () => {
    if (Math.abs(cur.rx) < 0.01 && Math.abs(cur.ry) < 0.01 && cur.lift < 0.002) {
      // perfettamente piatta: niente trasformazione né ombra modificata
      stage.style.removeProperty('transform');
      stage.style.removeProperty('box-shadow');
      return;
    }
    stage.style.setProperty('transform',
      `perspective(900px) rotateX(${cur.rx.toFixed(2)}deg) rotateY(${cur.ry.toFixed(2)}deg) scale(${(1 + 0.035 * cur.lift).toFixed(4)})`);
    // ombra al contrario del lato sollevato, più profonda quando la carta si solleva
    const x = cur.ry * 1.3;
    const y = 18 - cur.rx * 1.3 + 10 * cur.lift;
    stage.style.setProperty('box-shadow',
      `${x.toFixed(1)}px ${y.toFixed(1)}px ${(40 + 26 * cur.lift).toFixed(1)}px -18px rgba(16,24,40,${(0.55 + 0.15 * cur.lift).toFixed(2)})`);
  };

  const tick = () => {
    cur.rx += (target.rx - cur.rx) * ease;
    cur.ry += (target.ry - cur.ry) * ease;
    cur.lift += (target.lift - cur.lift) * ease;
    const done = Math.abs(target.rx - cur.rx) < 0.01 && Math.abs(target.ry - cur.ry) < 0.01 && Math.abs(target.lift - cur.lift) < 0.002;
    if (done) Object.assign(cur, target);
    apply();
    raf = done ? 0 : requestAnimationFrame(tick);
  };
  const run = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };

  const aim = (x: number, y: number) => {
    if (!rect || paused || reduced()) return;
    ease = EASE;
    const px = Math.min(1, Math.max(0, (x - rect.left) / rect.width));
    const py = Math.min(1, Math.max(0, (y - rect.top) / rect.height));
    // il punto sotto il puntatore viene verso chi guarda
    target = { rx: (py - 0.5) * 2 * MAX, ry: (0.5 - px) * 2 * MAX, lift: 1 };
    run();
  };
  const flat = () => {
    rect = null;
    touchId = null;
    target = { rx: 0, ry: 0, lift: 0 };
    run();
  };

  stage.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'touch') return;
    rect = stage.getBoundingClientRect();
  });
  stage.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') {
      if (e.pointerId !== touchId) return;
      if (Math.hypot(e.clientX - start[0], e.clientY - start[1]) > DRAG_PX) stage.dataset.dragged = '1';
    } else if (!rect) rect = stage.getBoundingClientRect();
    aim(e.clientX, e.clientY);
  });
  stage.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'touch') flat();
  });
  // al tocco: la carta segue il dito finché è appoggiato (touch-action: none solo sulla carta, la pagina scorre normalmente)
  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || paused || reduced()) return;
    touchId = e.pointerId;
    start = [e.clientX, e.clientY];
    delete stage.dataset.dragged;
    rect = stage.getBoundingClientRect();
    stage.setPointerCapture?.(e.pointerId);
    aim(e.clientX, e.clientY);
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    stage.addEventListener(ev, (e) => {
      if (e.pointerType === 'touch' && e.pointerId === touchId) flat();
    });
  }
  return {
    pause() {
      paused = true;
      ease = EASE_FLAT;
      flat();
    },
    resume() {
      paused = false;
      ease = EASE;
    },
  };
}
