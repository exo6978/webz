// Boot: wire up the page chrome, build the home view, then hand over to the router.

import { getPrint } from './data.js';
import { addToBag, toggleSaved, savedIds, on } from './store.js';
import { $, $$, action, listenForActions, save, motionOK } from './util.js';
import { initLight } from './fx/light.js';
import { initCursor, flyToBag, transition } from './fx/motion.js';
import { thumbUrl } from './art/thumbs.js';
import { toast } from './ui/parts.js';
import { initBrowse } from './ui/browse.js';
import { initHero, initPresses, initSell } from './ui/home.js';
import { initBag, openBag, bumpBag } from './ui/bag.js';
import { initDetail, currentFinish } from './ui/detail.js';
import { initRouter } from './router.js';

// ---------- lights ----------
// The switch flips between day and night. Where the browser can, the new theme
// opens out in a circle from the switch itself.

function isDark() {
  const set = document.documentElement.dataset.theme;
  return set ? set === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function initLights() {
  const button = $('#lights');
  const label = () => button.setAttribute('aria-label', isDark() ? 'Turn the lights on' : 'Turn the lights off');
  label();
  action('lights', () => {
    const next = isDark() ? 'light' : 'dark';
    const r = button.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const { ready } = transition(() => {
      document.documentElement.dataset.theme = next;
      save('theme', next);
      label();
    }, 'lights');
    ready.then((animated) => {
      if (!animated) return;
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 650, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
      );
    });
  });
}

// ---------- saving and adding ----------

function initShopping() {
  action('save', (el) => {
    const id = el.dataset.id;
    const saved = toggleSaved(id);
    if (saved && motionOK()) {
      el.classList.remove('is-pop');
      void el.offsetWidth;
      el.classList.add('is-pop');
    }
  });

  const syncSaved = () => {
    const ids = new Set(savedIds());
    $$('[data-action="save"]').forEach((button) => button.setAttribute('aria-pressed', String(ids.has(button.dataset.id))));
    const count = $('#saved-count');
    count.textContent = ids.size;
    count.hidden = ids.size === 0;
    $('#saved-button').classList.toggle('has-saved', ids.size > 0);
  };
  on('saved', syncSaved);
  syncSaved();

  action('add', (el) => {
    const print = getPrint(el.dataset.id);
    const fromListing = el.id === 'buy-add';
    const frame = fromListing ? currentFinish() : 'none';
    if (!addToBag(print.id, frame)) {
      toast(`Every copy left of "${print.title}" is already in your bag.`, { label: 'View bag', onAction: openBag });
      return;
    }
    const sheet = fromListing ? $('#view-print .stage .print') : el.closest('.card')?.querySelector('.print');
    flyToBag(sheet, thumbUrl(print)).then(bumpBag);
    toast(`"${print.title}" is in your bag.`, { label: 'View bag', onAction: openBag });
  });
}

// ---------- search shortcut ----------

function initSearch() {
  const focus = () => {
    const input = $('#search');
    if ($('#view-home').hidden) {
      location.hash = 'prints';
      setTimeout(() => input.focus(), 450);
    } else {
      $('#prints').scrollIntoView();
      input.focus({ preventScroll: true });
    }
  };
  action('focus-search', focus);
  document.addEventListener('keydown', (event) => {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target.closest?.('input, select, textarea')) return;
    event.preventDefault();
    focus();
  });
}

listenForActions();
initLight();
initCursor();
initLights();
initHero();
initBrowse();
initPresses();
initSell();
initBag();
initDetail();
initShopping();
initSearch();
initRouter();
