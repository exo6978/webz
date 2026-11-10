// Turns a listing into artwork.
//
// renderLayers() draws a print the way it is made: a sheet of paper plus one
// layer per ink. Keeping the inks apart is what lets the site show a print
// arriving pass by pass, pull it apart into separations, and mix colours by
// overprinting instead of painting them in.

import { createRng, createNoise } from './rng.js';
import { STYLES } from './styles.js';
import { inkOf, paperOf } from '../data.js';

// How each process leaves ink on paper.
//   salt   - specks where ink missed the sheet
//   mottle - soft patches of uneven density
//   misreg - how far a pass may drift, as a fraction of the sheet width
//   grain  - streaks from the wood
const TEXTURE = {
  risograph: { salt: 0.5, mottle: 0.6, misreg: 0.004 },
  screenprint: { salt: 0.1, mottle: 0.12, misreg: 0.0015 },
  linocut: { salt: 0.78, mottle: 0.4, misreg: 0.001 },
  woodblock: { salt: 0.3, mottle: 0.45, misreg: 0.0015, grain: 0.6 },
  letterpress: { salt: 0.34, mottle: 0.2, misreg: 0 },
  plotter: { salt: 0, mottle: 0, misreg: 0 },
};

const BASE = 720; // textures are authored for a sheet whose long side is 720px

export function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function rgbOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgba = (hex, a) => `rgba(${rgbOf(hex).join(',')},${a})`;

// ---- shared texture tiles ----

let speckTile;
function speckPattern(ctx, scale) {
  if (!speckTile) {
    speckTile = makeCanvas(192, 192);
    const c = speckTile.getContext('2d');
    const img = c.createImageData(192, 192);
    const rng = createRng(90210);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rng.f();
      img.data[i + 3] = v > 0.84 ? 255 : v > 0.62 ? 80 : 0;
    }
    c.putImageData(img, 0, 0);
  }
  const pattern = ctx.createPattern(speckTile, 'repeat');
  pattern.setTransform(new DOMMatrix().scaleSelf(scale));
  return pattern;
}

let fibreTile;
function fibrePattern(ctx, scale) {
  if (!fibreTile) {
    fibreTile = makeCanvas(256, 256);
    const c = fibreTile.getContext('2d');
    const rng = createRng(1851);
    c.lineCap = 'round';
    for (let i = 0; i < 420; i++) {
      const x = rng.range(0, 256);
      const y = rng.range(0, 256);
      const a = rng.range(0, Math.PI * 2);
      const len = rng.range(2, 9);
      c.strokeStyle = `rgba(70,62,48,${rng.range(0.04, 0.16)})`;
      c.lineWidth = rng.range(0.4, 0.9);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      c.stroke();
    }
  }
  const pattern = ctx.createPattern(fibreTile, 'repeat');
  pattern.setTransform(new DOMMatrix().scaleSelf(scale));
  return pattern;
}

function texture(ctx, area, tex, rng, scale) {
  const { w, h } = area;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  if (tex.salt) {
    ctx.globalAlpha = tex.salt;
    ctx.fillStyle = speckPattern(ctx, scale);
    ctx.fillRect(0, 0, w, h);
  }
  if (tex.mottle) {
    ctx.globalAlpha = 1;
    for (let i = 0; i < 7; i++) {
      const x = rng.range(0, w);
      const y = rng.range(0, h);
      const radius = Math.max(w, h) * rng.range(0.15, 0.4);
      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
      grad.addColorStop(0, `rgba(0,0,0,${0.2 * tex.mottle})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
  }
  if (tex.grain) {
    ctx.fillStyle = '#000';
    const line = Math.max(1, Math.round(scale));
    for (let y = 0; y < h; y += line * 2) {
      if (!rng.chance(0.4)) continue;
      ctx.globalAlpha = rng.range(0.03, 0.13) * tex.grain;
      ctx.fillRect(0, y, w, line);
    }
  }
  ctx.restore();
}

// ---- the sheet itself ----

function drawPaper(print, W, H, area, scale) {
  const paper = paperOf(print);
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = paper.hex;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalCompositeOperation = paper.dark ? 'screen' : 'multiply';
  ctx.globalAlpha = paper.dark ? 0.35 : 1;
  ctx.fillStyle = fibrePattern(ctx, scale);
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  if (area.x > 0) pencil(ctx, print, area, paper.dark);
  return canvas;
}

// Edition number bottom left, signature bottom right, as on a real sheet.
function pencil(ctx, print, area, dark) {
  const size = Math.max(6, Math.min(area.w, area.h) * 0.032);
  const y = area.y + area.h + size * 1.35;
  const graphite = dark ? 'rgba(226,222,210,0.62)' : 'rgba(64,66,80,0.74)';
  ctx.save();
  ctx.fillStyle = graphite;
  ctx.strokeStyle = graphite;
  ctx.font = `italic 400 ${size}px Newsreader, Georgia, "Times New Roman", serif`;
  ctx.textBaseline = 'middle';
  const number = Math.min(print.edition, print.sold + 1);
  ctx.fillText(`${number}/${print.edition}`, area.x + size * 0.15, y);

  const rng = createRng(`${print.press}:signature`);
  const width = size * 4.6;
  const x0 = area.x + area.w - width - size * 0.15;
  const turns = rng.range(5.5, 8.5);
  const phase = rng.range(0, Math.PI * 2);
  ctx.lineWidth = Math.max(0.6, size * 0.075);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 90; i++) {
    const t = i / 90;
    const swell = (t < 0.18 ? 1.5 : 0.75) * (1 - t * 0.55);
    const px = x0 + width * t + Math.sin(t * turns * 2.1 + phase) * size * 0.22;
    const py = y - Math.sin(t * turns * Math.PI + phase) * size * 0.46 * swell;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x0 + width * 0.12, y + size * 0.55);
  ctx.quadraticCurveTo(x0 + width * 0.6, y + size * 0.82, x0 + width, y + size * 0.42);
  ctx.stroke();
  ctx.restore();
}

// ---- public API ----

// Render a print as { W, H, paper, layers[], blend } with the sheet's long side at `longSide` px.
export function renderLayers(print, longSide = BASE) {
  const [cw, ch] = print.size;
  const W = Math.round(cw >= ch ? longSide : (longSide * cw) / ch);
  const H = Math.round(cw >= ch ? (longSide * ch) / cw : longSide);
  const scale = longSide / BASE;
  const paper = paperOf(print);
  const tex = TEXTURE[print.technique] ?? TEXTURE.screenprint;

  // White border around the image, a little deeper at the foot for the pencil line.
  const margin = print.bleed ? 0 : Math.round(Math.min(W, H) * 0.085);
  const area = { x: margin, y: margin, w: W - margin * 2, h: H - margin * 2 - Math.round(margin * 0.55) };

  const layers = print.inks.map((id) => {
    const ink = inkOf(id);
    const canvas = makeCanvas(W, H);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = ink.hex;
    ctx.strokeStyle = ink.hex;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.rect(area.x, area.y, area.w, area.h);
    ctx.clip();
    ctx.translate(area.x, area.y);
    return { id, ink, canvas, ctx, dx: 0, dy: 0 };
  });

  const seed = `${print.id}:${print.seed ?? 0}`;
  const g = {
    w: area.w,
    h: area.h,
    u: Math.min(area.w, area.h) / 100,
    n: layers.length,
    r: createRng(seed),
    noise: createNoise(createRng(`${seed}:noise`)),
    opts: print.opts ?? {},
    ink: (i) => layers[i % layers.length].ctx,
    tint: (i, a) => rgba(layers[i % layers.length].ink.hex, a),
    each: (fn) => layers.forEach((layer, i) => fn(layer.ctx, i)),
  };
  STYLES[print.style](g);

  const rng = createRng(`${seed}:texture`);
  layers.forEach((layer, i) => {
    layer.ctx.globalAlpha = 1;
    layer.ctx.globalCompositeOperation = 'source-over';
    texture(layer.ctx, area, tex, rng, scale);
    if (i > 0) {
      layer.dx = rng.range(-1, 1) * tex.misreg * W;
      layer.dy = rng.range(-1, 1) * tex.misreg * W;
    }
    delete layer.ctx;
  });

  return {
    W,
    H,
    area,
    paper: drawPaper(print, W, H, area, scale),
    layers,
    // Light inks on dark stock sit on top of the paper; everything else soaks in and mixes.
    blend: paper.dark ? 'source-over' : 'multiply',
  };
}

// Composite a render onto one canvas. `progress` (one number per ink, 0..1) wipes
// each pass in from the top edge, which is how the thumbnails arrive.
export function flatten(render, target = makeCanvas(render.W, render.H), progress = null) {
  const ctx = target.getContext('2d');
  const sx = target.width / render.W;
  const sy = target.height / render.H;
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(render.paper, 0, 0, target.width, target.height);
  ctx.globalCompositeOperation = render.blend;
  render.layers.forEach((layer, i) => {
    const p = progress ? progress[i] : 1;
    if (p <= 0) return;
    if (p < 1) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, target.width, target.height * p);
      ctx.clip();
    }
    ctx.drawImage(layer.canvas, layer.dx * sx, layer.dy * sy, target.width, target.height);
    if (p < 1) ctx.restore();
  });
  ctx.globalCompositeOperation = 'source-over';
  return target;
}

// Resolves once the faces the artwork draws with are available (or after a short wait).
export const fontsReady = (() => {
  if (!document.fonts?.load) return Promise.resolve();
  const wanted = Promise.all([
    document.fonts.load('900 48px Archivo', '&g8'),
    document.fonts.load('600 12px Archivo', 'AB'),
    document.fonts.load('italic 400 16px Newsreader', '12/50'),
  ]).catch(() => {});
  const timeout = new Promise((resolve) => setTimeout(resolve, 1800));
  return Promise.race([wanted, timeout]);
})();
