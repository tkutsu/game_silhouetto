import { Quaternion, Vector3, type BufferGeometry, type CanvasTexture } from 'three'
import { DEGENERATE_IOU, SCORE_RES, STEP, TARGET_RES, WIN_IOU } from './constants'
import { disposeShape, generateShape, partsFor, type GeneratedShape, type ShapePart } from './generateShape'
import { hashString, randomQuaternion, rngFor, type Rng } from './rng'
import { coverage, iou, maskTexture, type Mask, type Silhouetter } from './silhouette'

export interface Level {
  seed: string
  difficulty: number
  /** Object kind per model, in `parts` order. */
  kinds: string[]
  geometry: BufferGeometry
  /** The models on their own, for the win flourish; together they are `geometry`. */
  parts: ShapePart[]
  solution: Quaternion
  start: Quaternion
  /** Grid moves that took the solution to `start`, in order. */
  scramble: Move[]
  /** How close this puzzle's shadow has to fit to count, between DEGENERATE_IOU and WIN_IOU. */
  winIou: number
  target: Mask
  targetTexture: CanvasTexture
}

const PROBES = 24
const MAX_ATTEMPTS = 20

/** Pitch, yaw and roll: the normals of the side wall, floor and back wall blueprints. Roll is the light axis. */
export const AXES = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)]

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

/** The six orientations one click away: the nearest wrong answers, and the hardest to tell from the real one. */
function neighbours(solution: Quaternion): Quaternion[] {
  const turn = new Quaternion()
  return AXES.flatMap((axis) => [-1, 1].map((dir) => solution.clone().premultiply(turn.setFromAxisAngle(axis, dir * STEP))))
}

/** Slack under the nearest click, so the pose that sets the bar clears it. */
const WIN_MARGIN = 0.01

/**
 * How close is close enough, per level. A 15° click is the finest move there is, so the
 * bar sits just under the best score the piece can reach one click off the solution: if
 * turning a dial from there would barely change the shadow, then what's on the wall is as
 * good as the eye can judge, and it counts. Where a click does visibly change the shadow
 * that score is low, the floor takes over, and only the real thing will do.
 *
 * Floored at DEGENERATE_IOU and at `worst` (the best any orientation reached by chance
 * scored) so no level can be won on a pose stumbled into, and capped at WIN_IOU so none
 * ever asks for more precision than the eye can see.
 */
function winThreshold(sil: Silhouetter, geometry: BufferGeometry, solution: Quaternion, target: Mask, worst: number) {
  let near = 0
  for (const q of neighbours(solution)) {
    near = Math.max(near, iou(sil.render(geometry, q, SCORE_RES), target))
  }
  return Math.min(WIN_IOU, Math.max(DEGENERATE_IOU, worst, near - WIN_MARGIN))
}

interface Attempt {
  score: number
  /** Best IoU any wrong orientation reached, before the fill penalty. */
  worst: number
  attempt: number
  shape: GeneratedShape
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

  const finish = ({ attempt, shape, solution, target, worst }: Attempt): Level => {
    const { geometry } = shape
    const winIou = winThreshold(sil, geometry, solution, target, worst)
    const startRng = rngFor(`${seed}#${attempt}#start`)
    const starts = Array.from({ length: 8 }, () => {
      const walk = scramble(startRng, solution, 8 + 2 * difficulty)
      return { ...walk, score: iou(sil.render(geometry, walk.q, SCORE_RES), target) }
    })
    const { q: start, moves } = starts.reduce((a, b) => (b.score < a.score ? b : a))
    const label = `FIG. ${100 + (hashString(seed) % 900)} · ${'★'.repeat(partsFor(difficulty))}`
    const targetTexture = maskTexture(sil.render(geometry, solution, TARGET_RES), TARGET_RES, label)
    return { seed, difficulty, ...shape, solution, start, scramble: moves, target, targetTexture, winIou }
  }

  let fallback: Attempt | undefined
  for (let attempt = 0; ; attempt++) {
    const rng = rngFor(`${seed}#${attempt}`)
    const shape = generateShape(rng, difficulty)
    const { geometry } = shape
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
      if (fallback) disposeShape(fallback.shape)
      return finish({ score: worst, worst, attempt, shape, solution, target })
    }
    const score = worst + (fill > 0.1 && fill < 0.5 ? 0 : 1)
    if (!fallback || score < fallback.score) {
      if (fallback) disposeShape(fallback.shape)
      fallback = { score, worst, attempt, shape, solution, target }
    } else disposeShape(shape)
    if (attempt === MAX_ATTEMPTS - 1) return finish(fallback)
  }
}
