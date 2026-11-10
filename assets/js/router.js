// Routing. The site is one page with four views, picked by the hash:
//   (none), #prints, #presses, #sell   the home page, scrolled to that section
//   #print-<id>                        a listing
//   #press-<id>                        a press
//   #saved                             saved prints
// Moving between views runs as a view transition; opening a listing carries the
// sheet itself across from the card that was clicked.

import { getPrint, getPress } from './data.js';
import { $, action, inViewport } from './util.js';
import { transition } from './fx/motion.js';
import { renderPrint, teardownPrint, printEntered, stagePrint, printNeighbours } from './ui/detail.js';
import { renderPress, renderSaved } from './ui/pages.js';

const views = {
  home: $('#view-home'),
  print: $('#view-print'),
  press: $('#view-press'),
  saved: $('#view-saved'),
};

let current = { view: 'home', id: null, hash: '' };
let homeScroll = 0;
let homeHash = '';
let source = null; // the sheet that was clicked, to carry into the listing
let backIsHome = false; // true when the previous history entry is the wall

function parse(hash) {
  const h = decodeURIComponent(hash.replace(/^#/, ''));
  if (h.startsWith('print-') && getPrint(h.slice(6))) return { view: 'print', id: h.slice(6), hash: h };
  if (h.startsWith('press-') && getPress(h.slice(6))) return { view: 'press', id: h.slice(6), hash: h };
  if (h === 'saved') return { view: 'saved', id: null, hash: h };
  return { view: 'home', id: null, hash: h };
}

function jump(y) {
  const root = document.documentElement;
  const was = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  if (typeof y === 'number') window.scrollTo(0, y);
  else y?.scrollIntoView();
  root.style.scrollBehavior = was;
}

function swap(next) {
  if (current.view === 'home') {
    homeScroll = window.scrollY;
    homeHash = current.hash;
  }
  for (const [name, el] of Object.entries(views)) el.hidden = name !== next.view;
  if (current.view === 'print' && next.view !== 'print') {
    teardownPrint();
    views.print.replaceChildren();
  }

  if (next.view === 'print') renderPrint(views.print, next.id);
  else if (next.view === 'press') renderPress(views.press, next.id);
  else if (next.view === 'saved') renderSaved(views.saved);

  if (next.view !== 'home') jump(0);
  else if (next.hash === homeHash) jump(homeScroll);
  else jump(next.hash && next.hash !== 'top' ? document.getElementById(next.hash) : 0);
}

function go(next) {
  const prev = current;
  // Same view, different section: the browser scrolls there by itself.
  if (prev.view === 'home' && next.view === 'home') {
    current = next;
    if (!next.hash || next.hash === 'top') window.scrollTo({ top: 0 });
    return;
  }

  let nav = '';
  let from = null;
  if (next.view === 'print' && prev.view === 'print') {
    const near = printNeighbours();
    nav = near?.prev === next.id && near?.next !== next.id ? 'prev' : 'next';
  } else if (next.view === 'print') {
    from = source?.isConnected && inViewport(source) ? source : null;
  } else if (prev.view === 'print' && next.view === 'home') {
    from = stagePrint();
  }
  source = null;

  // The sheet keeps one transition name on both sides of the change, so the
  // browser moves it from where it was to where it lands.
  let to = null;
  if (from) from.style.viewTransitionName = 'print';
  const { finished } = transition(() => {
    if (from) from.style.viewTransitionName = '';
    swap(next);
    current = next;
    if (!from) return;
    if (next.view === 'print') to = stagePrint();
    else {
      const sheet = $(`#grid .card[data-id="${prev.id}"] .print`);
      if (sheet && inViewport(sheet)) to = sheet;
    }
    if (to) to.style.viewTransitionName = 'print';
  }, nav);

  finished.then(() => {
    if (to) to.style.viewTransitionName = '';
    if (current.view === 'print') printEntered();
    if (current.view !== 'home') $('h1', views[current.view])?.focus({ preventScroll: true });
  });
}

export function initRouter() {
  // Remember which sheet was clicked so it can travel to the listing page.
  document.addEventListener(
    'click',
    (event) => {
      const link = event.target.closest?.('a[href^="#print-"]');
      source = link ? (link.querySelector('.print') ?? link.closest('.card')?.querySelector('.print') ?? null) : null;
    },
    true,
  );

  // "All prints" returns to exactly where the shopper was, if they came from the wall.
  action('back', (el, event) => {
    if (backIsHome) {
      event.preventDefault();
      history.back();
    }
  });

  window.addEventListener('hashchange', () => {
    const next = parse(location.hash);
    backIsHome = current.view === 'home' && next.view !== 'home';
    go(next);
  });

  const first = parse(location.hash);
  if (first.view === 'home') {
    current = first;
    if (first.hash) requestAnimationFrame(() => jump(document.getElementById(first.hash)));
  } else {
    swap(first);
    current = first;
    if (first.view === 'print') printEntered();
  }
}
