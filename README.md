# Pixel Portrait Maker

Turn any photo into a pixel grid where **every block is exactly one color** — a hand-drawing reference for retro pixel portraits and posters.

**Live app:** https://nan0dev06.github.io/pixel-portrait/

## Why I made this

My uncle makes handmade, traditional pixel-art drawings — retro portraits and posters that he draws by hand, block by block, on paper. To do that he needs a clean reference: a pixelated version of a photo where each square is a single, solid color he can match with paint or pencil.

The problem was that every tool he tried (mostly AI-based ones) gave him a "pixelated" image where a single block still contained several colors, or that drifted away from the real photo. That is useless as a drawing guide — if one square isn't one color, he can't reproduce it by hand.

So I built this little side project for him. It does one thing properly: it shrinks the photo so each block is the true average color of that area (faithful to the original), then reduces the whole picture to a limited palette he can actually paint with. Then it can number every block, size the grid to the exact paper he's using, and keep a history of everything he's made — so it fits how he actually works at his desk.

## Features

- **One color per block, guaranteed** — no mixed-color cells, faithful to the original photo
- **Setup wizard** — asks about your paper up front: free-form, blank paper with a known square size, or paper that already has a grid ruled on it
- **Grid width** control (10–120 blocks across; height follows the photo's proportions)
- **Color count** control (2–40) — fewer colors is simpler to paint, more is closer to the photo
- **Paper sizes** — A4, half-A4/A5, A3, or custom mm; shows the real square size and drawing dimensions
- **Smart recommendation** — suggests the best square size for your photo's resolution so it stays sharp without becoming too fiddly to draw
- **Paint-by-number mode** — every block shows its color number, with a legend (number → swatch → hex)
- **Download PNG** — with or without the color legend, and the paper measurements stamped on
- **History folder** — connect a folder on your computer and every created image is saved there automatically, browsable inside the app (view, re-download, delete). In browsers without folder access, history is kept in the browser instead.
- **Windows XP look** — because my uncle likes XP :)

## Usage

Open the [live app](https://nan0dev06.github.io/pixel-portrait/), or download this repo and open `index.html` in a browser — no install, no server, no dependencies. Works offline.

The history folder feature uses the File System Access API (Chrome / Edge on desktop).

## Structure

- `index.html` — markup
- `style.css` — Windows XP "Luna" theme (hand-rolled, no libraries)
- `app.js` — all logic (quantization, rendering, wizard, history)
