// The rest of the home page: the hero wall, the press directory and the
// payout calculator.

import { PRINTS, PRESSES, TECHNIQUES, getPrint, getPress, printsByPress, formatPrice } from '../data.js';
import { $, html, node, motionOK, finePointer, tween } from '../util.js';
import { frameEl, chop } from './parts.js';
import { icon } from '../icons.js';

// ---------- hero ----------

// A salon hang. x and y are the top-left corner of each piece in centimetres;
// widths and heights come from the prints themselves, so the wall is to scale.
const HANG = [
  ['ampersand-sixty-line', 0, 24],
  ['thirteen-moons', 4, 86],
  ['low-sun-second-field', 46, 0],
  ['far-hills-morning', 52, 84],
  ['interference-ii', 108, 10],
  ['plaid-for-a-picnic', 160, 8],
  ['soft-collision', 108, 64],
  ['corner-shop-tiles', 148, 66],
];
const MOULDING = 2; // cm

export function initHero() {
  $('#hero-count').textContent = `${PRINTS.length} prints from ${PRESSES.length} presses`;

  // Headline: clone the text into three passes that slide into register.
  const title = $('.hero__title');
  const base = document.createElement('span');
  base.className = 'reg__base';
  base.append(...title.childNodes);
  title.append(base);
  for (let i = 0; i < 3; i++) {
    const pass = base.cloneNode(true);
    pass.className = 'reg__pass';
    pass.setAttribute('aria-hidden', 'true');
    title.append(pass);
  }
  if (motionOK()) title.classList.add('is-live');

  // The wall.
  const wall = $('#wall');
  const pieces = HANG.map(([id, x, y]) => {
    const print = getPrint(id);
    const m = print.frame === 'none' ? 0 : MOULDING;
    return { print, x, y, w: print.size[0] + m * 2, h: print.size[1] + m * 2 };
  });
  const W = Math.max(...pieces.map((p) => p.x + p.w));
  const H = Math.max(...pieces.map((p) => p.y + p.h));
  wall.style.setProperty('--wall-ar', (W / H).toFixed(4));
  wall.append(node('<span class="wall__pool"></span>'));

  pieces.forEach(({ print, x, y, w }, n) => {
    const press = getPress(print.press);
    const pct = (v, of) => ((v / of) * 100).toFixed(3);
    const item = node(html`
      <a
        class="wall__item${x + w / 2 > W * 0.6 ? ' wall__item--right' : ''}"
        href="#print-${print.id}"
        data-cursor="view"
        aria-label="${print.title} by ${press.name}, ${formatPrice(print.price)}"
        style="--x:${pct(x, W)};--y:${pct(y, H)};--w:${pct(w, W)};--n:${n};--tilt:${n % 2 ? -1 : 1}"
      >
        <span class="wall__cap"><em>${print.title}</em><span>${press.name} · ${formatPrice(print.price)}</span></span>
      </a>
    `);
    item.prepend(frameEl(print, { tilt: true }));
    wall.append(item);
  });

  // A pool of light on the plaster that follows the pointer.
  if (finePointer()) {
    let raf = 0;
    let last = null;
    window.addEventListener(
      'pointermove',
      (event) => {
        last = event;
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const r = wall.getBoundingClientRect();
          if (r.bottom < -400 || r.top > innerHeight + 400) return;
          wall.style.setProperty('--mx', `${(last.clientX - r.left).toFixed(0)}px`);
          wall.style.setProperty('--my', `${(last.clientY - r.top).toFixed(0)}px`);
        });
      },
      { passive: true },
    );
  }
}

// ---------- press directory ----------

export function initPresses() {
  const list = $('#press-list');
  list.innerHTML = html`${PRESSES.map((press) => {
    const n = printsByPress(press.id).length;
    return html`
      <a class="press-row" href="#press-${press.id}" data-press="${press.id}">
        ${chop(press)}
        <span class="press-row__name display">${press.name}</span>
        <span class="press-row__place">${press.city}, ${press.country}</span>
        <span class="press-row__tech">${press.techniques.map((t) => TECHNIQUES[t].name).join(' and ')}</span>
        <span class="press-row__count num">${n} ${n === 1 ? 'print' : 'prints'}</span>
        ${icon('right', 'press-row__go')}
      </a>
    `;
  })}`;

  // One of the press's prints trails the pointer down the list.
  if (!finePointer() || !motionOK()) return;
  const peek = node('<div class="peek" aria-hidden="true"></div>');
  document.body.append(peek);
  const at = { x: 0, y: 0 };
  const goal = { x: 0, y: 0 };
  let current = null;
  let raf = 0;
  const follow = () => {
    at.x += (goal.x - at.x) * 0.16;
    at.y += (goal.y - at.y) * 0.16;
    peek.style.transform = `translate3d(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px, 0)`;
    raf = current && Math.abs(goal.x - at.x) + Math.abs(goal.y - at.y) > 0.3 ? requestAnimationFrame(follow) : 0;
  };
  list.addEventListener('pointermove', (event) => {
    const row = event.target.closest('.press-row');
    if (!row) return;
    goal.x = event.clientX + 28;
    goal.y = event.clientY - 90;
    if (row !== current) {
      if (!current) Object.assign(at, goal);
      current = row;
      const print = printsByPress(row.dataset.press)[0];
      peek.replaceChildren(frameEl(print));
      peek.classList.add('is-on');
    }
    if (!raf) raf = requestAnimationFrame(follow);
  });
  list.addEventListener('pointerleave', () => {
    current = null;
    peek.classList.remove('is-on');
  });
}

// ---------- payout calculator ----------

const FEE = 0.15;

export function initSell() {
  const price = $('#calc-price');
  const edition = $('#calc-edition');
  const payout = $('#calc-payout');
  let shown = 0;

  const fill = (input) => {
    const pct = ((input.value - input.min) / (input.max - input.min)) * 100;
    input.style.setProperty('--fill', `${pct}%`);
  };
  const update = (animate) => {
    const gross = price.value * edition.value;
    const keep = Math.round(gross * (1 - FEE));
    $('#calc-price-out').textContent = formatPrice(Number(price.value));
    $('#calc-edition-out').textContent = `${edition.value} copies`;
    $('#calc-you').textContent = `You ${formatPrice(keep)}`;
    $('#calc-fee').textContent = `Overprint ${formatPrice(gross - keep)}`;
    fill(price);
    fill(edition);
    const from = shown;
    shown = keep;
    if (animate) tween(from, keep, 450, (v) => (payout.textContent = formatPrice(Math.round(v))));
    else payout.textContent = formatPrice(keep);
  };
  price.addEventListener('input', () => update(true));
  edition.addEventListener('input', () => update(true));
  $('#calc').addEventListener('submit', (event) => event.preventDefault());
  update(false);
}
