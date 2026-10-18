// Tiny DOM helpers (no framework).

/** Attribute values accepted by h(). null, undefined and false are skipped, true becomes an empty attribute. */
export type AttrValue = string | number | boolean | null | undefined | ((ev: Event) => void);
export type Attrs = Record<string, AttrValue>;
/** Child of h(): a node, text, a skipped value or a (nested) list of those. */
export type Kid = Node | string | number | boolean | null | undefined | readonly Kid[];

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style') el.style.cssText = String(v);
      else if (k === 'html') el.innerHTML = String(v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  appendKids(el, kids);
  return el;
}

function appendKids(el: HTMLElement, kids: readonly Kid[]): void {
  for (const kid of kids) {
    if (kid == null || kid === false) continue;
    if (Array.isArray(kid)) appendKids(el, kid as readonly Kid[]);
    else el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
}

// Per-element cache of the last value written, so unchanged values do not touch the DOM.
const cache = new WeakMap<object, Record<string, unknown>>();
function cacheOf(el: object): Record<string, unknown> {
  let c = cache.get(el);
  if (!c) { c = {}; cache.set(el, c); }
  return c;
}

// Only touch the DOM when the value changed (avoids layout work at 10 Hz).
export function setText(el: Node, value: unknown): void {
  const s = String(value);
  const c = cacheOf(el);
  if (c._v !== s) { c._v = s; el.textContent = s; }
}

export function setClass(el: Element, name: string, on: unknown): void {
  const b = !!on;
  const k = '_c_' + name;
  const c = cacheOf(el);
  if (c[k] !== b) { c[k] = b; el.classList.toggle(name, b); }
}

export function setProp<E extends HTMLElement, P extends keyof E>(el: E, prop: P, value: E[P]): void {
  const k = '_p_' + String(prop);
  const c = cacheOf(el);
  if (c[k] !== value) { c[k] = value; el[prop] = value; }
}

export function show(el: HTMLElement, on: unknown, display = ''): void {
  const b = !!on;
  const c = cacheOf(el);
  if (c._show !== b) { c._show = b; el.style.display = b ? display : 'none'; }
}
