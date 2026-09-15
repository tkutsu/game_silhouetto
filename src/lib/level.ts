import { Quaternion, Vector3, type BufferGeometry, type CanvasTexture } from 'three'
import { CAM_POS, CAM_TARGET, DEGENERATE_IOU, SCORE_RES, STEP, TARGET_RES, WIN_IOU } from './constants'
import { generateShape, partsFor } from './generateShape'
import { hashString, randomQuaternion, rngFor, type Rng } from './rng'
import { coverage, iou, maskTexture, type Mask, type Silhouetter } from './silhouette'

export interface Level {
  seed: string
  difficulty: number
  /** Object kind per geometry group, in group order. */
  kinds: string[]
  geometry: BufferGeometry
  solution: Quaternion
  start: Quaternion
  /** Grid moves that took the solution to `start`, in order. */
  scramble: Move[]
  target: Mask
  targetTexture: CanvasTexture
}

const PROBES = 24
const MAX_ATTEMPTS = 20

/**
 * Pitch about the camera's right vector, not world X: the camera sits ~34° off
 * the wall normal, so a world-X step would show up as more than half roll and
 * vertical drags would feel twisted. Yaw stays on world Y (turntable) and roll
 * on world Z (the light axis, which the shadow dial spins around).
 */
const camRight = new Vector3(...CAM_TARGET)
  .sub(new Vector3(...CAM_POS))
  .cross(new Vector3(0, 1, 0))
  .normalize()

export const AXES = [camRight, new Vector3(0, 1, 0), new Vector3(0, 0, 1)]

/** One grid step, premultiplied: `axis` is one of AXES. */
export interface Move {
  axis: Vector3
  dir: number
}

/** Random walk of grid steps away from the solution, so it stays reachable. */
function scramble(rng: Rng, solution: Quaternion, count: number) {
  const q = solution.clone()
  const turn = new Quaternion()
  const moves: Move[] = []
  for (let i = 0; i < count; i++) {
    const move = { axis: AXES[Math.floor(rng() * 3)], dir: rng() < 0.5 ? -1 : 1 }
    q.premultiply(turn.setFromAxisAngle(move.axis, move.dir * STEP))
    moves.push(move)
  }
  return { q: q.normalize(), moves }
}

/** Seeds look like `practice-3.k2j4h`: difficulty, dot, random id. Old links without it are difficulty 1. */
export function difficultyOf(seed: string): number {
  const m = seed.match(/-(\d+)\./)
  return m ? Math.max(1, Math.min(12, Number(m[1]))) : 1
}

/**
 * Orientations whose shadow is a flip of the solution's: each roll step spins the
 * shadow in-plane, and a 180° yaw mirrors it, so yaw-180 combined with every roll
 * covers mirrors about every step axis. A near-symmetric silhouette scores high on
 * one of these: a decoy fit just under the win threshold, a 180+180 dance away
 * from the solution, which the random probes almost never land on.
 */
function decoys(solution: Quaternion): Quaternion[] {
  const rolls = Math.round((2 * Math.PI) / STEP)
  const mirror = new Quaternion().setFromAxisAngle(AXES[1], Math.PI)
  const roll = new Quaternion()
  const list: Quaternion[] = []
  for (let k = 0; k < rolls; k++) {
    roll.setFromAxisAngle(AXES[2], k * STEP)
    if (k > 0) list.push(solution.clone().premultiply(roll))
    list.push(solution.clone().premultiply(mirror).premultiply(roll))
  }
  return list
}

interface Attempt {
  score: number
  attempt: number
  geometry: BufferGeometry
  kinds: string[]
  solution: Quaternion
  target: Mask
}

/**
 * Deterministic for a seed: rejects shapes whose silhouette is too easy to hit by
 * chance (round/symmetric blobs), has a near-symmetric decoy orientation, or is too
 * small/large to read. If every attempt fails, the least-degenerate one is used.
 */
export function buildLevel(seed: string, sil: Silhouetter): Level {
  const difficulty = difficultyOf(seed)

  const finish = ({ attempt, geometry, kinds, solution, target }: Attempt): Level => {
    const startRng = rngFor(`${seed}#${attempt}#start`)
    const starts = Array.from({ length: 8 }, () => {
      const walk = scramble(startRng, solution, 8 + 2 * difficulty)
      return { ...walk, score: iou(sil.render(geometry, walk.q, SCORE_RES), target) }
    })
    const { q: start, moves } = starts.reduce((a, b) => (b.score < a.score ? b : a))
    const label = `FIG. ${100 + (hashString(seed) % 900)} · ${'★'.repeat(partsFor(difficulty))}`
    const targetTexture = maskTexture(sil.render(geometry, solution, TARGET_RES), TARGET_RES, label)
    return { seed, difficulty, kinds, geometry, solution, start, scramble: moves, target, targetTexture }
  }

  let fallback: Attempt | undefined
  for (let attempt = 0; ; attempt++) {
    const rng = rngFor(`${seed}#${attempt}`)
    const { geometry, kinds } = generateShape(rng, difficulty)
    const solution = randomQuaternion(rng)
    const target = sil.render(geometry, solution, SCORE_RES)

    const probeRng = rngFor(`${seed}#${attempt}#probe`)
    let worst = 0
    for (let i = 0; i < PROBES && worst < DEGENERATE_IOU; i++) {
      worst = Math.max(worst, iou(sil.render(geometry, randomQuaternion(probeRng), SCORE_RES), target))
    }
    for (const q of decoys(solution)) {
      if (worst >= DEGENERATE_IOU) break
      // a flip that clears the win threshold is a second solution, not a trap
      const decoy = iou(sil.render(geometry, q, SCORE_RES), target)
      if (decoy < WIN_IOU) worst = Math.max(worst, decoy)
    }
    const fill = coverage(target)

    if (worst < DEGENERATE_IOU && fill > 0.1 && fill < 0.5) {
      fallback?.geometry.dispose()
      return finish({ score: worst, attempt, geometry, kinds, solution, target })
    }
    const score = worst + (fill > 0.1 && fill < 0.5 ? 0 : 1)
    if (!fallback || score < fallback.score) {
      fallback?.geometry.dispose()
      fallback = { score, attempt, geometry, kinds, solution, target }
    } else geometry.dispose()
    if (attempt === MAX_ATTEMPTS - 1) return finish(fallback)
  }
}
