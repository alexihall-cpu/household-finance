# Kodu mark assets (Identity C, Mark V7 assets, copied 21 Nov 2026; replaced if Identity issues V5)
Copied from Identity/Mark V7/assets/. All use currentColor: they take `--brand-mark` (or `--brand-mark-on-dark` on tiles) from the parent's `color`.
- `kodu-symbol.svg` roof over lit window; use from 41px up. `kodu-symbol-29.svg`: the dedicated drawing for 17 to 40px (the AppMark's 24px symbol uses this one). `kodu-symbol-16.svg` pixel-grid drawing; use at 16px and below (and favicons in tabs).
- `kodu-logotype.svg` lowercase 'kodu', outlined Plex Sans 600. Size by CSS height (18px in the AppMark). `kodu-lockup.svg` symbol + logotype in one file.
- `currentColor` does not work through `<img>`. Use inline SVG, or the sprite: `<svg class="k-mark__symbol" aria-hidden="true"><use href="kodu/mark/kodu-mark-sprite.svg#symbol"/></svg>` (same origin only; ids: symbol, symbol-29, symbol-16, logotype, lockup).
- Accessible name: the AppMark's text, 'Kodu Finance' etc. (visually hidden), never the lowercase drawing.
