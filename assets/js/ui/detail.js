// The listing page. One print on a stage that can be looked at three ways:
// on the wall (with a loupe), pulled apart into its separations, and hung in a
// room drawn to scale.

import {
  PRINTS,
  FRAMES,
  TECHNIQUES,
  getPrint,
  getPress,
  paperOf,
  inkOf,
  remaining,
  framePrice,
  formatPrice,
  formatSize,
  printsByPress,
} from '../data.js';
import { renderLayers, flatten, fontsReady } from '../art/engine.js';
import { isSaved, canAdd } from '../store.js';
import { $, $$, html, raw, node, action, clamp, finePointer, idle } from '../util.js';
import { frameEl, chop } from './parts.js';
import { visibleOrder, cardGrid } from './browse.js';
import { icon } from '../icons.js';

const ZOOM = 3;
const SWATCH = { none: 'transparent', oak: '#cfaa72', black: '#2b2b32', white: '#f2f0ea', walnut: '#6d4c38' };

let live = null; // the listing currently on the stage

const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const inches = (cm) => (cm / 2.54).toFixed(1);

export const currentFinish = () => live?.finish ?? 'none';
export const stagePrint = () => (live ? $('.print', live.frame) : null);

// Neighbours in whatever order the wall is currently showing.
function neighbours(id) {
  let ids = visibleOrder();
  if (!ids.includes(id)) ids = PRINTS.map((p) => p.id);
  const i = ids.indexOf(id);
  return { prev: ids[(i - 1 + ids.length) % ids.length], next: ids[(i + 1) % ids.length], index: i, total: ids.length };
}
export const printNeighbours = () => (live ? neighbours(live.print.id) : null);

export function renderPrint(view, id) {
  teardownPrint();
  const print = getPrint(id);
  const press = getPress(print.press);
  const paper = paperOf(print);
  const left = remaining(print);
  const n = print.inks.length;
  const near = neighbours(id);
  const others = printsByPress(press.id).filter((p) => p.id !== id);

  view.innerHTML = html`
    <article class="detail wrap">
      <div class="detail__bar">
        <a class="back" href="#prints" data-action="back">${icon('left')} All prints</a>
        <nav class="pager" aria-label="Other prints">
          <a href="#print-${near.prev}" aria-label="Previous print">${icon('left')}</a>
          <span class="pager__pos">${near.index + 1} / ${near.total}</span>
          <a href="#print-${near.next}" aria-label="Next print">${icon('right')}</a>
        </nav>
      </div>

      <div class="detail__grid">
        <div class="detail__media">
          <div
            class="stage"
            data-mode="wall"
            data-loupe="off"
            data-stock="${paper.dark ? 'dark' : 'light'}"
            style="--w-cm:${print.size[0]};--h-cm:${print.size[1]};--frame-cm:0;--paper:${paper.hex}"
          >
            <div class="room" aria-hidden="true">
              <div class="room__eye"></div>
              <div class="room__floor"></div>
              <svg class="room__board" viewBox="0 0 150 72" preserveAspectRatio="none">
                <rect width="150" height="56" rx="1.5" fill="currentColor" fill-opacity=".4" />
                <path d="M50 3v50M100 3v50" fill="none" stroke="currentColor" stroke-opacity=".55" stroke-width=".7" />
                <path d="M12 56 9 72M138 56l3 16" fill="none" stroke="currentColor" stroke-opacity=".8" stroke-width="1.8" />
              </svg>
              <svg class="room__stool" viewBox="0 0 36 46" preserveAspectRatio="none">
                <rect x="2" width="32" height="5" rx="2" fill="currentColor" fill-opacity=".5" />
                <path d="M7 5 4 46M29 5l3 41M6 28h24" fill="none" stroke="currentColor" stroke-opacity=".8" stroke-width="1.5" />
              </svg>
              <div class="dim dim--w"><span id="dim-w"></span></div>
              <div class="dim dim--h"><span id="dim-h"></span></div>
              <div class="dim dim--board"><span>sideboard, 150 cm</span></div>
              <div class="dim dim--eye"><span>centre hung at 150 cm</span></div>
            </div>
            <div class="loupe" aria-hidden="true"><canvas></canvas><svg></svg></div>
          </div>

          <div class="stage-tools">
            <div class="seg" role="group" aria-label="How to look at it">
              <span class="seg__mark"></span>
              <button type="button" data-action="mode" data-value="wall" aria-pressed="true">On the wall</button>
              ${print.image ? '' : html`<button type="button" data-action="mode" data-value="layers" aria-pressed="false">Separations</button>`}
              <button type="button" data-action="mode" data-value="room" aria-pressed="false">In a room</button>
            </div>
            <button class="btn btn--ghost" type="button" data-action="loupe" id="loupe-toggle" aria-pressed="false">
              ${icon('loupe')} Loupe
            </button>
          </div>
        </div>

        <div class="info">
          <header class="info__head">
            <a class="info__press" href="#press-${press.id}">
              ${chop(press)}
              <span>${press.name}<span>${press.city}, ${press.country}</span></span>
            </a>
            <h1 class="info__title" tabindex="-1">${print.title}</h1>
            <p class="info__sub">
              ${TECHNIQUES[print.technique].name} in ${n} ${n === 1 ? 'ink' : 'inks'} · ${formatSize(print)} · ${print.year}
            </p>
          </header>

          <p class="info__note">${print.note}</p>

          <section class="buy" aria-label="Buy this print">
            <div class="buy__row">
              <span class="buy__price" id="buy-price">${formatPrice(print.price)}</span>
              <span class="buy__sum" id="buy-sum"></span>
            </div>

            <fieldset style="border:0;margin:0;padding:0;min-width:0">
              <legend class="field-label" style="padding:0;width:100%">Frame <span id="finish-name">Unframed</span></legend>
              <div class="finishes">
                ${Object.entries(FRAMES).map(
                  ([key, frame]) => html`<label class="finish">
                    <input class="sr" type="radio" name="finish" value="${key}" ${key === 'none' ? 'checked' : ''} />
                    <span class="finish__swatch" style="--c:${SWATCH[key]}" ${key === 'none' ? 'data-none' : ''}></span>
                    <b>${frame.name}</b>
                    <small>${key === 'none' ? 'as sold' : `+${formatPrice(framePrice(print, key))}`}</small>
                  </label>`,
                )}
              </div>
            </fieldset>

            <div class="edition">
              <div class="tally" style="--n:${print.edition};--sold:${print.sold}" aria-hidden="true"><i></i><i></i></div>
              <p class="edition__key">
                <span>Edition of ${print.edition}, signed and numbered</span>
                <b class="${left <= 5 ? 'is-low' : ''}">${left === 0 ? 'Sold out' : `${left} left`}</b>
              </p>
            </div>

            <div class="buy__actions">
              <button class="btn btn--primary" type="button" data-action="add" data-id="${print.id}" id="buy-add" ${left === 0 ? 'disabled' : ''}></button>
              <button
                class="btn btn--ghost"
                type="button"
                data-action="save"
                data-id="${print.id}"
                aria-pressed="${String(isSaved(print.id))}"
                aria-label="Save ${print.title}"
              >
                ${icon('heart', 'heart')}
              </button>
            </div>
            <p class="buy__sum">Ships ${press.ships}, from ${press.city} in ${press.days} working days.</p>
          </section>

          <section>
            <h3 class="micro">How it was printed</h3>
            <ol class="passes">
              <li class="pass" data-sheet="0" tabindex="0">
                <span class="pass__n">Sheet</span>
                <span class="pass__dot" data-paper style="--c:${paper.hex}"></span>
                <span>${paper.name}</span>
                <span class="pass__hex">${paper.hex}</span>
              </li>
              ${print.inks.map((inkId, i) => {
                const ink = inkOf(inkId);
                return html`<li class="pass" data-sheet="${i + 1}" tabindex="0">
                  <span class="pass__n">Pass ${i + 1}</span>
                  <span class="pass__dot" style="--c:${ink.hex}"></span>
                  <span>${ink.name}</span>
                  <span class="pass__hex">${ink.hex}</span>
                </li>`;
              })}
            </ol>
          </section>

          <section>
            <h3 class="micro">Details</h3>
            <dl class="specs">
              <dt>Technique</dt>
              <dd>${TECHNIQUES[print.technique].name}</dd>
              <dt>Sheet</dt>
              <dd class="num">${formatSize(print)} (${inches(print.size[0])} × ${inches(print.size[1])} in)</dd>
              <dt>Paper</dt>
              <dd>${paper.name}</dd>
              <dt>Edition</dt>
              <dd class="num">${print.edition} copies, ${print.sold} sold</dd>
              <dt>Year</dt>
              <dd class="num">${print.year}</dd>
              <dt>Press</dt>
              <dd><a class="link" href="#press-${press.id}">${press.name}</a>, printing since ${press.since}</dd>
            </dl>
          </section>
        </div>
      </div>

      ${others.length
        ? html`<section class="more" aria-labelledby="more-title">
            <header class="section-head">
              <h2 class="section-title display" id="more-title">More from ${press.name}</h2>
            </header>
            <div id="more-slot"></div>
          </section>`
        : ''}
    </article>
  `;

  const stage = $('.stage', view);
  const frame = frameEl(print, { finish: 'none' });
  $('img', frame).alt = `${print.title}, ${TECHNIQUES[print.technique].name.toLowerCase()} by ${press.name}`;
  stage.insertBefore(frame, $('.loupe', stage));
  if (others.length) $('#more-slot', view).replaceWith(cardGrid(others, 'more__grid'));

  live = { print, view, stage, frame, finish: 'none', mode: 'wall', loupe: finePointer(), render: null, flat: null };
  setFinish('none');
  setMode('wall');
  bindStage(live);
}

export function teardownPrint() {
  if (!live) return;
  live.resize?.disconnect();
  live = null;
}

// Called once the page has arrived: draw the sheet again at full size, as layers.
export async function printEntered() {
  const state = live;
  if (!state) return;
  await idle();
  await fontsReady;
  if (state === live) ensureLayers(state);
}

function ensureLayers(state) {
  // A listing with its own image has no ink layers to draw.
  if (state.render || state.print.image) return;
  const { print, stage, frame } = state;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const long = clamp(Math.round(stage.clientWidth * dpr * 1.1), 800, 1280);
  const render = renderLayers(print, long);
  const paper = paperOf(print);
  const viewH = (100 * render.H) / render.W;
  const count = render.layers.length + 1;

  const sheets = document.createElement('span');
  sheets.className = 'sheets';
  sheets.style.setProperty('--sheet-blend', render.blend === 'multiply' ? 'multiply' : 'normal');
  sheets.style.setProperty('--mid', ((count - 1) / 2).toFixed(2));

  const add = (canvas, i, kind, name, colour) => {
    const sheet = node(
      html`<span class="sheet sheet--${kind}" style="--i:${i}">
        <svg class="sheet__marks" viewBox="0 0 100 ${viewH.toFixed(2)}" aria-hidden="true">
          <g fill="none" stroke="${colour}" stroke-width=".45">
            ${[
              [50, 3.6],
              [50, viewH - 3.6],
              [3.6, viewH / 2],
              [96.4, viewH / 2],
            ].map(
              ([x, y]) => raw(`<circle cx="${x}" cy="${y}" r="2"/><path d="M${x - 3.4} ${y}h6.8M${x} ${y - 3.4}v6.8"/>`),
            )}
          </g>
          <text x="8.6" y="5.8" fill="${colour}">${(i === 0 ? 'Sheet' : `Pass ${i}`).toUpperCase()} · ${name.toUpperCase()}</text>
        </svg>
      </span>`,
    );
    sheet.prepend(canvas);
    sheets.append(sheet);
  };
  add(render.paper, 0, 'paper', paper.name, paper.dark ? '#d8d5cc' : '#5b5e70');
  render.layers.forEach((layer, i) => {
    layer.canvas.style.translate = `${((layer.dx / render.W) * 100).toFixed(3)}% ${((layer.dy / render.H) * 100).toFixed(3)}%`;
    add(layer.canvas, i + 1, 'ink', layer.ink.name, layer.ink.hex);
  });

  state.flat = flatten(render);
  state.render = render;
  $('.print', frame).append(sheets);
  requestAnimationFrame(() => sheets.classList.add('is-ready'));
}

// ---------- stage state ----------

function setFinish(finish) {
  const state = live;
  const { print, stage, frame, view } = state;
  state.finish = finish;
  frame.dataset.finish = finish;
  const m = finish === 'none' ? 0 : 2;
  stage.style.setProperty('--frame-cm', m);
  $('#dim-w', view).textContent = `${fmt(print.size[0] + m * 2)} cm`;
  $('#dim-h', view).textContent = `${fmt(print.size[1] + m * 2)} cm`;

  const extra = framePrice(print, finish);
  $('#finish-name', view).textContent = finish === 'none' ? 'Unframed' : `${FRAMES[finish].name}, glazed`;
  $('#buy-sum', view).textContent = extra
    ? `+ ${formatPrice(extra)} ${FRAMES[finish].name.toLowerCase()} frame = ${formatPrice(print.price + extra)}`
    : 'Print only, tax included';
  const add = $('#buy-add', view);
  add.textContent = remaining(print) === 0 ? 'Sold out' : `Add to bag · ${formatPrice(print.price + extra)}`;
  if (state.mode === 'layers') fitSheets(state);
}

function setMode(mode) {
  const state = live;
  const { stage, view } = state;
  if (mode === 'layers') {
    ensureLayers(state);
    fitSheets(state);
  }
  state.mode = mode;
  stage.dataset.mode = mode;
  $$('.seg button', view).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === mode)));
  moveMarker(state);
  syncLoupe(state);
}

function moveMarker({ view }) {
  const seg = $('.seg', view);
  const on = $('button[aria-pressed="true"]', seg);
  if (!on || !on.offsetWidth) return;
  seg.style.setProperty('--mx', `${on.offsetLeft}px`);
  seg.style.setProperty('--mw', `${on.offsetWidth}px`);
}

function syncLoupe(state) {
  const { stage, view } = state;
  const usable = state.mode === 'wall';
  stage.dataset.loupe = usable && state.loupe ? 'on' : 'off';
  const toggle = $('#loupe-toggle', view);
  toggle.disabled = !usable;
  toggle.setAttribute('aria-pressed', String(usable && state.loupe));
  $('.print', state.frame).dataset.cursor = usable && state.loupe ? 'hide' : '';
  if (stage.dataset.loupe === 'off') $('.loupe', stage).classList.remove('is-on');
}

// Size the exploded stack so every sheet stays inside the stage.
function fitSheets({ stage, print, finish, render }) {
  if (!render) return;
  const sw = stage.clientWidth;
  const sh = stage.clientHeight;
  const ar = print.size[0] / print.size[1];
  const fw = finish === 'none' ? 0 : clamp(sw * 0.025, 9, 18);
  const w = Math.min(sw * 0.66, (sh * 0.82 - 2 * fw) * ar + 2 * fw) - 2 * fw;
  const h = w / ar;
  const count = render.layers.length + 1;
  // Footprint of one sheet after the oblique projection in the stylesheet.
  const bw = 0.848 * w + 0.53 * h;
  const bh = 0.281 * w + 0.449 * h;
  const scale = Math.min(0.74, (sw * 0.86) / bw, (sh * 0.5) / bh);
  const gap = clamp((sh * 0.86 - bh * scale) / (count - 1), 20, sh * 0.2);
  stage.style.setProperty('--sheet-scale', scale.toFixed(3));
  stage.style.setProperty('--gap', `${gap.toFixed(1)}px`);
}

// ---------- interactions ----------

function bindStage(state) {
  const { stage, view, frame, print } = state;
  const sheet = $('.print', frame);
  const lens = $('.loupe', stage);
  const canvas = $('canvas', lens);
  const scale = $('svg', lens);
  let mmShown = 0;

  // A scale in real millimetres of the sheet, engraved across the glass.
  const ruler = (size, mm) => {
    if (Math.abs(mm - mmShown) < 0.02) return;
    mmShown = mm;
    const span = [50, 20, 10, 5, 2].find((s) => s * mm <= size * 0.6) ?? 1;
    const every = mm >= 3 ? 1 : mm * 5 >= 4 ? 5 : 10;
    const x0 = size / 2 - (span * mm) / 2;
    const y = size * 0.74;
    let d = `M${x0.toFixed(1)} ${y}h${(span * mm).toFixed(1)}`;
    for (let i = 0; i <= span; i += every) d += `M${(x0 + i * mm).toFixed(1)} ${y}v${i % 10 === 0 ? -8 : i % 5 === 0 ? -6 : -4}`;
    const c = size / 2;
    scale.setAttribute('viewBox', `0 0 ${size} ${size}`);
    scale.innerHTML =
      `<g style="mix-blend-mode:difference" fill="none" stroke="#fff"><path d="${d}"/><path d="M${c - 6} ${c}h12M${c} ${c - 6}v12"/>` +
      `<text x="${c}" y="${y + 13}" text-anchor="middle" fill="#fff" stroke="none">${span} mm</text></g>`;
  };

  const look = (event) => {
    if (stage.dataset.loupe !== 'on') return;
    const pr = sheet.getBoundingClientRect();
    const u = (event.clientX - pr.left) / pr.width;
    const v = (event.clientY - pr.top) / pr.height;
    if (u < 0 || u > 1 || v < 0 || v > 1) {
      lens.classList.remove('is-on');
      return;
    }
    const source = state.flat ?? $('img', sheet);
    const sw = source.naturalWidth || source.width;
    const sh = source.naturalHeight || source.height;
    if (!sw) return;
    const size = lens.offsetWidth;
    const px = Math.round(size * Math.min(window.devicePixelRatio || 1, 2));
    if (canvas.width !== px) canvas.width = canvas.height = px;
    const ctx = canvas.getContext('2d');
    const cw = (size / ZOOM / pr.width) * sw;
    const ch = (size / ZOOM / pr.height) * sh;
    ctx.fillStyle = paperOf(print).hex;
    ctx.fillRect(0, 0, px, px);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, u * sw - cw / 2, v * sh - ch / 2, cw, ch, 0, 0, px, px);

    const sr = stage.getBoundingClientRect();
    const lift = event.pointerType === 'touch' ? size * 0.72 : 0;
    lens.style.transform = `translate(${(event.clientX - sr.left).toFixed(1)}px, ${(event.clientY - sr.top - lift).toFixed(1)}px)`;
    lens.classList.add('is-on');
    ruler(size, (ZOOM * pr.width) / (print.size[0] * 10));
  };
  const away = () => lens.classList.remove('is-on');
  sheet.addEventListener('pointermove', look);
  sheet.addEventListener('pointerdown', look);
  sheet.addEventListener('pointerleave', away);
  sheet.addEventListener('pointerup', (event) => event.pointerType === 'touch' && away());
  sheet.addEventListener('pointercancel', away);

  // Framing choice.
  view.addEventListener('change', (event) => {
    if (event.target.name === 'finish' && state === live) setFinish(event.target.value);
  });

  // Pointing at a pass in the list lifts that sheet out of the stack.
  const passes = $('.passes', view);
  const focusSheet = (index) => {
    $$('.sheet', stage).forEach((el, i) => {
      el.classList.toggle('is-lift', index === i);
      el.classList.toggle('is-dim', index !== null && index !== i);
    });
  };
  const pick = (event) => {
    const li = event.target.closest('.pass');
    if (li) focusSheet(Number(li.dataset.sheet));
  };
  passes.addEventListener('pointerover', pick);
  passes.addEventListener('focusin', pick);
  passes.addEventListener('pointerleave', () => focusSheet(null));
  passes.addEventListener('focusout', () => focusSheet(null));
  passes.addEventListener('click', (event) => {
    if (event.target.closest('.pass') && state.mode !== 'layers') {
      setMode('layers');
      pick(event);
    }
  });

  if ('ResizeObserver' in window) {
    state.resize = new ResizeObserver(() => {
      if (state !== live) return;
      moveMarker(state);
      if (state.mode === 'layers') fitSheets(state);
    });
    state.resize.observe(stage);
  }
  document.fonts?.ready.then(() => state === live && moveMarker(state));
}

export function initDetail() {
  action('mode', (el) => live && setMode(el.dataset.value));
  action('loupe', () => {
    if (!live) return;
    live.loupe = !live.loupe;
    syncLoupe(live);
  });

  document.addEventListener('keydown', (event) => {
    if (!live || live.view.hidden || event.metaKey || event.ctrlKey || event.altKey) return;
    if ($('#bag').classList.contains('is-open')) return;
    if (event.target.closest?.('input, select, textarea')) return;
    const near = neighbours(live.print.id);
    if (event.key === 'ArrowRight') location.hash = `print-${near.next}`;
    else if (event.key === 'ArrowLeft') location.hash = `print-${near.prev}`;
    else if (event.key.toLowerCase() === 'l' && live.mode === 'wall') {
      live.loupe = !live.loupe;
      syncLoupe(live);
    }
  });
}
