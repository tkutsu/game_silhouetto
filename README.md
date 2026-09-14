# Shadow

A daily 3D shadow-matching puzzle. Rotate an abstract shape until its shadow on the wall fits the glowing outline.

- **Daily puzzle**: the same seeded shape for everyone each day, with a timer, streaks, and a shareable result.
- **Practice**: random seeded puzzles, shareable by link (`?p=<seed>`).

## How it works

Levels are generated, not authored. A seed builds a random cluster of primitives and picks a secret solution rotation. The shape's silhouette at that rotation is the target. Shapes whose silhouettes are too easy to hit by chance get rejected deterministically.

The shadow light, the target overlay, and the scoring all share one orthographic projection, so they line up exactly. The match score is the IoU (intersection over union) of the current and target silhouettes, rendered offscreen at 128×128.

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
