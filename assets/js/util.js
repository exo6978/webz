// Small shared helpers: DOM lookup, safe HTML templates, storage, click actions.

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
export const motionOK = () => !reduceMotion.matches;
export const finePointer = () => fine.matches;

// ---- templates ----
// html`<p>${text}</p>` escapes every interpolated value. Nested html`` results,
// raw() strings and arrays of either are inserted as they are.

class Safe extends String {}
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ENTITIES[c]);
export const raw = (markup) => new Safe(markup);

function render(value) {
  if (value == null || value === false || value === true) return '';
  if (Array.isArray(value)) return value.map(render).join('');
  if (value instanceof Safe) return value.toString();
  return esc(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, i) => {
    out += render(value) + strings[i + 1];
  });
  return new Safe(out);
}

// Build one element from markup.
export function node(markup) {
  const template = document.createElement('template');
  template.innerHTML = String(markup).trim();
  return template.content.firstElementChild;
}

// ---- storage (never trusted to exist) ----

const PREFIX = 'overprint:';
export function load(key, fallback) {
  try {
    const value = localStorage.getItem(PREFIX + key);
    return value == null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}
export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* private window or blocked storage: the page works without it */
  }
}

// ---- click actions ----
// Any element with data-action="name" runs the handler registered under that name.

const actions = new Map();
export const action = (name, handler) => actions.set(name, handler);

export function listenForActions() {
  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target || target.disabled) return;
    const handler = actions.get(target.dataset.action);
    if (handler) handler(target, event);
  });
}

// ---- motion ----

// Ease a number from one value to another, calling back with each step.
export function tween(from, to, ms, onStep) {
  if (!motionOK() || from === to) {
    onStep(to);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = clamp((now - start) / ms);
    onStep(from + (to - from) * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

export const idle = () =>
  new Promise((resolve) => {
    if ('requestIdleCallback' in window) requestIdleCallback(() => resolve(), { timeout: 400 });
    else setTimeout(resolve, 16);
  });

export const inViewport = (el, margin = 0) => {
  const r = el.getBoundingClientRect();
  return r.bottom > -margin && r.top < innerHeight + margin && r.right > -margin && r.left < innerWidth + margin && r.width > 0;
};
