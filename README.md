# Overprint

A concept marketplace for small-run art prints, built as a static site with no
dependencies and no build step. The presses, prints and prices are sample data
and checkout takes no payment.

## Run it

The site uses ES modules, so it needs to be served over HTTP rather than opened
from disk. Any static server works:

```bash
python3 -m http.server 4173
```

Then open http://localhost:4173. To publish it, push to GitHub and enable Pages
for the branch root.

## What is in it

- **Home**: a hero wall hung to scale, a filterable and sortable grid (technique,
  ink, search), a press directory and a payout calculator.
- **Listing page** (`#print-<id>`): the print on a stage with three views (on the
  wall with a loupe, pulled apart into ink separations, and hung in a room drawn
  to scale), a frame picker and the edition shown as tally marks.
- **Press page** (`#press-<id>`), **saved prints** (`#saved`) and a bag drawer.
  The bag and saved list are kept in `localStorage`.

## Effects

| Effect | Where |
| --- | --- |
| Raking light: shadows, glare and tilt follow the pointer | `assets/js/fx/light.js` |
| Prints arrive pass by pass, one ink at a time | `assets/js/art/thumbs.js` |
| Headline slides into register; two-ink buttons | `assets/css/views.css`, `assets/css/base.css` |
| Card to listing shared-element transition, lights switch reveal | `assets/js/router.js`, `assets/js/main.js` |
| Loupe with a true millimetre scale, exploded separations | `assets/js/ui/detail.js` |
| Grid reflow, fly-to-bag, cursor companion | `assets/js/fx/motion.js` |

All motion is switched off under `prefers-reduced-motion`.

## Changing the catalogue

Everything shown comes from `assets/js/data.js`. Artwork is generated in the
browser from each print's `style`, `seed` and `inks` (generators live in
`assets/js/art/styles.js`). To sell real work, give a print an `image` URL and
it is shown as-is.

## Fonts

Archivo, Newsreader and IBM Plex Mono are bundled in `assets/fonts` under the
SIL Open Font License; the licence texts sit beside them.
