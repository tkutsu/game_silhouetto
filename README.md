# Silhouetto

A 3D shadow-matching puzzle. Rotate an abstract shape until its shadow on the wall fits the glowing outline.

Play at [silhouetto.themos.dev](https://silhouetto.themos.dev).

- **Endless**: solve a puzzle and the next one loads right away. Your best time sits in the header.
- **Shareable**: the URL always holds the current puzzle (`?p=<seed>`), so copying it shares that exact shape.

## How it works

Levels are generated, not authored. A seed builds a random cluster of primitives and picks a secret solution rotation. The shape's silhouette at that rotation is the target. Shapes whose silhouettes are too easy to hit by chance get rejected deterministically.

The shadow light, the target overlay, and the scoring all share one orthographic projection, so they line up exactly. The match score is the IoU (intersection over union) of the current and target silhouettes, rendered offscreen at 128×128. The wall shows the live overlap on top of the target: gold where your shadow already covers it, red where it spills outside. Each new closest match plays a rising chime.

Each part of the shape gets its own seeded material (20 styles, from brushed metal to bologna). Materials never affect the score, which only sees the bare geometry.

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
