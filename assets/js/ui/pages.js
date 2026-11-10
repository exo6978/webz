// The two simple pages: a press's own page and the shopper's saved prints.

import { getPress, getPrint, printsByPress, TECHNIQUES } from '../data.js';
import { savedIds } from '../store.js';
import { html } from '../util.js';
import { chop } from './parts.js';
import { cardGrid } from './browse.js';
import { icon } from '../icons.js';

export function renderPress(view, id) {
  const press = getPress(id);
  const prints = printsByPress(id);
  const sold = prints.reduce((n, p) => n + p.sold, 0);
  view.innerHTML = html`
    <div class="wrap">
      <div class="detail__bar" style="margin-top:1.25rem;margin-bottom:0">
        <a class="back" href="#presses" data-action="back">${icon('left')} All presses</a>
      </div>
      <header class="masthead">
        ${chop(press)}
        <div class="masthead__body">
          <h1 class="masthead__title display" tabindex="-1">${press.name}</h1>
          <p class="masthead__facts">
            <span>${press.city}, ${press.country}</span>
            <span>${press.techniques.map((t) => TECHNIQUES[t].name).join(' and ')}</span>
            <span>Printing since ${press.since}</span>
            <span>${sold} prints sold here</span>
          </p>
          <p class="masthead__blurb">${press.blurb} Orders ship ${press.ships}, usually within ${press.days} working days.</p>
        </div>
      </header>
      <div id="press-slot"></div>
    </div>
  `;
  view.querySelector('#press-slot').replaceWith(cardGrid(prints));
}

export function renderSaved(view) {
  const prints = savedIds().map(getPrint).filter(Boolean);
  view.innerHTML = html`
    <div class="wrap">
      <div class="detail__bar" style="margin-top:1.25rem;margin-bottom:0">
        <a class="back" href="#prints" data-action="back">${icon('left')} All prints</a>
      </div>
      <header class="masthead" style="grid-template-columns:minmax(0,1fr)">
        <div class="masthead__body">
          <h1 class="masthead__title display" tabindex="-1">Saved</h1>
          <p class="masthead__blurb">
            ${prints.length
              ? `${prints.length} ${prints.length === 1 ? 'print' : 'prints'} kept on this device.`
              : 'Nothing saved yet. Use the heart on any print and it will be kept here, on this device.'}
          </p>
          ${prints.length ? '' : html`<p><a class="btn btn--primary" href="#prints">Browse the prints</a></p>`}
        </div>
      </header>
      <div id="saved-slot"></div>
    </div>
  `;
  view.querySelector('#saved-slot').replaceWith(cardGrid(prints));
}
