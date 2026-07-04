# Pixel Portrait Maker

Turn any photo into a pixel grid where **every block is exactly one color** — a hand-drawing reference for retro pixel portraits and posters.

Most pixelation tools blur or reinterpret the image, leaving multiple colors inside one block. This app downscales the photo so each block becomes the average color of that area (faithful to the original), then reduces those colors to a limited palette you can actually paint with.

## Features

- **One color per block, guaranteed** — no mixed-color cells
- **Grid width** control (10–120 blocks across; height follows the photo's proportions)
- **Color count** control (2–40) — fewer colors is simpler to paint, more is closer to the photo
- **Paint-by-number mode** — every block shows its color number, with a legend (number → swatch → hex)
- **Download PNG** at full resolution, with the color legend included when numbering is on
- **History folder** — connect a folder on your computer and every created image is saved there automatically, browsable inside the app (view, re-download, delete). In browsers without folder access, history is kept in the browser instead.

## Usage

Open `index.html` in a browser — no install, no server, no dependencies. Works offline.

The history folder feature uses the File System Access API (Chrome / Edge on desktop).
