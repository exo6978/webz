// Line icons, drawn on a 24px grid with one stroke weight.

import { raw } from './util.js';

const PATHS = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2a4.3 4.3 0 0 1 7.5-2.9 4.3 4.3 0 0 1 7.5 2.9C19.5 15.4 12 20 12 20Z"/>',
  bag: '<path d="M5.5 8h13l-1 12h-11l-1-12Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  left: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  right: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  loupe: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5.5 5.5M10.5 8v5M8 10.5h5"/>',
  lamp: '<path d="M12 2.5V6"/><path d="M5.5 13.5a6.5 6.5 0 0 1 13 0Z"/><path d="M10 13.5a2 2 0 0 0 4 0"/><path class="lamp__rays" d="M12 18.5V21M7.2 17.6 5.8 19.7M16.8 17.6l1.4 2.1"/>',
};

export function icon(name, className = '') {
  return raw(
    `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`,
  );
}
