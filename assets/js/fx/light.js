// Raking light.
//
// The pointer is a lamp held near the wall. For every frame on screen this works
// out where the lamp is relative to that frame and writes it to custom properties;
// the CSS turns those into a cast shadow that falls away from the light, a shaded
// inner lip, a band of glare on the glass and (at night) how brightly the print is
// lit. Frames marked data-tilt also lean away from the pointer while it is on them.
//
// With no pointer (touch, or the mouse has left the window) the lamp goes back
// to the ceiling, up and to the left.

import { clamp, motionOK } from '../util.js';

const SATURATE = 260; // px from a frame at which the light direction stops changing
const MAX_TILT = 6; // degrees

const visible = new Set();
const observer =
  'IntersectionObserver' in window
    ? new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) visible.add(entry.target);
            else visible.delete(entry.target);
          }
          kick();
        },
        { rootMargin: '60px' },
      )
    : null;

export const lightUp = (frame) => observer?.observe(frame);
export function lightOff(frame) {
  observer?.unobserve(frame);
  visible.delete(frame);
}

let pointer = null;
const lamp = { x: 0, y: 0 };
let primed = false;
let raf = 0;

const ceiling = () => ({ x: innerWidth * 0.32, y: -220 });

function kick() {
  if (!raf) raf = requestAnimationFrame(tick);
}

function tick() {
  raf = 0;
  const goal = pointer ?? ceiling();
  const ease = primed && motionOK() ? 0.16 : 1;
  primed = true;
  lamp.x += (goal.x - lamp.x) * ease;
  lamp.y += (goal.y - lamp.y) * ease;
  const settling = Math.abs(goal.x - lamp.x) + Math.abs(goal.y - lamp.y) > 0.4;
  const reach = Math.max(innerWidth, innerHeight) * 0.55;

  // Read every rectangle first, then write, so layout is only computed once.
  const rects = [];
  for (const frame of visible) {
    if (frame.isConnected) rects.push([frame, frame.getBoundingClientRect()]);
    else visible.delete(frame);
  }
  for (const [frame, r] of rects) {
    if (!r.width) continue;
    const dx = lamp.x - (r.left + r.width / 2);
    const dy = lamp.y - (r.top + r.height / 2);
    const nx = dx / (r.width / 2);
    const ny = dy / (r.height / 2);
    const style = frame.style;
    style.setProperty('--lx', clamp(dx / SATURATE, -1.4, 1.4).toFixed(3));
    style.setProperty('--ly', clamp(dy / SATURATE, -1.4, 1.4).toFixed(3));
    style.setProperty('--lit', (pointer ? clamp(1 - Math.hypot(dx, dy) / reach) : 0.62).toFixed(3));
    style.setProperty('--gx', `${(50 + clamp(nx, -1.7, 1.7) * 36).toFixed(1)}%`);
    if ('tilt' in frame.dataset) {
      const over = pointer && motionOK() && Math.abs(nx) < 1 && Math.abs(ny) < 1;
      style.setProperty('--tx', over ? (nx * MAX_TILT).toFixed(2) : '0');
      style.setProperty('--ty', over ? (-ny * MAX_TILT).toFixed(2) : '0');
    }
  }
  if (settling) kick();
}

export function initLight() {
  window.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType === 'touch') return;
      pointer = { x: event.clientX, y: event.clientY };
      kick();
    },
    { passive: true },
  );
  document.documentElement.addEventListener('pointerleave', () => {
    pointer = null;
    kick();
  });
  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('resize', kick);
  kick();
}
