// The browsable wall: technique chips, the ink shelf, search, sorting, and a grid
// whose cards slide to their new places whenever the selection changes.

import { PRINTS, TECHNIQUES, INKS_IN_USE, getPress, inkOf, remaining } from '../data.js';
import { $, $$, html, node, action } from '../util.js';
import { flip } from '../fx/motion.js';
import { cardEl } from './parts.js';

const state = { tech: 'all', ink: null, sort: 'featured', query: '' };
const cards = new Map(); // print id -> card element
let order = PRINTS.map((p) => p.id); // ids currently shown, in display order

export const visibleOrder = () => order;

const SORTS = {
  featured: () => 0,
  new: (a, b) => b.year - a.year,
  low: (a, b) => a.price - b.price,
  high: (a, b) => b.price - a.price,
  // Sold-out editions sink to the end; otherwise the scarcest come first.
  scarce: (a, b) => (remaining(a) || 1e6) - (remaining(b) || 1e6),
};

// Everything a search can match on, lowercased once.
const haystack = new Map(
  PRINTS.map((p) => {
    const press = getPress(p.press);
    return [
      p.id,
      [p.title, press.name, press.city, press.country, TECHNIQUES[p.technique].name, p.year, ...p.inks.map((id) => inkOf(id).name)]
        .join(' ')
        .toLowerCase(),
    ];
  }),
);

function matches(print) {
  if (state.tech !== 'all' && print.technique !== state.tech) return false;
  if (state.ink && !print.inks.includes(state.ink)) return false;
  if (state.query) {
    const text = haystack.get(print.id);
    return state.query.split(/\s+/).every((word) => text.includes(word));
  }
  return true;
}

function apply() {
  const grid = $('#grid');
  const shown = PRINTS.filter(matches).sort(SORTS[state.sort]);
  order = shown.map((p) => p.id);
  const keep = new Set(order);

  flip([...cards.values()], () => {
    for (const [id, card] of cards) card.hidden = !keep.has(id);
    shown.forEach((p) => grid.append(cards.get(p.id)));
  });

  const filtered = state.tech !== 'all' || state.ink || state.query;
  $('#result-count').textContent = filtered
    ? `${shown.length} of ${PRINTS.length} prints`
    : `${PRINTS.length} prints, every one signed and numbered`;
  $('#grid-empty').hidden = shown.length > 0;
  $('#clear-filters').hidden = !filtered;

  $$('#tech-chips .chip').forEach((chip) => chip.setAttribute('aria-pressed', String(chip.dataset.value === state.tech)));
  $$('#ink-shelf .inkdot').forEach((dot) => dot.setAttribute('aria-pressed', String(dot.dataset.value === state.ink)));
  $('#ink-shelf').classList.toggle('has-pick', Boolean(state.ink));
  $('#ink-pick').textContent = state.ink ? inkOf(state.ink).name : '';
}

export function initBrowse() {
  const grid = $('#grid');
  PRINTS.forEach((print) => {
    const card = cardEl(print);
    cards.set(print.id, card);
    grid.append(card);
  });

  const count = (tech) => PRINTS.filter((p) => p.technique === tech).length;
  $('#tech-chips').innerHTML = html`
    <button class="chip" type="button" data-action="tech" data-value="all" aria-pressed="true">
      All <span class="chip__n">${PRINTS.length}</span>
    </button>
    ${Object.entries(TECHNIQUES).map(
      ([id, t]) => html`<button class="chip" type="button" data-action="tech" data-value="${id}" aria-pressed="false">
        ${t.plural} <span class="chip__n">${count(id)}</span>
      </button>`,
    )}
  `;

  $('#ink-shelf').innerHTML = html`${INKS_IN_USE.map((id) => {
    const ink = inkOf(id);
    return html`<button
      class="inkdot"
      type="button"
      data-action="ink"
      data-value="${id}"
      aria-pressed="false"
      aria-label="${ink.name}"
      title="${ink.name}"
      style="--c:${ink.hex}"
    ></button>`;
  })}`;

  action('tech', (el) => {
    state.tech = el.dataset.value;
    apply();
  });
  action('ink', (el) => {
    state.ink = state.ink === el.dataset.value ? null : el.dataset.value;
    apply();
  });
  action('clear-filters', () => {
    Object.assign(state, { tech: 'all', ink: null, query: '' });
    $('#search').value = '';
    apply();
  });
  $('#search').addEventListener('input', (event) => {
    state.query = event.target.value.trim().toLowerCase();
    apply();
  });
  $('#sort').addEventListener('change', (event) => {
    state.sort = event.target.value;
    apply();
  });

  // The colour bar in the footer shows the same inks.
  $('#colorbar').innerHTML = html`${INKS_IN_USE.map((id) => html`<i style="--c:${inkOf(id).hex}"></i>`)}`;
  $('#colorbar-note').textContent = `${INKS_IN_USE.length} inks on the wall today`;

  apply();
}

// A plain grid of cards for the press and saved pages (their own card instances).
export function cardGrid(prints, className = 'grid') {
  const grid = node(`<div class="${className}"></div>`);
  prints.forEach((p) => grid.append(cardEl(p)));
  return grid;
}
