// Seeded randomness and value noise.
// Every artwork on the site is drawn from its listing's seed, so a print
// always renders the same way on every visit and at every size.

export function hashString(str) {
  // FNV-1a, 32 bit
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRng(seed) {
  let a = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0;

  // mulberry32
  const f = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    f,
    range: (min, max) => min + f() * (max - min),
    int: (min, max) => Math.floor(min + f() * (max - min + 1)),
    pick: (list) => list[Math.floor(f() * list.length)],
    chance: (p) => f() < p,
    sign: () => (f() < 0.5 ? -1 : 1),
    shuffle(list) {
      const out = list.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(f() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

// Smooth 2D value noise in the range 0..1, plus a fractal sum of it.
export function createNoise(rng) {
  const values = new Float32Array(256);
  const perm = new Uint8Array(512);
  const order = rng.shuffle(Array.from({ length: 256 }, (_, i) => i));
  for (let i = 0; i < 256; i++) {
    values[i] = rng.f();
    perm[i] = perm[i + 256] = order[i];
  }

  const fade = (t) => t * t * (3 - 2 * t);
  const mix = (a, b, t) => a + (b - a) * t;

  function n2(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const X = xi & 255;
    const Y = yi & 255;
    const u = fade(x - xi);
    const v = fade(y - yi);
    const v00 = values[perm[perm[X] + Y]];
    const v10 = values[perm[perm[X + 1] + Y]];
    const v01 = values[perm[perm[X] + Y + 1]];
    const v11 = values[perm[perm[X + 1] + Y + 1]];
    return mix(mix(v00, v10, u), mix(v01, v11, u), v);
  }

  function fbm(x, y, octaves = 4) {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * n2(x * freq, y * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }

  return { n2, fbm };
}
