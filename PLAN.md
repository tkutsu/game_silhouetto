# Shadow — daily 3D shadow-matching puzzle

Rotate an abstract 3D shape until its cast shadow matches a target silhouette on the wall.
Daily puzzle (same seed for everyone) + endless practice mode (random seeds). Fully static,
no backend.

## Core insight

Levels are free. Generate any random shape from a seed, pick a random *solution rotation*,
render the shape's silhouette from the light's point of view at that rotation — that image
**is** the target. The player rediscovers the rotation (or any symmetric equivalent — scoring
is by silhouette overlap, so symmetries are automatically fair).

## Stack

- Vite + React + TypeScript (pnpm)
- three + @react-three/fiber + @react-three/drei
- Tailwind v4 for the HUD/overlay UI
- zustand for game state
- No server. Daily seed = hash of UTC date string. Deploy anywhere static.

## Scene & rendering

- Fixed perspective camera looking at the scene from a 3/4 angle: shape floating mid-air,
  wall plane behind it, floor optional. Moody dark aesthetic, single warm spotlight vibe.
- **One orthographic projection rules everything.** A `DirectionalLight` with an ortho
  shadow camera casts the visible shadow onto the wall. The *same* ortho frustum is used
  for (a) rendering the target silhouette texture and (b) rendering the current silhouette
  for scoring. This guarantees the visible shadow, the target overlay on the wall, and the
  score all align pixel-perfectly.
- Target silhouette is shown ON the wall as a semi-transparent tinted texture (or outline),
  positioned exactly where the shadow falls — the player literally drags the shadow into
  the outline. Live match % is a secondary readout.

## Level generation (seeded)

- `mulberry32` PRNG + string hash. Seed: `YYYY-MM-DD` (daily) or random (practice).
- Assemble 5–9 primitives (boxes, cylinders, capsules, torus arcs) with seeded scales,
  positions clustered near origin, random orientations; bias toward elongated pieces for
  interesting silhouettes. Merge into one `BufferGeometry` (`mergeGeometries`), matte
  single-color material.
- Solution rotation: seeded random unit quaternion.
- **Degeneracy check:** sample ~20 random rotations; if the best IoU vs the target exceeds
  ~0.8, the shape is too round/symmetric to be a puzzle — regenerate with the next sub-seed
  (deterministic, so everyone still gets the same daily).

## Controls

- Drag anywhere = arcball rotation of the *shape* (2 DOF, camera never moves).
- Third axis (roll): scroll wheel / two-finger twist on touch. Shadowmatic-style.
- Small inertia/damping on release for feel.

## Scoring

- Every ~200 ms during drag + on pointer-up: render current silhouette to a small
  offscreen render target (128×128, black on white), `readRenderTargetPixels`, compute
  IoU against the cached target pixels on CPU (16k pixels — trivial).
- Win when IoU ≥ threshold (~0.93–0.95, tuned to forgive anti-aliasing) — brief hold at
  threshold before declaring victory so grazing past it doesn't trigger.
- Match meter shown as a percentage with a "warmer/colder" color ramp.

## Daily format & sharing

- Puzzle number = days since epoch date. Timer starts on first drag.
- On win: modal with time + final match %, streak, and copy-to-clipboard share text:
  `Shadow #42 🌑 2:13 · 97.8%` (+ emoji bar for flair).
- localStorage: per-day completion, times, streak. Practice mode ("random puzzle" button)
  doesn't touch stats.

## File structure

```
src/
  lib/rng.ts            # mulberry32, string hash, sub-seeds
  lib/generateShape.ts  # seed -> merged BufferGeometry + solution quaternion
  lib/silhouette.ts     # ortho render-to-target, readback, IoU
  lib/daily.ts          # date -> seed, puzzle number
  state/store.ts        # zustand: rotation, match %, solved, timer, mode
  components/Scene.tsx  # Canvas, light, wall, shadow setup
  components/Shape.tsx  # mesh + arcball drag + roll
  components/Wall.tsx   # wall plane + target silhouette texture
  components/HUD.tsx    # match meter, timer, help, practice button
  components/WinModal.tsx
```

## Milestones

1. **Playable core** — scaffold; scene with a hardcoded shape, light, wall, working
   shadow; arcball drag + roll. *Feel check here — controls make or break it.*
2. **Generation** — seeded shape assembly, solution rotation, render target silhouette,
   overlay it on the wall.
3. **Scoring & win** — silhouette readback loop, IoU, match meter, win detection,
   degeneracy rejection.
4. **Daily & share** — date seed, puzzle number, timer, localStorage stats, share text,
   practice mode.
5. **Polish** — mobile touch (twist gesture), win animation, onboarding hint,
   aesthetic pass, difficulty tuning of primitive ranges.

## Risks / open questions

- **Alignment** between visible shadow, wall overlay, and scoring buffer is the one thing
  that must be exact — solved by sharing the single ortho frustum (milestone 2 proves it).
- Roll control discoverability on desktop (wheel) needs an onboarding hint.
- IoU threshold + degeneracy cutoff need empirical tuning once shapes exist.
- Later ideas (out of scope now): hard mode with two lights/two walls, hint button that
  nudges toward solution, archive of past dailies.
