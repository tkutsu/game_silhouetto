import { Quaternion, type BufferGeometry, type CanvasTexture, type Vector3 } from 'three'
import { AXES, BACK, DEGENERATE_IOU, SCORE_RES, STEP, TARGET_RES, WIN_IOU } from './constants'
import { disposeShape, generateShape, partsFor, type GeneratedShape, type ShapePart } from './generateShape'
import { hashString, randomQuaternion, rngFor, type Rng } from './rng'
import { coverage, iou, maskTexture, type Mask, type Silhouetter } from './silhouette'

/** One lit projection: the outline on a blueprint, and the shadow that has to land inside it. */
export interface View {
  /** The axis it looks down, which is also its blueprint and its dial. */
  axis: number
  target: Mask
  texture: CanvasTexture
  /** How close this projection has to fit to count, between DEGENERATE_IOU and WIN_IOU. */
  winIou: number
}

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
  /** The projections in play, always including the back wall. All of them have to match. */
  views: View[]
}

/**
 * The projections lit at a difficulty. The first puzzles show all three, so the piece can be
 * read off one blueprint at a time; then the side wall goes dark, then the floor, until only
 * the back wall is left and its one shadow has to be found in all three axes at once.
 */
export function viewsFor(difficulty: number): number[] {
  if (difficulty <= 2) return [0, 1, BACK]
  if (difficulty <= 4) return [1, BACK]
  return [BACK]
}

/** Drafting names for the three views, printed on each blueprint. */
const VIEW_NAMES = ['SIDE', 'PLAN', 'FRONT']

const PROBES = 24
const MAX_ATTEMPTS = 20

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
function winThreshold(sil: Silhouetter, geometry: BufferGeometry, solution: Quaternion, view: View, worst: number) {
  let near = 0
  for (const q of neighbours(solution)) {
    near = Math.max(near, iou(sil.render(geometry, q, SCORE_RES, view.axis), view.target))
  }
  return Math.min(WIN_IOU, Math.max(DEGENERATE_IOU, worst, near - WIN_MARGIN))
}

/** How well an orientation fits each lit outline. */
export function scoreViews(sil: Silhouetter, geometry: BufferGeometry, q: Quaternion, views: View[]): number[] {
  return views.map((view) => iou(sil.render(geometry, q, SCORE_RES, view.axis), view.target))
}

/** Every lit projection has to be close enough; the tightest one decides. */
export const winsAll = (matches: number[], views: View[]) => matches.every((m, i) => m >= views[i].winIou)

/** Where a projection starts reading as warm; below this the outline stays cold and the meter empty. */
export const MATCH_FLOOR = 0.35

/** One projection's share of the meter: 0 at the point it starts warming, 1 the moment it would count. */
export const progressOf = (match: number, view: View) =>
  Math.min(1, Math.max(0, (match - MATCH_FLOOR) / (view.winIou - MATCH_FLOOR)))

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
    const fig = `FIG. ${100 + (hashString(seed) % 900)}`
    const stars = '★'.repeat(partsFor(difficulty))
    const views = viewsFor(difficulty).map((axis): View => {
      const mask = axis === BACK ? target : sil.render(geometry, solution, SCORE_RES, axis)
      const label = `${fig} · ${VIEW_NAMES[axis]} · ${stars}`
      const view: View = {
        axis,
        target: mask,
        texture: maskTexture(sil.render(geometry, solution, TARGET_RES, axis), TARGET_RES, label),
        winIou: 0,
      }
      // only the back wall was probed for lucky orientations; the others just have to beat a click
      view.winIou = winThreshold(sil, geometry, solution, view, axis === BACK ? worst : 0)
      return view
    })
    const startRng = rngFor(`${seed}#${attempt}#start`)
    const starts = Array.from({ length: 8 }, () => {
      const walk = scramble(startRng, solution, 8 + 2 * difficulty)
      const scores = scoreViews(sil, geometry, walk.q, views)
      return { ...walk, score: scores.reduce((a, b) => a + b, 0) / scores.length }
    })
    // the start that looks wrong on every lit blueprint at once
    const { q: start, moves } = starts.reduce((a, b) => (b.score < a.score ? b : a))
    return { seed, difficulty, ...shape, solution, start, scramble: moves, views }
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
