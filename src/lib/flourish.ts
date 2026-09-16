import { Quaternion, Vector3 } from 'three'
import { SHAPE_RADIUS } from './constants'
import type { Solid } from './objects'

/** How long one model's grace note lasts, and the gap before the next model takes its turn. */
export const FLOURISH_SEC = 0.62
export const FLOURISH_STAGGER_SEC = 0.1
/** Breath after the solve snap, so the shadow lands on the outline before anything moves. */
export const FLOURISH_DELAY_SEC = 0.3

/**
 * What a model does to celebrate: round things roll, cutlery lifts out of whatever it was
 * stuck in and twirls, plates and open cups turn on the spot, leaners rock, the rest hop.
 */
export type Note = 'hop' | 'roll' | 'spin' | 'lift' | 'sway'

export interface Flourish {
  note: Note
  /** Which way this one goes, in the scene's own frame; no two models pick the same. */
  dir: Vector3
  /** Clockwise or not, for the notes that turn. */
  way: number
  /** How far the note carries it: the model's own size in the finished piece. */
  reach: number
}

/** What a model is and where it ended up, all the note needs to know. */
export interface PartContext {
  kind: string
  solid: Solid
  index: number
  /** Bounding-sphere radius in the finished piece. */
  radius: number
  /** Half its narrowest side: what a roll turns on. */
  thickness: number
  /** Its longest axis, turned the way it lies in the scene. */
  along: Vector3
}

/** The scene was built standing on y = 0, and the parts keep that frame, however the piece is turned. */
const UP = new Vector3(0, 1, 0)

/** Anything you could pour out of turns on the spot rather than tumbling. */
const OPEN_TOP = new Set([
  'mug', 'cup-coffee', 'cup-tea', 'bowl-broth', 'bowl-cereal', 'bowl-soup', 'soda-glass', 'cocktail',
  'frappe', 'wine-red', 'wine-white', 'pot-stew', 'salad', 'sundae', 'can-open',
])

/** Out and back. */
const arc = (u: number) => Math.sin(Math.PI * u)
/** One way, the other, home. */
const swing = (u: number) => Math.sin(2 * Math.PI * u)
/** Eased 0 → 1, for the notes that come full circle. */
const turn = (u: number) => u * u * (3 - 2 * u)

/** However long the model, no note carries it further than this, so nothing leaves the scene. */
const MAX_TRAVEL = 0.15 * SHAPE_RADIUS

/** This much of the model's own size, up to the limit. */
const travel = (fraction: number, f: Flourish) => Math.min(fraction * f.reach, MAX_TRAVEL)

const axis = new Vector3()

/** Rolling forward along `dir` turns the model about this axis, tops going first. */
const rollAxis = (dir: Vector3) => axis.crossVectors(UP, dir)

const NOTES: Record<Note, (u: number, f: Flourish, offset: Vector3, rot: Quaternion) => void> = {
  hop: (u, f, offset, rot) => {
    const rise = arc(u) * travel(0.5, f)
    offset.copy(UP).multiplyScalar(rise).addScaledVector(f.dir, rise * 0.35)
    rot.setFromAxisAngle(rollAxis(f.dir), arc(u) * 0.3)
  },
  roll: (u, f, offset, rot) => {
    // rolling without slipping: the ground it covers is the angle it turned through
    const a = arc(u) * Math.min(1.2, MAX_TRAVEL / f.reach)
    offset.copy(f.dir).multiplyScalar(a * f.reach)
    rot.setFromAxisAngle(rollAxis(f.dir), a)
  },
  spin: (u, f, offset, rot) => {
    offset.copy(UP).multiplyScalar(arc(u) * travel(0.1, f))
    rot.setFromAxisAngle(UP, turn(u) * 2 * Math.PI * f.way)
  },
  lift: (u, f, offset, rot) => {
    offset.copy(UP).multiplyScalar(arc(u) * travel(0.4, f))
    rot.setFromAxisAngle(UP, turn(u) * 2 * Math.PI * f.way)
  },
  sway: (u, f, offset, rot) => {
    offset.setScalar(0)
    rot.setFromAxisAngle(rollAxis(f.dir), swing(u) * 0.28)
  },
}

/** The note this model carries off, by the part it played in the scene and its own shape. */
export function flourishFor({ kind, solid, index, radius, thickness, along }: PartContext): Flourish {
  const size = solid.box.getSize(new Vector3()).toArray().sort((a, b) => a - b)
  // a ball all round, or a pin round across its length: either one can roll
  const ball = size[0] > 0.75 * size[2]
  const pin = size[0] > 0.75 * size[1]
  const note: Note =
    solid.role === 'poke' ? 'lift'
    : solid.role === 'base' || OPEN_TOP.has(kind) ? 'spin'
    : solid.role === 'lean' ? (pin ? 'roll' : 'sway')
    : ball ? 'roll'
    : 'hop'

  const way = index % 2 ? -1 : 1
  // the golden angle spreads the directions, so a scene never has two models going the same way
  const a = 2.4 * index + 0.6
  const dir = new Vector3(Math.cos(a), 0, Math.sin(a))
  // anything long goes by its own length: a pin rolls across it, a leaner rocks over it
  const flat = new Vector3(along.x, 0, along.z)
  if (flat.lengthSq() > 1e-6 && (note === 'sway' || (note === 'roll' && !ball))) {
    flat.normalize()
    if (note === 'sway') dir.copy(flat)
    else dir.crossVectors(UP, flat).multiplyScalar(way)
  }
  return { note, dir, way, reach: note === 'roll' ? thickness : radius }
}

/** Where the model sits `t` seconds into its note, relative to where it rests; home again outside it. */
export function flourishAt(f: Flourish, t: number, offset: Vector3, rot: Quaternion) {
  const u = t / FLOURISH_SEC
  if (u <= 0 || u >= 1) {
    offset.setScalar(0)
    rot.identity()
    return
  }
  NOTES[f.note](u, f, offset, rot)
}
