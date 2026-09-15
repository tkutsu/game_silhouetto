# Silhouetto

A 3D shadow-matching puzzle. Rotate an abstract shape until its shadow on the wall fits the glowing outline.

Play at [silhouetto.themos.dev](https://silhouetto.themos.dev).

- **Endless**: solve a puzzle and the next one loads right away. Your best time sits in the header.
- **Shareable**: the URL always holds the current puzzle (`?p=<seed>`), so copying it shares that exact shape.

## How it works

Levels are generated, not authored. A seed builds a random cluster of objects and picks a secret solution rotation. The shape's silhouette at that rotation is the target. Shapes whose silhouettes are too easy to hit by chance get rejected deterministically.

The shadow light, the target overlay, and the scoring all share one orthographic projection, so they line up exactly. The match score is the IoU (intersection over union) of the current and target silhouettes, rendered offscreen at 128×128. The target outline warms from blue to gold as the match rises, and each new closest match plays a rising chime.

The parts are 127 low-poly CC0 models from Kenney's Food and Holiday kits (see `public/models/CREDITS.md`), in their own flat palette colors. Colors never affect the score, which only sees the bare geometry.

`pnpm dev` also serves `/showcase.html`, a page for browsing every model in both kits and picking which ones the game uses. Run `python3 showcase/fetch-models.py` once to download them.

## Controls

- Drag the shape: tumble it
- Drag the shadow: turn it like a dial (or scroll / two-finger twist / Q/E)
- Arrow keys: rotate

## Development

```sh
pnpm install
pnpm dev
```

Stack: Vite, React, TypeScript, three.js, React Three Fiber, zustand, Tailwind.
