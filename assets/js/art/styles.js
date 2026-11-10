// Artwork generators. Each one draws a composition into per-ink layers,
// the way a print is built up pass by pass. They only ever use relative
// units (g.w, g.h, g.u), so the same seed renders identically at any size.
//
//   g.w, g.h     size of the image area in pixels
//   g.u          one hundredth of the shorter side
//   g.n          number of inks
//   g.ink(i)     2D context of ink layer i, fill and stroke preset to that ink
//   g.tint(i,a)  that ink as an rgba() string
//   g.each(fn)   run fn(ctx) on every ink layer
//   g.r          seeded random source, g.noise seeded noise
//   g.opts       per-listing options from the catalogue

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

function disc(ctx, x, y, radius) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
}

// Remove a shape from every ink layer, so whatever is drawn next sits on bare paper.
function knockOut(g, trace) {
  g.each((ctx) => {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1;
    ctx.beginPath();
    trace(ctx);
    ctx.fill();
    ctx.restore();
  });
}

// A halftone screen: a rotated grid of dots whose area follows tone(x, y) in 0..1.
function dots(ctx, w, h, pitch, angle, tone) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const reach = Math.hypot(w, h) / 2 + pitch;
  ctx.beginPath();
  for (let i = -reach; i <= reach; i += pitch) {
    for (let j = -reach; j <= reach; j += pitch) {
      const x = w / 2 + i * cos - j * sin;
      const y = h / 2 + i * sin + j * cos;
      if (x < -pitch || x > w + pitch || y < -pitch || y > h + pitch) continue;
      const t = tone(x, y);
      if (t <= 0.02) continue;
      const radius = pitch * 0.72 * Math.sqrt(Math.min(1, t));
      ctx.moveTo(x + radius, y);
      ctx.arc(x, y, radius, 0, TAU);
    }
  }
  ctx.fill();
}

// A smooth open curve through a list of points (corners rounded at the midpoints).
function smooth(ctx, pts) {
  ctx.lineTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last[0], last[1]);
}

// ---------------------------------------------------------------- hills

function hills(g) {
  const { w, h, r, noise, u, opts: o } = g;
  const horizon = h * r.range(0.5, 0.6);
  const sunR = Math.min(w, h) * r.range(0.13, 0.18);
  const sunX = w * r.range(0.3, 0.7);
  const sunY = horizon - sunR * r.range(0.5, 1.5);

  // A gradient wiped down from the top edge (bokashi).
  if (o.bokashi ?? r.chance(0.5)) {
    const ctx = g.ink(1);
    const depth = h * 0.42;
    const grad = ctx.createLinearGradient(0, 0, 0, depth);
    grad.addColorStop(0, g.tint(1, 0.92));
    grad.addColorStop(1, g.tint(1, 0));
    ctx.save();
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, depth);
    ctx.restore();
  }

  // Glow along the horizon, in the sun's ink.
  {
    const ctx = g.ink(0);
    const top = horizon - h * 0.28;
    const grad = ctx.createLinearGradient(0, top, 0, horizon + h * 0.06);
    grad.addColorStop(0, g.tint(0, 0));
    grad.addColorStop(1, g.tint(0, 0.55));
    ctx.save();
    ctx.fillStyle = grad;
    ctx.fillRect(0, top, w, h * 0.36);
    ctx.restore();
  }

  const sun = g.ink(0);
  if (o.rings) {
    sun.save();
    sun.lineWidth = u * 0.9;
    for (let i = 1; i <= 4; i++) {
      sun.globalAlpha = 1 - i * 0.17;
      sun.beginPath();
      sun.arc(sunX, sunY, sunR + i * u * 3.6, 0, TAU);
      sun.stroke();
    }
    sun.restore();
  }
  disc(sun, sunX, sunY, sunR);

  const count = o.layers ?? r.int(3, 4);
  const hillInks = Math.max(1, g.n - 1);
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 1 : i / (count - 1);
    const base = lerp(horizon, h * 0.9, t);
    const amp = h * lerp(0.1, 0.045, t);
    const freq = r.range(1.2, 2.6);
    const off = r.range(0, 50);
    const pts = [];
    for (let k = 0; k <= 90; k++) {
      const x = (k / 90) * w;
      const n = noise.fbm((x / w) * freq + off, i * 5.7, 3) * 2 - 1;
      pts.push([x, base - amp * n * 1.7]);
    }
    const trace = (ctx) => {
      ctx.moveTo(-2, h + 2);
      pts.forEach(([x, y]) => ctx.lineTo(x, y));
      ctx.lineTo(w + 2, h + 2);
      ctx.closePath();
    };

    // The farthest hill overprints the sky; the nearer ones are trapped.
    if (i > 0) knockOut(g, trace);

    const ctx = g.ink(hillInks === 1 ? 1 % g.n : 1 + (i % hillInks));
    ctx.save();
    ctx.globalAlpha = hillInks === 1 ? lerp(0.42, 1, t) : i < hillInks ? 0.8 : 1;
    ctx.beginPath();
    trace(ctx);
    ctx.fill();

    // Furrows that follow the contour of the second hill.
    if (i === 1 && count > 2) {
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = u * 0.5;
      for (let k = 1; k <= 7; k++) {
        ctx.beginPath();
        pts.forEach(([x, y], j) => {
          const yy = y + k * u * 2.3 + Math.sin(j * 0.07 + k) * u * 0.4;
          if (j) ctx.lineTo(x, yy);
          else ctx.moveTo(x, yy);
        });
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- overlap

function overlap(g) {
  const { w, h, r, u } = g;
  const m = Math.min(w, h);
  const anchors = r.shuffle([
    [0.36, 0.3],
    [0.64, 0.36],
    [0.4, 0.62],
    [0.63, 0.7],
    [0.5, 0.47],
    [0.32, 0.82],
  ]);
  const kinds = r.shuffle(['disc', 'half', 'pill', 'arch', 'quarter', 'disc', 'block']);
  const count = Math.max(4, g.n + 2);

  for (let i = 0; i < count; i++) {
    const ctx = g.ink(i);
    const [ax, ay] = anchors[i % anchors.length];
    const s = m * r.range(0.25, 0.38);
    ctx.save();
    ctx.translate(w * (ax + r.range(-0.04, 0.04)), h * (ay + r.range(-0.04, 0.04)));
    ctx.rotate((r.int(0, 3) * Math.PI) / 2);
    ctx.beginPath();
    switch (kinds[i % kinds.length]) {
      case 'half':
        ctx.arc(0, 0, s * 1.1, 0, Math.PI);
        ctx.closePath();
        break;
      case 'pill':
        ctx.arc(0, -s * 0.6, s * 0.55, Math.PI, 0);
        ctx.arc(0, s * 0.6, s * 0.55, 0, Math.PI);
        ctx.closePath();
        break;
      case 'arch':
        ctx.moveTo(-s * 0.7, s);
        ctx.lineTo(-s * 0.7, -s * 0.15);
        ctx.arc(0, -s * 0.15, s * 0.7, Math.PI, 0);
        ctx.lineTo(s * 0.7, s);
        ctx.closePath();
        break;
      case 'quarter':
        ctx.moveTo(-s * 0.7, -s * 0.7);
        ctx.arc(-s * 0.7, -s * 0.7, s * 1.5, 0, Math.PI / 2);
        ctx.closePath();
        break;
      case 'block':
        ctx.rect(-s * 0.75, -s * 0.75, s * 1.5, s * 1.5);
        break;
      default:
        ctx.arc(0, 0, s, 0, TAU);
    }
    ctx.fill();
    ctx.restore();
  }

  // A halftone fade climbing in from one corner, in the first ink.
  const corner = r.pick([
    [0, 1],
    [1, 1],
    [1, 0],
  ]);
  dots(g.ink(0), w, h, u * 2.2, Math.PI / 12, (x, y) => {
    const d = Math.hypot(x - corner[0] * w, y - corner[1] * h) / (m * 0.62);
    return d > 1 ? 0 : (1 - d) * 0.8;
  });

  // Three small discs in the last ink, like a printer's mark.
  const last = g.ink(g.n - 1);
  const px = w * r.range(0.12, 0.24);
  const py = h * r.range(0.1, 0.2);
  for (let i = 0; i < 3; i++) disc(last, px + i * u * 5, py, u * 1.6);
}

// ---------------------------------------------------------------- tiles

function tiles(g) {
  const { w, h, r, opts: o } = g;
  const cols = o.cols ?? r.int(3, 5);
  const rows = Math.max(1, Math.round((h / w) * cols));
  const cw = w / cols;
  const ch = h / rows;
  const motifs = ['quarter', 'quarter', 'quarter', 'half', 'half', 'disc', 'tri', 'bars', 'rings', 'rings', 'leaf', 'dot'];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const a = r.int(0, g.n - 1);

      // Some tiles get a flat ground in another ink, so the motif overprints it.
      if (r.chance(0.34)) {
        const b = (a + 1 + r.int(0, Math.max(0, g.n - 2))) % g.n;
        const ground = g.ink(b);
        ground.save();
        ground.globalAlpha = r.pick([0.32, 0.55, 1]);
        ground.fillRect(x * cw, y * ch, cw, ch);
        ground.restore();
      }
      if (r.chance(0.07)) continue; // a blank tile now and then

      const ctx = g.ink(a);
      ctx.save();
      ctx.translate(x * cw + cw / 2, y * ch + ch / 2);
      ctx.scale(cw, ch);
      ctx.rotate((r.int(0, 3) * Math.PI) / 2);
      ctx.translate(-0.5, -0.5);
      ctx.beginPath();
      switch (r.pick(motifs)) {
        case 'quarter':
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, 1, 0, Math.PI / 2);
          ctx.closePath();
          break;
        case 'half':
          ctx.arc(0.5, 0, 0.5, 0, Math.PI);
          ctx.closePath();
          break;
        case 'disc':
          ctx.arc(0.5, 0.5, 0.36, 0, TAU);
          break;
        case 'tri':
          ctx.moveTo(0, 0);
          ctx.lineTo(1, 0);
          ctx.lineTo(0, 1);
          ctx.closePath();
          break;
        case 'bars':
          for (let i = 0; i < 4; i++) ctx.rect(0, i * 0.25 + 0.05, 1, 0.13);
          break;
        case 'rings':
          for (let i = 0; i < 3; i++) {
            const outer = 1 - i * 0.32;
            const inner = outer - 0.16;
            ctx.moveTo(outer, 0);
            ctx.arc(0, 0, outer, 0, Math.PI / 2);
            ctx.lineTo(0, inner);
            ctx.arc(0, 0, inner, Math.PI / 2, 0, true);
            ctx.closePath();
          }
          break;
        case 'leaf':
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(1, 0, 1, 1);
          ctx.quadraticCurveTo(0, 1, 0, 0);
          break;
        default:
          ctx.arc(0.5, 0.5, 0.15, 0, TAU);
      }
      ctx.fill();
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------- cutouts

function leaf(ctx, length, width) {
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(length * 0.45, -width, length, 0);
  ctx.quadraticCurveTo(length * 0.45, width, 0, 0);
}

// A frond: a curved stem with paired leaflets, cut from one sheet.
function frond(ctx, r, x, y, length, angle) {
  const bend = r.range(-0.45, 0.45);
  const pairs = r.int(5, 8);
  const at = (t) => {
    const px = length * t;
    const py = bend * length * 0.32 * Math.sin(t * Math.PI * 0.85);
    const slope = bend * 0.32 * Math.PI * 0.85 * Math.cos(t * Math.PI * 0.85);
    return [px, py, Math.atan(slope)];
  };
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.lineWidth = length * 0.028;
  ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const [px, py] = at(i / 24);
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.stroke();
  for (let i = 1; i <= pairs; i++) {
    const t = i / (pairs + 0.6);
    const [px, py, tangent] = at(t);
    const size = length * 0.3 * Math.sin(Math.PI * (0.18 + 0.74 * t));
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(tangent + side * 0.95);
      ctx.beginPath();
      leaf(ctx, size, size * 0.26);
      ctx.fill();
      ctx.restore();
    }
  }
  const [tx, ty, tt] = at(1);
  ctx.translate(tx, ty);
  ctx.rotate(tt);
  ctx.beginPath();
  leaf(ctx, length * 0.2, length * 0.05);
  ctx.fill();
  ctx.restore();
}

function cutouts(g) {
  const { w, h, r, u, opts: o } = g;
  const m = Math.min(w, h);

  if (o.form === 'rosette') {
    // A plant seen side-on: blades fanning out of one point.
    const bx = w * 0.5;
    const by = h * 0.8;
    const blades = r.int(11, 15);
    for (let i = 0; i < blades; i++) {
      const t = i / (blades - 1);
      const angle = lerp(-Math.PI * 0.94, -Math.PI * 0.06, t) + r.range(-0.05, 0.05);
      const length = m * lerp(0.5, 0.86, Math.sin(t * Math.PI)) * r.range(0.9, 1.05);
      const ctx = g.ink(i % 2);
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(angle);
      ctx.beginPath();
      leaf(ctx, length, length * 0.085);
      ctx.fill();
      ctx.restore();
    }
    const ground = g.ink(0);
    ground.fillRect(0, by + u * 3, w, u * 1.4);
    ground.fillRect(w * 0.2, by + u * 6.5, w * 0.6, u * 1.4);
    disc(g.ink(1 % g.n), w * r.range(0.16, 0.26), h * r.range(0.14, 0.22), m * 0.07);
    return;
  }

  if (o.form === 'kelp') {
    // Tall stalks rising from the bottom edge, swaying together.
    const stalks = r.int(5, 7);
    for (let i = 0; i < stalks; i++) {
      const ctx = g.ink(i % g.n);
      const x = w * lerp(0.12, 0.88, (i + r.range(0.2, 0.8)) / stalks);
      const length = h * r.range(0.62, 0.98);
      frond(ctx, r, x, h + u, length, -Math.PI / 2 + r.range(-0.12, 0.12));
    }
    const bubbles = g.ink(g.n - 1);
    for (let i = 0; i < 16; i++) {
      bubbles.save();
      bubbles.lineWidth = u * 0.5;
      bubbles.beginPath();
      bubbles.arc(w * r.range(0.08, 0.92), h * r.range(0.05, 0.6), u * r.range(0.8, 2.2), 0, TAU);
      bubbles.stroke();
      bubbles.restore();
    }
    return;
  }

  // Default: a table of cut paper shapes on blocks of flat colour.
  if (o.blocks ?? true) {
    const split = r.range(0.38, 0.62);
    const a = g.ink(0);
    a.save();
    a.globalAlpha = 0.3;
    if (r.chance(0.5)) a.fillRect(0, 0, w * split, h);
    else a.fillRect(0, 0, w, h * split);
    a.restore();
    const b = g.ink(g.n - 1);
    b.save();
    b.globalAlpha = 0.24;
    b.fillRect(w * r.range(0.45, 0.6), h * r.range(0.5, 0.62), w, h);
    b.restore();
  }
  // Spread the pieces over a loose three-by-three grid so the sheet stays balanced.
  const cells = r.shuffle(Array.from({ length: 9 }, (_, i) => [i % 3, Math.floor(i / 3)]));
  const count = r.int(7, 9);
  for (let i = 0; i < count; i++) {
    const ctx = g.ink(i);
    const [col, row] = cells[i];
    const x = w * (0.2 + col * 0.3 + r.range(-0.07, 0.07));
    const y = h * (0.18 + row * 0.32 + r.range(-0.07, 0.07));
    if (r.chance(0.74)) {
      frond(ctx, r, x, y, m * r.range(0.34, 0.6), r.range(0, TAU));
    } else {
      // a pebble: a wobbly disc
      const radius = m * r.range(0.06, 0.11);
      const k = r.int(3, 5);
      const phase = r.range(0, TAU);
      ctx.beginPath();
      for (let s = 0; s <= 48; s++) {
        const a = (s / 48) * TAU;
        const rad = radius * (1 + 0.14 * Math.sin(a * k + phase));
        const px = x + Math.cos(a) * rad;
        const py = y + Math.sin(a) * rad;
        if (s) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.fill();
    }
  }
}

// ---------------------------------------------------------------- vessels

const PROFILES = {
  vase: [[0, 0.5], [0.05, 0.62], [0.36, 1], [0.6, 0.9], [0.8, 0.38], [0.92, 0.34], [1, 0.5]],
  bottle: [[0, 0.78], [0.06, 0.86], [0.5, 0.86], [0.63, 0.42], [0.88, 0.3], [0.95, 0.38], [1, 0.38]],
  jug: [[0, 0.58], [0.08, 0.78], [0.42, 1], [0.68, 0.72], [0.82, 0.5], [1, 0.66]],
  bowl: [[0, 0.4], [0.1, 0.48], [0.34, 0.8], [1, 1]],
  jar: [[0, 0.8], [0.08, 0.92], [0.68, 0.92], [0.82, 0.68], [0.9, 0.74], [1, 0.74]],
  gourd: [[0, 0.46], [0.08, 0.8], [0.28, 1], [0.48, 0.7], [0.6, 0.56], [0.76, 0.7], [0.9, 0.5], [1, 0.38]],
};

function vesselTrace(cx, baseY, width, height, profile) {
  const right = profile.map(([t, rad]) => [cx + (rad * width) / 2, baseY - t * height]);
  const left = profile.map(([t, rad]) => [cx - (rad * width) / 2, baseY - t * height]).reverse();
  return (ctx) => {
    ctx.moveTo(left[left.length - 1][0], baseY);
    smooth(ctx, right);
    smooth(ctx, left);
    ctx.closePath();
  };
}

function vessels(g) {
  const { w, h, r, u } = g;
  const table = h * r.range(0.74, 0.8);

  // Wall and table.
  const backdrop = g.ink(1 % g.n);
  backdrop.save();
  backdrop.globalAlpha = 0.26;
  if (r.chance(0.5)) disc(backdrop, w * r.range(0.4, 0.6), table - h * 0.34, Math.min(w, h) * 0.36);
  else backdrop.fillRect(w * 0.14, h * 0.1, w * 0.72, table - h * 0.1);
  backdrop.restore();
  const tableInk = g.ink(g.n - 1);
  tableInk.save();
  tableInk.globalAlpha = 0.9;
  tableInk.fillRect(0, table, w, u * 0.9);
  tableInk.globalAlpha = 0.16;
  tableInk.fillRect(0, table, w, h - table);
  tableInk.restore();

  const count = 3;
  const names = r.shuffle(Object.keys(PROFILES)).slice(0, count);
  const slots = r.shuffle([0.27, 0.5, 0.73]);
  names.forEach((name, i) => {
    const profile = PROFILES[name];
    const squat = name === 'bowl';
    const height = h * (squat ? r.range(0.16, 0.22) : r.range(0.36, 0.56));
    const width = Math.min(squat ? height * r.range(1.9, 2.4) : height * r.range(0.5, 0.72), w * (squat ? 0.38 : 0.3));
    const cx = w * (slots[i] + r.range(-0.03, 0.03));
    const trace = vesselTrace(cx, table, width, height, profile);
    const inkIndex = i % g.n;
    const ctx = g.ink(inkIndex);

    if (name === 'jug') {
      ctx.save();
      ctx.lineWidth = width * 0.085;
      ctx.beginPath();
      ctx.arc(cx + width * 0.47, table - height * 0.52, height * 0.17, -Math.PI * 0.55, Math.PI * 0.55);
      ctx.stroke();
      ctx.restore();
    }

    ctx.beginPath();
    trace(ctx);
    ctx.fill();

    // Bands or spots in another ink, kept inside the vessel.
    const deco = g.ink((inkIndex + 1) % g.n);
    deco.save();
    deco.beginPath();
    trace(deco);
    deco.clip();
    if (r.chance(0.5)) {
      const bands = r.int(2, 3);
      for (let b = 0; b < bands; b++) {
        deco.fillRect(cx - width, table - height * (0.28 + b * 0.17), width * 2, height * 0.06);
      }
    } else {
      for (let d = 0; d < 9; d++) {
        disc(deco, cx + width * r.range(-0.36, 0.36), table - height * r.range(0.1, 0.7), u * 1.5);
      }
    }
    deco.restore();

    // One of them holds a stem.
    if (i === 0 && !squat) {
      const stem = g.ink(g.n - 1);
      const top = table - height;
      const lean = r.range(-0.3, 0.3);
      const len = Math.min(h * 0.3, top - h * 0.05);
      stem.save();
      stem.lineWidth = u * 0.7;
      stem.beginPath();
      stem.moveTo(cx, top + u);
      stem.quadraticCurveTo(cx + lean * len * 0.4, top - len * 0.5, cx + lean * len, top - len);
      stem.stroke();
      for (let k = 1; k <= 4; k++) {
        const t = k / 4.4;
        const px = cx + lean * len * t * t;
        const py = top - len * t;
        stem.save();
        stem.translate(px, py);
        stem.rotate(-Math.PI / 2 + (k % 2 ? 1 : -1) * 0.9 + lean);
        stem.beginPath();
        leaf(stem, len * 0.3, len * 0.07);
        stem.fill();
        stem.restore();
      }
      stem.restore();
    }
  });
}

// ---------------------------------------------------------------- ridgelines

function ridgelines(g) {
  const { w, h, r, noise, u, opts: o } = g;
  const count = o.lines ?? r.int(44, 54);
  const top = h * 0.22;
  const bottom = h * 1.01;
  const amp = h * r.range(0.17, 0.22);
  const freq = r.range(1.5, 2.3);
  const off = r.range(0, 60);

  // A disc behind the ridges, cut off by them.
  const discR = Math.min(w, h) * r.range(0.16, 0.21);
  disc(g.ink(1 % g.n), w * r.range(0.32, 0.68), top - discR * r.range(0.05, 0.5), discR);

  const line = g.ink(0);
  line.save();
  line.lineWidth = u * (o.weight ?? 0.42);
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const y0 = lerp(top, bottom, t);
    const pts = [];
    for (let k = 0; k <= 150; k++) {
      const nx = k / 150;
      const envelope = 0.1 + 0.9 * clamp((noise.n2(nx * 2.4 + off * 1.3, t * 2.6 + off) - 0.28) * 2.1);
      const n = noise.fbm(nx * freq * 2 + off, t * 5.5, 4);
      pts.push([nx * w, y0 - amp * envelope * Math.pow(n, 1.5) * 1.7]);
    }
    knockOut(g, (ctx) => {
      ctx.moveTo(-2, h + 2);
      pts.forEach(([x, y]) => ctx.lineTo(x, y));
      ctx.lineTo(w + 2, h + 2);
      ctx.closePath();
    });
    line.beginPath();
    pts.forEach(([x, y], k) => (k ? line.lineTo(x, y) : line.moveTo(x, y)));
    line.stroke();
  }
  line.restore();
}

// ---------------------------------------------------------------- flow

function flow(g) {
  const { w, h, r, noise, u } = g;
  const m = Math.min(w, h);
  const scale = r.range(1.3, 2) / Math.max(w, h);
  const turn = r.range(1.1, 1.9) * TAU;
  const step = u * 0.85;
  const cx = w * r.range(0.38, 0.62);
  const cy = h * r.range(0.36, 0.56);
  const radius = m * r.range(0.25, 0.32);
  const within = (x, y) => Math.hypot(x - cx, y - cy) < radius;
  const paths = [new Path2D(), new Path2D()];
  const strokes = Math.round(1900 * Math.min(1.2, (w * h) / (m * m * 1.33)));

  for (let i = 0; i < strokes; i++) {
    let x = r.range(0, w);
    let y = r.range(0, h);
    const inside = within(x, y);
    const path = paths[inside && g.n > 1 ? 1 : 0];
    const length = r.int(14, 42);
    path.moveTo(x, y);
    for (let k = 0; k < length; k++) {
      const a = noise.fbm(x * scale + (inside ? 31 : 0), y * scale, 2) * turn + (inside ? Math.PI / 2 : 0);
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      if (within(x, y) !== inside) break;
      path.lineTo(x, y);
    }
  }
  paths.forEach((path, i) => {
    const ctx = g.ink(i);
    ctx.save();
    ctx.lineWidth = u * 0.27;
    ctx.stroke(path);
    ctx.restore();
  });
}

// ---------------------------------------------------------------- type

const FACE = 'Archivo, "Arial Black", "Helvetica Neue", Arial, sans-serif';

// Draw one glyph so its inked bounds fill the given box height, centred on (cx, cy).
function glyph(ctx, ch, cx, cy, height, squeeze = 1) {
  ctx.save();
  ctx.font = `900 200px ${FACE}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const mt = ctx.measureText(ch);
  const gw = mt.actualBoundingBoxLeft + mt.actualBoundingBoxRight;
  const gh = mt.actualBoundingBoxAscent + mt.actualBoundingBoxDescent;
  const s = height / gh;
  ctx.translate(cx, cy);
  ctx.scale(s * squeeze, s);
  ctx.fillText(ch, -gw / 2 + mt.actualBoundingBoxLeft, gh / 2 - mt.actualBoundingBoxDescent);
  ctx.restore();
}

function type(g) {
  const { w, h, r, u, opts: o } = g;
  const glyphs = o.glyphs ?? [r.pick(['&', 'R', 'Q', '8', '?'])];
  const foot = u * 9;
  const boxH = h - foot;
  const a = g.ink(0);
  const b = g.ink(1 % g.n);

  if (glyphs.length === 1) {
    // One block, printed twice, with the sheet moved between passes.
    const size = boxH * 0.86;
    const shift = u * r.range(2.6, 4.2);
    glyph(a, glyphs[0], w / 2 - shift / 2, boxH / 2, size, 0.92);
    glyph(b, glyphs[0], w / 2 + shift / 2, boxH / 2 + shift * 0.35, size, 0.92);
  } else {
    glyph(a, glyphs[0], w * 0.37, boxH * 0.4, boxH * 0.72, 0.9);
    glyph(b, glyphs[1], w * 0.63, boxH * 0.66, boxH * 0.56, 0.9);
  }

  // Specimen line under a rule, set small in the second ink.
  b.save();
  b.fillRect(0, h - foot + u * 1.2, w, u * 0.7);
  b.font = `600 ${u * 2.5}px ${FACE}`;
  b.textBaseline = 'alphabetic';
  if ('letterSpacing' in b) b.letterSpacing = `${u * 0.35}px`;
  b.textAlign = 'left';
  b.fillText(o.caption ?? 'SIXTY LINE GROTESQUE', 0, h - u * 2.2);
  b.textAlign = 'right';
  b.fillText(`HAND SET · No. ${r.int(2, 48)}`, w, h - u * 2.2);
  b.restore();
}

// ---------------------------------------------------------------- halftone

function halftone(g) {
  const { w, h, r, u } = g;
  const m = Math.min(w, h);
  const pitch = u * 2.15;
  const angles = [15, 75, 45].map((d) => (d * Math.PI) / 180);
  const R = m * r.range(0.3, 0.35);
  const cx = w * r.range(0.44, 0.56);
  const cy = h * r.range(0.36, 0.44);
  const lx = r.pick([-0.55, 0.55]);
  const ly = -0.55;
  const ground = cy + R * 1.04;
  const shade = (x, y, ox, oy, rad) => Math.hypot(x - (ox + lx * rad), y - (oy + ly * rad)) / (rad * 1.9);

  // First screen: the large sphere, lit from above.
  dots(g.ink(0), w, h, pitch, angles[0], (x, y) =>
    Math.hypot(x - cx, y - cy) > R ? 0 : clamp(0.1 + shade(x, y, cx, cy, R) * 1.05),
  );

  // Second screen: a smaller sphere in front, the ground and the cast shadow.
  const R2 = R * 0.56;
  const c2x = cx - lx * R * 1.05;
  const c2y = ground - R2 * 0.98;
  dots(g.ink(1 % g.n), w, h, pitch, angles[1], (x, y) => {
    if (Math.hypot(x - c2x, y - c2y) < R2) return clamp(0.16 + shade(x, y, c2x, c2y, R2));
    if (y < ground) return 0;
    const sx = (x - (cx - lx * R * 0.7)) / (R * 1.25);
    const sy = (y - ground - R * 0.14) / (R * 0.2);
    return clamp(0.2 + ((y - ground) / (h - ground)) * 0.3 + Math.exp(-(sx * sx) - sy * sy) * 0.6);
  });

  // Third screen, if there is one: a sky that thins toward the horizon.
  if (g.n > 2) {
    dots(g.ink(2), w, h, pitch, angles[2], (x, y) => (y < ground ? clamp(0.62 - (y / ground) * 0.62) : 0));
  }
}

// ---------------------------------------------------------------- moons

function moonPath(ctx, cx, cy, R, p) {
  // p runs 0..1 through one lunation: 0 is new, 0.5 is full.
  const waxing = p < 0.5;
  const k = Math.cos(p * TAU);
  ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, !waxing);
  ctx.ellipse(cx, cy, Math.abs(k) * R, R, 0, Math.PI / 2, -Math.PI / 2, waxing ? k > 0 : k <= 0);
  ctx.closePath();
}

function moons(g) {
  const { w, h, r, u } = g;
  const m = Math.min(w, h);
  const sky = g.ink(0);
  sky.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h * 0.5;
  const orbit = m * 0.36;
  const R = orbit * 0.17;
  const bodies = [];
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + (i / 12) * TAU;
    bodies.push({ x: cx + Math.cos(a) * orbit, y: cy + Math.sin(a) * orbit, R, p: i / 12 });
  }
  bodies.push({ x: cx, y: cy, R: R * 2.1, p: 0.5 });

  // Stars: specks picked out of the block.
  const stars = [];
  for (let i = 0; i < 90; i++) {
    const x = r.range(0, w);
    const y = r.range(0, h);
    const s = u * r.range(0.18, 0.5);
    if (!bodies.some((b) => Math.hypot(x - b.x, y - b.y) < b.R * 1.5)) stars.push([x, y, s]);
  }
  knockOut(g, (ctx) => {
    stars.forEach(([x, y, s]) => {
      ctx.moveTo(x + s, y);
      ctx.arc(x, y, s, 0, TAU);
    });
  });

  // Gouge marks radiating from the full moon.
  sky.save();
  sky.globalCompositeOperation = 'destination-out';
  sky.lineWidth = u * 0.55;
  sky.lineCap = 'round';
  const centre = bodies[12];
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * TAU + r.range(-0.03, 0.03);
    const r0 = centre.R * r.range(1.22, 1.32);
    const r1 = centre.R * r.range(1.5, 1.85);
    sky.beginPath();
    sky.moveTo(centre.x + Math.cos(a) * r0, centre.y + Math.sin(a) * r0);
    sky.lineTo(centre.x + Math.cos(a) * r1, centre.y + Math.sin(a) * r1);
    sky.stroke();
  }
  // A fine carved outline, so the new moon still has a place.
  sky.lineWidth = u * 0.3;
  bodies.forEach((b) => {
    sky.beginPath();
    sky.arc(b.x, b.y, b.R, 0, TAU);
    sky.stroke();
  });
  sky.restore();

  const lit = g.ink(1 % g.n);
  bodies.forEach((b) => {
    if (b.p === 0) return;
    const trace = (ctx) => moonPath(ctx, b.x, b.y, b.R, b.p);
    knockOut(g, trace);
    lit.beginPath();
    trace(lit);
    lit.fill();
  });
}

// ---------------------------------------------------------------- moire

function moire(g) {
  const { w, h, r, opts: o } = g;
  const m = Math.min(w, h);
  const R = m * 0.47;
  const gap = m * r.range(0.035, 0.055);
  const angle = r.range(0, TAU);
  const rings = o.rings ?? 56;
  [-1, 1].forEach((side, i) => {
    const ctx = g.ink(i % g.n);
    const ox = w / 2 + (Math.cos(angle) * gap * side) / 2;
    const oy = h / 2 + (Math.sin(angle) * gap * side) / 2;
    ctx.save();
    ctx.lineWidth = (R / rings) * 0.44;
    ctx.beginPath();
    for (let k = 1; k <= rings; k++) {
      const rad = (k / rings) * R;
      ctx.moveTo(ox + rad, oy);
      ctx.arc(ox, oy, rad, 0, TAU);
    }
    ctx.stroke();
    ctx.restore();
  });
}

// ---------------------------------------------------------------- plaid

function plaid(g) {
  const { w, h, r, u } = g;
  const sett = Math.min(w, h) / r.pick([2, 2.5, 3]);

  // Half a sett of stripes, mirrored, so the cloth repeats like a real tartan.
  const half = [];
  let total = 0;
  while (total < 0.5) {
    const width = r.pick([0.03, 0.05, 0.08, 0.13]);
    half.push([width, r.pick([1, 1, 0.5, 0])]);
    total += width;
  }
  const stripes = half.concat(half.slice().reverse());
  const sum = stripes.reduce((s, [width]) => s + width, 0);

  const lay = (ctx, vertical) => {
    const span = vertical ? w : h;
    ctx.save();
    for (let p = ((span / 2) % sett) - sett; p < span; ) {
      for (const [width, alpha] of stripes) {
        const px = (width / sum) * sett;
        if (alpha) {
          ctx.globalAlpha = alpha;
          if (vertical) ctx.fillRect(p, 0, px, h);
          else ctx.fillRect(0, p, w, px);
        }
        p += px;
      }
    }
    ctx.restore();
  };
  lay(g.ink(0), true);
  lay(g.ink(1 % g.n), false);

  // Pin lines through the middle of each sett.
  const pin = g.ink(g.n - 1);
  const lw = u * 0.55;
  for (let x = (w / 2) % sett; x < w; x += sett) pin.fillRect(x - lw / 2, 0, lw, h);
  for (let y = (h / 2) % sett; y < h; y += sett) pin.fillRect(0, y - lw / 2, w, lw);
}

// ---------------------------------------------------------------- seigaiha

function seigaiha(g) {
  const { w, h, r, u, opts: o } = g;
  const cols = o.cols ?? 5;
  const R = w / cols / 2;
  const startY = h * (o.moon ? 0.56 : 0.44);

  // Sky: a gradient from the top edge and a disc.
  const sky = g.ink(0);
  const grad = sky.createLinearGradient(0, 0, 0, h * 0.34);
  grad.addColorStop(0, g.tint(0, o.moon ? 0.95 : 0.7));
  grad.addColorStop(1, g.tint(0, 0));
  sky.save();
  sky.fillStyle = grad;
  sky.fillRect(0, 0, w, h * 0.34);
  sky.restore();

  const discR = Math.min(w, h) * (o.moon ? 0.24 : 0.17);
  const dx = w * r.range(0.4, 0.6);
  const dy = startY - discR * (o.moon ? 0.9 : 0.55);
  knockOut(g, (ctx) => ctx.arc(dx, dy, discR, 0, TAU));
  disc(g.ink(1 % g.n), dx, dy, discR);

  // Waves: rows of concentric arcs, each row covering the one behind it.
  const wave = g.ink(0);
  wave.save();
  wave.lineWidth = R * 0.085;
  for (let row = 0, cy = startY; cy - R < h; row++, cy += R * 0.5) {
    const shift = row % 2 ? R : 0;
    for (let cx = shift - R; cx - R < w; cx += R * 2) {
      knockOut(g, (ctx) => ctx.arc(cx, cy, R, 0, TAU));
      wave.beginPath();
      for (let k = 0; k < 4; k++) {
        const rad = R * (0.955 - k * 0.235);
        wave.moveTo(cx + rad, cy);
        wave.arc(cx, cy, rad, 0, TAU);
      }
      wave.stroke();
    }
  }
  // Fade the pattern toward the top, the way a damp brush would.
  const fade = wave.createLinearGradient(0, startY - R, 0, startY + h * 0.3);
  fade.addColorStop(0, 'rgba(0,0,0,0.62)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  wave.globalCompositeOperation = 'destination-out';
  wave.fillStyle = fade;
  wave.fillRect(0, startY - R, w, h * 0.3 + R);
  wave.restore();
}

export const STYLES = { hills, overlap, tiles, cutouts, vessels, ridgelines, flow, type, halftone, moons, moire, plaid, seigaiha };
