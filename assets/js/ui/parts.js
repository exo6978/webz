// Pieces shared by every view: the framed print, the listing card, a press's
// chop mark, and toasts.

import { getPress, paperOf, inkOf, remaining, formatSize, formatPrice, TECHNIQUES, PRESSES } from '../data.js';
import { mountThumb } from '../art/thumbs.js';
import { lightUp } from '../fx/light.js';
import { isSaved } from '../store.js';
import { $, html, raw, node } from '../util.js';
import { icon } from '../icons.js';

// A print in a frame (or, with finish "none", a bare sheet taped up).
export function frameEl(print, { finish = print.frame, tilt = false } = {}) {
  const frame = document.createElement('span');
  frame.className = 'frame';
  frame.dataset.finish = finish;
  if (tilt) frame.dataset.tilt = '';
  frame.style.setProperty('--ar', (print.size[0] / print.size[1]).toFixed(4));
  frame.style.setProperty('--paper', paperOf(print).hex);
  frame.innerHTML =
    '<span class="print"><img alt="" draggable="false"></span><span class="frame__glass"></span>';
  mountThumb(frame.firstElementChild, print);
  lightUp(frame);
  return frame;
}

export const inkDots = (print) =>
  html`<span class="inks" role="img" aria-label="Inks: ${print.inks.map((id) => inkOf(id).name).join(', ')}"
    >${print.inks.map((id) => html`<i style="--c:${inkOf(id).hex}"></i>`)}</span
  >`;

// The listing card: a frame on the wall with its label underneath.
export function cardEl(print) {
  const press = getPress(print.press);
  const left = remaining(print);
  const technique = TECHNIQUES[print.technique].name;
  const card = node(html`
    <article class="card${left === 0 ? ' is-soldout' : ''}" data-id="${print.id}">
      <div class="card__wall">
        <a
          class="card__link"
          href="#print-${print.id}"
          data-cursor="view"
          aria-label="${print.title}, ${technique.toLowerCase()} by ${press.name}"
        ></a>
        ${left === 0 ? html`<span class="tag">Sold out</span>` : ''}
        <button
          class="card__save icon-btn"
          type="button"
          data-action="save"
          data-id="${print.id}"
          aria-pressed="${String(isSaved(print.id))}"
          aria-label="Save ${print.title}"
        >
          ${icon('heart', 'heart')}
        </button>
        ${left > 0
          ? html`<button
              class="card__add icon-btn"
              type="button"
              data-action="add"
              data-id="${print.id}"
              aria-label="Add ${print.title} to bag, unframed"
            >
              ${icon('plus')}
            </button>`
          : ''}
      </div>
      <div class="label">
        <h3 class="label__title"><a href="#print-${print.id}" tabindex="-1">${print.title}</a></h3>
        <p class="label__by">${press.name}, ${press.city}</p>
        <p class="label__meta">${technique} · ${formatSize(print)} · ed. ${print.edition}</p>
        <div class="label__foot">
          ${inkDots(print)} ${left > 0 && left <= 5 ? html`<span class="stock">${left} left</span>` : ''}
          <span class="price">${formatPrice(print.price)}</span>
        </div>
      </div>
    </article>
  `);
  $('.card__link', card).append(frameEl(print, { tilt: true }));
  return card;
}

// ---- chop marks ----

const SHAPES = [
  '<circle cx="24" cy="24" r="21"/>',
  '<rect x="4" y="4" width="40" height="40" rx="7"/>',
  '<path d="M24 2 46 24 24 46 2 24Z"/>',
  '<path d="M24 2.5 42.6 13.2v21.6L24 45.5 5.4 34.8V13.2Z"/>',
];

const initials = (name) =>
  name
    .split(/[\s&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();

function isLight(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 150;
}

export function chop(press) {
  const colour = inkOf(press.ink).hex;
  const shape = SHAPES[PRESSES.indexOf(press) % SHAPES.length];
  const text = isLight(colour) ? '#14162c' : '#ffffff';
  return raw(
    `<svg class="chop" viewBox="0 0 48 48" aria-hidden="true"><g fill="${colour}">${shape}</g>` +
      `<g fill="none" stroke="${text}" stroke-opacity=".45" transform="translate(24 24) scale(.84) translate(-24 -24)">${shape}</g>` +
      `<text x="24" y="29.4" text-anchor="middle" fill="${text}">${initials(press.name)}</text></svg>`,
  );
}

// ---- toasts ----

export function toast(message, { label, onAction } = {}) {
  const host = $('#toasts');
  const el = node(
    html`<div class="toast">
      <span>${message}</span>${label ? html`<button class="link" type="button">${label}</button>` : ''}
    </div>`,
  );
  const dismiss = () => {
    if (!el.isConnected || el.classList.contains('is-leaving')) return;
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 320);
  };
  if (label) {
    $('button', el).addEventListener('click', () => {
      dismiss();
      onAction?.();
    });
  }
  while (host.children.length >= 2) host.firstElementChild.remove();
  host.append(el);
  setTimeout(dismiss, 3600);
}
