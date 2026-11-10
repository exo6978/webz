// Thumbnails.
//
// Each print is rendered once. The first frame on screen that asked for it shows
// the print arriving pass by pass, one ink wiping in after another; the finished
// sheet is then kept as a blob URL that every other place (hero wall, bag, press
// pages) reuses as a plain <img>.

import { renderLayers, flatten, fontsReady, makeCanvas } from './engine.js';
import { clamp, motionOK, inViewport, nextFrame, idle } from '../util.js';

const THUMB = 640; // long side of the sheet, in px
const PASS = 300; // ms for one ink to wipe in
const STAGGER = 130; // ms between passes

const urls = new Map(); // print id -> blob URL
const waiting = new Map(); // print id -> hosts still to be filled
const queue = [];
let running = false;

export const thumbUrl = (print) => print.image ?? urls.get(print.id) ?? null;

// `host` is a .print element containing an <img>.
export function mountThumb(host, print) {
  const img = host.querySelector('img');
  const ready = thumbUrl(print);
  if (ready) {
    img.src = ready;
    return;
  }
  if (!waiting.has(print.id)) {
    waiting.set(print.id, new Set());
    queue.push(print);
  }
  waiting.get(print.id).add(host);
  pump();
}

const onScreen = (print) => [...waiting.get(print.id)].some((host) => host.isConnected && inViewport(host, 240));

async function pump() {
  if (running) return;
  running = true;
  await fontsReady;
  while (queue.length) {
    // Whatever can be seen right now goes first; the rest fills in while idle.
    const index = queue.findIndex(onScreen);
    const [print] = queue.splice(Math.max(0, index), 1);
    await (index >= 0 ? nextFrame() : idle());
    try {
      produce(print);
    } catch (error) {
      console.error(`Could not render "${print.id}"`, error);
      waiting.delete(print.id);
    }
  }
  running = false;
}

function produce(print) {
  const render = renderLayers(print, THUMB);
  const canvas = makeCanvas(render.W, render.H);
  const stage = [...waiting.get(print.id)].find((host) => host.isConnected && inViewport(host));

  const finish = () => {
    const publish = (url) => {
      urls.set(print.id, url);
      const hosts = waiting.get(print.id) ?? [];
      waiting.delete(print.id);
      hosts.forEach((host) => {
        const img = host.querySelector('img');
        if (img) img.src = url;
      });
      if (stage) {
        const img = stage.querySelector('img');
        const swap = () => canvas.remove();
        if (img?.decode) img.decode().then(swap, swap);
        else swap();
      }
    };
    canvas.toBlob(
      (blob) => publish(blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/jpeg', 0.9)),
      'image/jpeg',
      0.9,
    );
  };

  if (stage && motionOK()) {
    stage.append(canvas);
    wipe(canvas, render).then(finish);
  } else {
    flatten(render, canvas);
    finish();
  }
}

// Draw the sheet, then let each ink run down it in turn.
function wipe(canvas, render) {
  const total = PASS + STAGGER * (render.layers.length - 1);
  const start = performance.now();
  const draw = (now) => {
    const t = now - start;
    flatten(
      render,
      canvas,
      render.layers.map((_, i) => {
        const p = clamp((t - i * STAGGER) / PASS);
        return 1 - Math.pow(1 - p, 2);
      }),
    );
    return t >= total;
  };
  draw(start);
  return new Promise((resolve) => {
    const frame = (now) => (draw(now) ? resolve() : requestAnimationFrame(frame));
    requestAnimationFrame(frame);
  });
}
