// The bag: a drawer that slides in from the right. Checkout is a demo and says so.

import { getPrint, getPress, FRAMES, formatPrice, remaining } from '../data.js';
import { getBag, bagCount, bagTotal, linePrice, lineKey, changeQty, removeLine, clearBag, canAdd, on } from '../store.js';
import { $, $$, html, action } from '../util.js';
import { frameEl } from './parts.js';

let open = false;
let placed = false; // showing the "demo order placed" message
let opener = null;

const OUTSIDE = ['.site-header', 'main', '.site-footer'];

function render() {
  const body = $('#bag-body');
  const foot = $('#bag-foot');
  const lines = getBag();

  if (placed) {
    body.innerHTML = html`<div class="bag__done">
      <h3 class="display">Demo order placed</h3>
      <p>Overprint is a concept demo, so nothing was charged and nothing will ship. On a live site the presses would now be wrapping your prints.</p>
    </div>`;
    foot.innerHTML = html`<button class="btn btn--primary btn--wide" type="button" data-action="close-bag">Back to the wall</button>`;
    return;
  }
  if (!lines.length) {
    body.innerHTML = html`<div class="bag__empty">
      <h3 class="display">Nothing here yet</h3>
      <p>Prints you add will wait here. Each one is taken from a numbered edition, so the bag never holds more copies than are left.</p>
    </div>`;
    foot.innerHTML = html`<a class="btn btn--ghost btn--wide" href="#prints" data-action="close-bag">Browse the prints</a>`;
    return;
  }

  body.innerHTML = html`<ul>
    ${lines.map((line, n) => {
      const print = getPrint(line.id);
      const press = getPress(print.press);
      const key = lineKey(line);
      return html`<li class="line" data-key="${key}" style="--n:${n}">
        <span class="line__thumb"></span>
        <div>
          <a class="line__title" href="#print-${print.id}" data-action="close-bag">${print.title}</a>
          <p class="line__meta">${press.name} · ${line.frame === 'none' ? 'Unframed' : `${FRAMES[line.frame].name} frame`}</p>
        </div>
        <span class="line__price">${formatPrice(linePrice(line))}</span>
        <div class="line__tools">
          <span class="qty">
            <button type="button" data-action="qty" data-key="${key}" data-delta="-1" aria-label="One fewer of ${print.title}">−</button>
            <output aria-label="Quantity">${line.qty}</output>
            <button
              type="button"
              data-action="qty"
              data-key="${key}"
              data-delta="1"
              aria-label="One more of ${print.title}"
              ${canAdd(print.id) ? '' : 'disabled'}
              title="${canAdd(print.id) ? '' : `Only ${remaining(print)} left in this edition`}"
            >
              +
            </button>
          </span>
          <button class="link" type="button" data-action="remove-line" data-key="${key}">Remove</button>
        </div>
      </li>`;
    })}
  </ul>`;
  $$('.line', body).forEach((el, i) => {
    const line = lines[i];
    $('.line__thumb', el).append(frameEl(getPrint(line.id), { finish: line.frame }));
  });

  foot.innerHTML = html`
    <p class="bag__total"><span>Subtotal</span><b>${formatPrice(bagTotal())}</b></p>
    <p class="bag__note">Postage is set by each press and added at checkout. This is a demo: checking out takes no payment.</p>
    <button class="btn btn--primary btn--wide" type="button" data-action="checkout">Check out</button>
  `;
}

function setOpen(next) {
  if (open === next) return;
  open = next;
  const drawer = $('#bag');
  drawer.classList.toggle('is-open', open);
  drawer.inert = !open;
  $('#scrim').classList.toggle('is-open', open);
  OUTSIDE.forEach((selector) => {
    const el = $(selector);
    if (el) el.inert = open;
  });
  if (open) {
    opener = document.activeElement;
    render();
    $('[data-action="close-bag"]', drawer).focus({ preventScroll: true });
  } else {
    if (placed) {
      placed = false;
      clearBag();
    }
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  }
}

export const openBag = () => setOpen(true);

export function initBag() {
  action('open-bag', () => setOpen(true));
  action('close-bag', () => setOpen(false));
  action('qty', (el) => changeQty(el.dataset.key, Number(el.dataset.delta)));
  action('remove-line', (el) => removeLine(el.dataset.key));
  action('checkout', () => {
    placed = true;
    render();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) setOpen(false);
  });

  const badge = $('#bag-count');
  const sync = () => {
    const n = bagCount();
    if (badge.textContent !== String(n)) {
      badge.textContent = n;
      badge.animate?.(
        [
          { transform: 'translateY(70%)', opacity: 0 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 300, easing: 'cubic-bezier(0.3, 1.5, 0.5, 1)' },
      );
    }
    $('#bag-button').setAttribute('aria-label', `Open bag, ${n} ${n === 1 ? 'print' : 'prints'}`);
    if (open && !placed) render();
  };
  on('bag', sync);
  sync();
}

// The bag button gives a small kick when something lands in it.
export function bumpBag() {
  const button = $('#bag-button');
  button.classList.remove('is-bump');
  void button.offsetWidth;
  button.classList.add('is-bump');
}
