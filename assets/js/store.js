// Shopper state: the bag and the saved list. Kept in memory, mirrored to
// localStorage when it is available, and announced to whoever is listening.

import { getPrint, remaining, framePrice, FRAMES } from './data.js';
import { load, save } from './util.js';

const listeners = new Map();

export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
}
function emit(event, detail) {
  listeners.get(event)?.forEach((handler) => handler(detail));
}

// ---- bag: [{ id, frame, qty }] ----

const validLine = (line) =>
  line && getPrint(line.id) && FRAMES[line.frame] && Number.isInteger(line.qty) && line.qty > 0;

let bag = load('bag', []);
bag = Array.isArray(bag) ? bag.filter(validLine) : [];

export const lineKey = (line) => `${line.id}|${line.frame}`;
export const getBag = () => bag;
export const bagCount = () => bag.reduce((n, line) => n + line.qty, 0);
export const linePrice = (line) => {
  const print = getPrint(line.id);
  return (print.price + framePrice(print, line.frame)) * line.qty;
};
export const bagTotal = () => bag.reduce((sum, line) => sum + linePrice(line), 0);

// Copies of one print already in the bag, across every framing choice.
const inBag = (id) => bag.filter((line) => line.id === id).reduce((n, line) => n + line.qty, 0);
export const canAdd = (id) => inBag(id) < remaining(getPrint(id));

function commitBag(detail) {
  save('bag', bag);
  emit('bag', detail);
}

// Returns false when the edition has no more copies to give.
export function addToBag(id, frame = 'none') {
  if (!canAdd(id)) return false;
  const line = bag.find((l) => l.id === id && l.frame === frame);
  if (line) line.qty += 1;
  else bag.push({ id, frame, qty: 1 });
  commitBag({ added: id });
  return true;
}

export function changeQty(key, delta) {
  const line = bag.find((l) => lineKey(l) === key);
  if (!line) return;
  if (delta > 0 && !canAdd(line.id)) return;
  line.qty += delta;
  if (line.qty <= 0) bag = bag.filter((l) => l !== line);
  commitBag({});
}

export function removeLine(key) {
  bag = bag.filter((l) => lineKey(l) !== key);
  commitBag({});
}

export function clearBag() {
  bag = [];
  commitBag({});
}

// ---- saved prints ----

const stored = load('saved', []);
const saved = new Set(Array.isArray(stored) ? stored.filter((id) => getPrint(id)) : []);

export const isSaved = (id) => saved.has(id);
export const savedIds = () => Array.from(saved);

export function toggleSaved(id) {
  if (saved.has(id)) saved.delete(id);
  else saved.add(id);
  save('saved', Array.from(saved));
  emit('saved', { id, saved: saved.has(id) });
  return saved.has(id);
}
