# Kodu mark assets (Mark V9, copied 22 Nov 2026)
Copied from Identity/Mark V9/assets/. Decision (Alexi, 22 Nov): each app's logo and favicon is its own roof-over-glyph; the parent brand is the "kodu" wordmark alone. The roof-over-window symbol, `kodu-logotype.svg` and `kodu-lockup.svg` are retired and removed.
- `kodu-symbol-{finance,photos,recipes}.svg`: roof over that app's glyph (chart, hill, pot); use from 41px up. `-29`: dedicated drawing for 17 to 40px (the AppMark uses this one at 24px). `-16`: pixel-grid drawing for 16px and below. All `currentColor`.
- `kodu-wordmark.svg`: lowercase "kodu", outlined, `currentColor`. Size by CSS height (18px in the AppMark). The parent brand uses this alone.
- `kodu-lockup-{app}.svg` and `-dark.svg`: symbol + wordmark in one file, glyph in the app colour, text outlined. Fixed colours, so use as `<img>` only on a known light or dark ground; in themed UI build the AppMark from the sprite instead.
- `kodu-mark-sprite.svg` ids: `symbol-{app}`, `symbol-{app}-29`, `symbol-{app}-16`, `wordmark`. `currentColor` does not work through `<img>`; use inline SVG or the sprite (same origin): `<svg class="k-mark__symbol" aria-hidden="true"><use href="kodu/mark/kodu-mark-sprite.svg#symbol-finance-29"/></svg>`.
- Accessible name: the AppMark's text, "Kodu Finance" etc. (visually hidden), never the lowercase drawing.
- Held out of the apps until Alexi signs off V9. Finance's inline roof-over-chart stand-in is to be replaced by `symbol-finance`.
