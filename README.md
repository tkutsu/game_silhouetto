# Silhouetto

A 3D shadow-matching puzzle. Turn a little scene of low-poly toys until its shadow on the wall fits the glowing outline.

Play at [silhouetto.themos.dev](https://silhouetto.themos.dev).

- **Runs**: every solve bumps the level and scores points against a par time. Each puzzle has a countdown that starts on your first move (twice par, plus 20 seconds when there's only one object). Run out of time and one of your 3 Solves gets spent; with none left, the run ends.
- **Shareable**: the URL always holds the current puzzle (`?p=<seed>`), so copying it shares that exact shape.

## How it works

Levels are generated, not authored. A seed builds a random scene of objects (things on a plate or a sled, a fork stuck in a cake) and picks a secret solution rotation. The shape's silhouette at that rotation is the target. Shapes whose silhouettes are too easy to hit by chance get rejected deterministically.

The shadow light, the target overlay, and the scoring all share one orthographic projection, so they line up exactly. The match score is the IoU (intersection over union) of the current and target silhouettes, rendered offscreen at 128×128. The target outline warms from blue to gold as the match rises, and each new closest match plays a rising chime.

The parts are 127 low-poly CC0 models from Kenney's Food and Holiday kits (see `public/models/CREDITS.md`), in their own flat palette colors. Colors never affect the score, which only sees the bare geometry.

`pnpm dev` also serves `/showcase.html`, a page for browsing every model in both kits and picking which ones the game uses. Run `python3 showcase/fetch-models.py` once to download them.

## Controls

- Drag the shape: tumble it
- Drag the blueprint around the shadow: spin it like a dial (or scroll / two-finger twist / Q/E)
- Arrow keys: rotate

## Development

```sh
pnpm install
pnpm dev
```

Stack: Vite, React, TypeScript, three.js, React Three Fiber, zustand, Tailwind.
