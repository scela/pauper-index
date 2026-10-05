// Costruzione del DOM senza interpretare HTML: il testo passa sempre da textContent / nodi di testo.
// È l'unico modo previsto per creare elementi nell'app (vedi tests/security.test.ts).

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown> & {
  class?: string;
  text?: string;
  dataset?: Record<string, string>;
  style?: Record<string, string>;
};

const URL_ATTRS = new Set(['href', 'src']);

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'text') el.textContent = String(v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style') for (const [p, sv] of Object.entries(v as Record<string, string>)) el.style.setProperty(p, sv);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else if (URL_ATTRS.has(k)) el.setAttribute(k, safeUrl(String(v)));
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, ...children);
  return el;
}

export function append(el: Node, ...children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

/** Solo URL relativi, https, blob: e mailto: (niente javascript:). */
export function safeUrl(u: string): string {
  const s = u.trim();
  if (/^(https:|blob:|mailto:)/i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return '#';
  return s;
}

export function $(sel: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`elemento mancante: ${sel}`);
  return el;
}
