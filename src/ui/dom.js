// Tiny DOM helpers (no framework).

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// Only touch the DOM when the value changed (avoids layout work at 10 Hz).
export function setText(el, value) {
  const s = String(value);
  if (el._v !== s) { el._v = s; el.textContent = s; }
}

export function setClass(el, name, on) {
  const b = !!on;
  const k = '_c_' + name;
  if (el[k] !== b) { el[k] = b; el.classList.toggle(name, b); }
}

export function setProp(el, prop, value) {
  const k = '_p_' + prop;
  if (el[k] !== value) { el[k] = value; el[prop] = value; }
}

export function show(el, on, display = '') {
  const b = !!on;
  if (el._show !== b) { el._show = b; el.style.display = b ? display : 'none'; }
}
