// Movement effects: the cursor companion, grid reflow, the print flying to the
// bag, and transitions between views.

import { $, motionOK, finePointer, inViewport } from '../util.js';

// ---------- cursor companion ----------
// A registration mark that trails the pointer. Over a print it opens into a
// two-ink disc that says what a click will do.

export function initCursor() {
  const el = $('.cursor');
  if (!el || !finePointer() || !motionOK()) return;
  const label = $('.cursor__disc span', el);
  const at = { x: 0, y: 0 };
  const goal = { x: 0, y: 0 };
  let shown = false;
  let raf = 0;

  const frame = () => {
    at.x += (goal.x - at.x) * 0.24;
    at.y += (goal.y - at.y) * 0.24;
    el.style.transform = `translate3d(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px, 0)`;
    raf = Math.abs(goal.x - at.x) + Math.abs(goal.y - at.y) > 0.2 ? requestAnimationFrame(frame) : 0;
  };

  window.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType !== 'mouse') return;
      goal.x = event.clientX;
      goal.y = event.clientY;
      if (!shown) {
        at.x = goal.x;
        at.y = goal.y;
        shown = true;
        el.classList.add('is-on');
      }
      const target = event.target instanceof Element ? event.target : null;
      const marked = target?.closest('[data-cursor]');
      if (marked) {
        el.dataset.mode = marked.dataset.cursor;
        if (marked.dataset.cursorLabel) label.textContent = marked.dataset.cursorLabel;
        else label.textContent = 'View';
      } else {
        el.dataset.mode = target?.closest('a, button, input, select, label, summary') ? 'link' : '';
      }
      if (!raf) raf = requestAnimationFrame(frame);
    },
    { passive: true },
  );
  document.documentElement.addEventListener('pointerleave', () => {
    shown = false;
    el.classList.remove('is-on');
  });
}

// ---------- FLIP ----------
// Measure, change the DOM, then animate every element from where it was to where
// it now is. Elements that were hidden before fade in.

export function flip(elements, mutate) {
  if (!motionOK()) {
    mutate();
    return;
  }
  const before = new Map();
  for (const el of elements) {
    if (!el.hidden) before.set(el, el.getBoundingClientRect());
  }
  mutate();
  for (const el of elements) {
    if (el.hidden) continue;
    const from = before.get(el);
    const to = el.getBoundingClientRect();
    const visibleNow = to.bottom > -100 && to.top < innerHeight + 100;
    if (!from) {
      if (visibleNow) {
        el.animate(
          [
            { opacity: 0, transform: 'scale(0.94)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: 380, delay: 80, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' },
        );
      }
      continue;
    }
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    const wasVisible = from.bottom > -100 && from.top < innerHeight + 100;
    if ((dx || dy) && (visibleNow || wasVisible)) {
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
        duration: 520,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      });
    }
  }
}

// ---------- fly to bag ----------

export function flyToBag(source, url) {
  const target = $('#bag-button');
  if (!motionOK() || !source || !target || !url || !inViewport(source)) return Promise.resolve();
  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const ghost = document.createElement('img');
  ghost.className = 'fly';
  ghost.alt = '';
  ghost.src = url;
  Object.assign(ghost.style, {
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
  });
  document.body.append(ghost);

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const shrink = Math.max(0.06, 22 / from.width);
  // A quadratic arc: up first, then across.
  const cx = dx * 0.15;
  const cy = dy * 0.9;
  const frames = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const x = 2 * (1 - t) * t * cx + t * t * dx;
    const y = 2 * (1 - t) * t * cy + t * t * dy;
    const s = 1 + (shrink - 1) * t * t;
    frames.push({
      transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(3)}) rotate(${(t * 14).toFixed(1)}deg)`,
      opacity: t > 0.85 ? 1 - (t - 0.85) * 4 : 1,
    });
  }
  return ghost
    .animate(frames, { duration: 760, easing: 'cubic-bezier(0.45, 0, 0.3, 1)' })
    .finished.catch(() => {})
    .then(() => ghost.remove());
}

// ---------- view transitions ----------
// Runs `update` inside a view transition where the browser has them, and plainly
// where it does not. `nav` labels the kind of move for the CSS (next, prev, lights).

export function transition(update, nav = '') {
  if (!document.startViewTransition || !motionOK()) {
    update();
    return { ready: Promise.resolve(false), finished: Promise.resolve() };
  }
  const root = document.documentElement;
  if (nav) root.dataset.nav = nav;
  else delete root.dataset.nav;
  const vt = document.startViewTransition(update);
  const finished = vt.finished
    .catch(() => {})
    .then(() => {
      if (root.dataset.nav === nav) delete root.dataset.nav;
    });
  return { ready: vt.ready.then(() => true).catch(() => false), finished };
}
