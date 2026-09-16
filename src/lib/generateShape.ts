import { Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { SHAPE_RADIUS } from './constants'
import { flourishFor, type Flourish } from './flourish'
import { buildObject, isBase, MODEL_RADIUS, OBJECT_KINDS, type Solid } from './objects'
import { range, type Rng } from './rng'

/** Distance a moving part advances between overlap tests; thinner than any model. */
const MARCH = 0.02
/** Halvings between the last clear and first blocked step. */
const REFINE_STEPS = 10
/** Tries to slide a part in beside the pile before settling for wherever it stopped. */
const BESIDE_TRIES = 4
/** Landing spots tried per dropped part. */
const DROP_TRIES = 3
/** How far a landed part is pushed down to find what it rests on. */
const SETTLE = 0.03
/** Margin around the center the support must reach, as a fraction of the part's radius; rules out perching on a tip. */
const STEADY = 0.2

const UP = new Vector3(0, 1, 0)
const DOWN = new Vector3(0, -1, 0)

export interface GeneratedShape {
  geometry: BufferGeometry
  /** Object kind per model, in the order they were merged, for contextual materials. */
  kinds: string[]
  /** The same models again, one geometry each, so they can move on their own once the puzzle is won. */
  parts: ShapePart[]
}

export interface ShapePart {
  kind: string
  /** Centered on its pivot, so it turns in place; add the pivot back to put it where it belongs. */
  geometry: BufferGeometry
  pivot: Vector3
  flourish: Flourish
}

/** Frees a shape and every model in it. */
export function disposeShape(shape: GeneratedShape) {
  shape.geometry.dispose()
  for (const part of shape.parts) part.geometry.dispose()
}

/** A model in the scene. The floor is y = 0 and every part is upright unless leaning or stuck in. */
interface Part {
  solid: Solid
  rotation: Quaternion
  matrix: Matrix4
  invert: Matrix4
  center: Vector3
  radius: number
  /** Lowest and highest points relative to the center, for the current rotation. */
  bottom: number
  top: number
  onFloor: boolean
}

type Touch = Part | 'floor' | null

/** Difficulty ramps the object count: 1, 2, 2, 3, 3, 4, 4, then 5. */
export const partsFor = (difficulty: number) => Math.min(5, Math.ceil((difficulty + 1) / 2))

const relative = new Matrix4()
const point = new Vector3()
const offset = new Vector3()
const scaling = new Vector3()

function makePart(kind: string): Part {
  const solid = buildObject(kind)
  return {
    solid,
    rotation: new Quaternion(),
    matrix: new Matrix4(),
    invert: new Matrix4(),
    center: new Vector3(),
    radius: MODEL_RADIUS * solid.scale,
    bottom: 0,
    top: 0,
    onFloor: false,
  }
}

function rotate(part: Part, rotation: Quaternion) {
  part.rotation.copy(rotation)
  const s = part.solid.samples
  part.bottom = Infinity
  part.top = -Infinity
  for (let i = 0; i < s.length; i += 3) {
    const y = point.set(s[i], s[i + 1], s[i + 2]).multiplyScalar(part.solid.scale).applyQuaternion(rotation).y
    part.bottom = Math.min(part.bottom, y)
    part.top = Math.max(part.top, y)
  }
}

function moveTo(part: Part, center: Vector3) {
  part.center.copy(center)
  part.matrix.compose(center, part.rotation, scaling.setScalar(part.solid.scale))
  part.invert.copy(part.matrix).invert()
}

/** True when any sample of `a` lies inside `b`. */
function pokes(a: Part, b: Part): boolean {
  relative.multiplyMatrices(b.invert, a.matrix)
  const s = a.solid.samples
  for (let i = 0; i < s.length; i += 3) {
    if (b.solid.inside(point.set(s[i], s[i + 1], s[i + 2]).applyMatrix4(relative))) return true
  }
  return false
}

/**
 * True when what `part` rests on (parts or the floor) spans its center, with some margin, so
 * it wouldn't tip over: pushes it a little lower and checks the overlap's footprint.
 */
function stable(part: Part, blockers: Part[]): boolean {
  const rest = part.center.clone()
  moveTo(part, offset.copy(rest).addScaledVector(DOWN, SETTLE))
  const box = [Infinity, -Infinity, Infinity, -Infinity]
  const add = (from: Part, to: Part) => {
    relative.multiplyMatrices(to.invert, from.matrix)
    const s = from.solid.samples
    for (let i = 0; i < s.length; i += 3) {
      point.set(s[i], s[i + 1], s[i + 2])
      if (!to.solid.inside(offset.copy(point).applyMatrix4(relative))) continue
      point.applyMatrix4(from.matrix)
      box[0] = Math.min(box[0], point.x)
      box[1] = Math.max(box[1], point.x)
      box[2] = Math.min(box[2], point.z)
      box[3] = Math.max(box[3], point.z)
    }
  }
  for (const other of blockers) {
    if (part.center.distanceTo(other.center) >= part.radius + other.radius) continue
    add(part, other)
    add(other, part)
  }
  const s = part.solid.samples
  for (let i = 0; i < s.length; i += 3) {
    point.set(s[i], s[i + 1], s[i + 2]).applyMatrix4(part.matrix)
    if (point.y > 0) continue
    box[0] = Math.min(box[0], point.x)
    box[1] = Math.max(box[1], point.x)
    box[2] = Math.min(box[2], point.z)
    box[3] = Math.max(box[3], point.z)
  }
  moveTo(part, rest)
  const m = STEADY * part.radius
  return box[0] < rest.x - m && rest.x + m < box[1] && box[2] < rest.z - m && rest.z + m < box[3]
}

function touching(part: Part, blockers: Part[]): Touch {
  if (part.center.y + part.bottom < -1e-4) return 'floor'
  return (
    blockers.find(
      (other) =>
        part.center.distanceTo(other.center) < part.radius + other.radius &&
        (pokes(part, other) || pokes(other, part)),
    ) ?? null
  )
}

/**
 * Moves `part` from a clear `start` along `dir` until it first touches a blocker or the
 * floor, and leaves it just short of that. Null when the path stayed clear for `reach`
 * (the part ends there) or the start was already blocked (it stays there).
 */
function approach(part: Part, start: Vector3, dir: Vector3, reach: number, blockers: Part[]): Touch {
  const at = (t: number) => moveTo(part, offset.copy(dir).multiplyScalar(t).add(start))
  at(0)
  if (touching(part, blockers)) return null
  let clear = 0
  while (clear < reach) {
    const t = Math.min(reach, clear + MARCH)
    at(t)
    const touched = touching(part, blockers)
    if (touched) {
      let blocked = t
      for (let i = 0; i < REFINE_STEPS; i++) {
        const mid = (clear + blocked) / 2
        at(mid)
        if (touching(part, blockers)) blocked = mid
        else clear = mid
      }
      at(clear)
      return touched
    }
    clear = t
  }
  return null
}

const pick = <T>(rng: Rng, list: T[]): T => list[Math.floor(rng() * list.length)]

function horizontal(rng: Rng): Vector3 {
  const a = rng() * Math.PI * 2
  return new Vector3(Math.cos(a), 0, Math.sin(a))
}

const yaw = (angle: number) => new Quaternion().setFromAxisAngle(UP, angle)

/** Clear of every placed part when `part` starts this far from `from`. */
const farFrom = (from: Vector3, part: Part, placed: Part[]) =>
  Math.max(...placed.map((p) => p.center.distanceTo(from) + p.radius)) + part.radius

/** The model's longest axis, turned the way the part came to rest in the scene. */
function sceneAxis(part: Part): Vector3 {
  const size = part.solid.box.getSize(new Vector3()).toArray()
  const k = size.indexOf(Math.max(...size))
  return new Vector3(+(k === 0), +(k === 1), +(k === 2)).applyQuaternion(part.rotation)
}

/** The model's long horizontal axis, for things that lie down. */
const longAxis = (solid: Solid) => {
  const size = solid.box.getSize(new Vector3())
  return size.x >= size.z ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1)
}

const standsTall = (solid: Solid) => {
  const size = solid.box.getSize(new Vector3())
  return size.y >= Math.max(size.x, size.z)
}

/** Tips a tall model onto its side (its height along x); lying models stay as they are. */
const layDown = (solid: Solid) =>
  standsTall(solid) ? new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2) : new Quaternion()

/** Upright, or on its side if it would topple standing on the floor (a popsicle on its stick). */
function floorPose(part: Part, angle: number) {
  rotate(part, yaw(angle))
  moveTo(part, point.set(0, -part.bottom, 0))
  if (!stable(part, [])) rotate(part, yaw(angle).multiply(layDown(part.solid)))
}

/** Slides in along the floor until it bumps something that stands on the floor; false if it never did. */
function beside(part: Part, placed: Part[], rng: Rng): boolean {
  floorPose(part, rng() * Math.PI * 2)
  const grounded = placed.filter((p) => p.onFloor)
  part.onFloor = true
  for (let i = 0; i < BESIDE_TRIES; i++) {
    const target = pick(rng, grounded)
    const dir = horizontal(rng)
    const far = farFrom(target.center, part, placed)
    const start = dir.clone().multiplyScalar(far).add(target.center).setY(-part.bottom)
    if (approach(part, start, dir.negate(), far, placed)) return true
  }
  return false
}

/**
 * Falls from above onto the base (or a random part), trying a few spots and keeping the
 * lowest steady landing so things spread over the base instead of piling into towers.
 * False if no try came to rest on something.
 */
function drop(part: Part, placed: Part[], rng: Rng): boolean {
  rotate(part, yaw(rng() * Math.PI * 2))
  part.onFloor = false
  const base = placed.find((p) => p.solid.role === 'base')
  const top = Math.max(...placed.map((p) => p.center.y + p.top))
  let best: Vector3 | null = null
  for (let i = 0; i < DROP_TRIES; i++) {
    const target = base && rng() < 0.8 ? base : pick(rng, placed)
    const spread = target === base ? 0.7 : 0.3
    const start = horizontal(rng)
      .multiplyScalar(Math.sqrt(rng()) * spread * target.radius)
      .add(target.center)
      .setY(top - part.bottom + 0.01)
    const touched = approach(part, start, DOWN, start.y, placed)
    if (touched && touched !== 'floor' && (!best || part.center.y < best.y) && stable(part, placed)) {
      best = part.center.clone()
    }
  }
  if (best) moveTo(part, best)
  return best !== null
}

/** Rests one end on the floor and tips the other against a placed part. */
function lean(part: Part, placed: Part[], rng: Rng): boolean {
  const target = pick(rng, placed)
  const dir = horizontal(rng)
  const lying = layDown(part.solid)
  const long = standsTall(part.solid) ? new Vector3(1, 0, 0) : longAxis(part.solid)
  // lay it down, turn the long axis onto `dir` (either way round), then raise the end facing the target
  const turn = Math.atan2(-dir.z, dir.x) - Math.atan2(-long.z, long.x) + (rng() < 0.5 ? Math.PI : 0)
  const tilt = new Quaternion().setFromAxisAngle(new Vector3().crossVectors(UP, dir), range(rng, 0.35, 0.9))
  rotate(part, tilt.multiply(yaw(turn)).multiply(lying))
  const far = farFrom(target.center, part, placed)
  const start = dir.clone().multiplyScalar(far).add(target.center).setY(-part.bottom)
  const touched = approach(part, start, dir.negate(), far, placed)
  part.onFloor = touched !== null && touched !== 'floor'
  return part.onFloor
}

/** Local direction of the end that goes in: the bottom if it stands, else the wider end (tines, spoon bowl). */
function tipOf(solid: Solid): Vector3 {
  if (standsTall(solid)) return DOWN.clone()
  const size = solid.box.getSize(new Vector3())
  const long = longAxis(solid)
  const along = long.x ? 0 : 2
  const across = long.x ? 2 : 0
  const half = size.getComponent(along) / 2
  const ends = [Infinity, -Infinity, Infinity, -Infinity].map((v) => [v, v])
  const s = solid.samples
  for (let i = 0; i < s.length; i += 3) {
    const a = s[i + along]
    if (Math.abs(a) < 0.5 * half) continue
    const end = a > 0 ? 1 : 0
    ends[0][end] = Math.min(ends[0][end], s[i + across])
    ends[1][end] = Math.max(ends[1][end], s[i + across])
    ends[2][end] = Math.min(ends[2][end], s[i + 1])
    ends[3][end] = Math.max(ends[3][end], s[i + 1])
  }
  const width = (end: number) => ends[1][end] - ends[0][end] + ends[3][end] - ends[2][end]
  return long.multiplyScalar(width(1) > width(0) ? 1 : -1)
}

/** Drops tip first into a host, then sinks it in unless it came to rest inside a cup or bowl. False if it missed every host. */
function poke(part: Part, placed: Part[], rng: Rng): boolean {
  const hosts = placed.filter((p) => p.solid.host)
  if (!hosts.length) return false
  part.onFloor = false
  const upright = new Quaternion().setFromUnitVectors(tipOf(part.solid), DOWN)
  const top = Math.max(...placed.map((p) => p.center.y + p.top))
  let host: Part | null = null
  for (let i = 0; i < DROP_TRIES && !host; i++) {
    const target = pick(rng, hosts)
    const tilt = new Quaternion().setFromAxisAngle(horizontal(rng), range(rng, 0, 0.35))
    rotate(part, tilt.multiply(yaw(rng() * Math.PI * 2)).multiply(upright))
    const start = horizontal(rng)
      .multiplyScalar(rng() * 0.2 * target.radius)
      .add(target.center)
      .setY(top - part.bottom + 0.01)
    if (approach(part, start, DOWN, start.y, placed) === target) host = target
  }
  if (!host) return false

  const tip = part.center.y + part.bottom
  const hostTop = host.center.y + host.top
  const hostHeight = host.top - host.bottom
  if (hostTop - tip > 0.3 * hostHeight) return true
  const sink = Math.min(0.3 * (part.top - part.bottom), tip - (host.center.y + host.bottom + 0.25 * hostHeight))
  if (sink > 0) {
    approach(part, part.center.clone(), DOWN, sink, placed.filter((p) => p !== host))
  }
  return true
}

/**
 * A little scene of distinct recognizable objects at their real relative sizes,
 * centered and scaled to SHAPE_RADIUS. Levels of three or more objects are set on a
 * base; nothing passes through anything else except stick-ins, which go into a host.
 */
export function generateShape(rng: Rng, difficulty: number): GeneratedShape {
  const count = partsFor(difficulty)
  const order = [...OBJECT_KINDS]
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const withBase = count >= 3 || (count === 2 && rng() < 0.5)
  const others = order.filter((kind) => !isBase(kind))
  const kinds = withBase ? [order.find(isBase) ?? others[0], ...others.slice(0, count - 1)] : others.slice(0, count)

  const parts = kinds.map(makePart)
  const rank = { base: 0, stack: 1, lean: 2, poke: 3 }
  const placing = [...parts].sort((a, b) => rank[a.solid.role] - rank[b.solid.role])
  const placed: Part[] = []
  for (const part of placing) {
    const role = part.solid.role
    if (!placed.length) {
      floorPose(part, rng() * Math.PI * 2)
      moveTo(part, new Vector3(0, -part.bottom, 0))
      part.onFloor = true
    } else {
      const besideFirst = rng() < (placed[0].solid.role === 'base' ? 0.15 : 0.4)
      const settled =
        (role === 'poke' && poke(part, placed, rng)) ||
        ((role === 'lean' || role === 'poke') && lean(part, placed, rng)) ||
        (!besideFirst && drop(part, placed, rng)) ||
        beside(part, placed, rng) ||
        lean(part, placed, rng)
      // nothing worked: take wherever sliding along the floor ends up
      if (!settled) beside(part, placed, rng)
    }
    part.solid.geometry.applyMatrix4(part.matrix)
    placed.push(part)
  }

  // no groups: the merged copy exists for the silhouette, which draws it with one white material
  const merged = mergeGeometries(parts.map((p) => p.solid.geometry))
  if (!merged) throw new Error('Failed to merge shape geometry')

  merged.computeBoundingBox()
  const shift = merged.boundingBox?.getCenter(new Vector3()).negate() ?? new Vector3()
  merged.translate(shift.x, shift.y, shift.z)
  merged.computeBoundingSphere()
  const s = SHAPE_RADIUS / (merged.boundingSphere?.radius ?? 1)
  merged.scale(s, s, s)
  merged.computeBoundingSphere()

  // every model gets the same centering and scaling, then sits on its own pivot
  const models = parts.map((part, i) => {
    const geometry = part.solid.geometry
    geometry.translate(shift.x, shift.y, shift.z)
    geometry.scale(s, s, s)
    geometry.computeBoundingSphere()
    geometry.computeBoundingBox()
    const extent = geometry.boundingBox?.getSize(new Vector3()).toArray() ?? [0]
    const pivot = geometry.boundingSphere?.center.clone() ?? new Vector3()
    const context = {
      kind: kinds[i],
      solid: part.solid,
      index: i,
      radius: geometry.boundingSphere?.radius ?? 0,
      thickness: Math.min(...extent) / 2,
      along: sceneAxis(part),
    }
    geometry.translate(-pivot.x, -pivot.y, -pivot.z)
    geometry.computeBoundingSphere()
    return { kind: kinds[i], geometry, pivot, flourish: flourishFor(context) }
  })
  return { geometry: merged, kinds, parts: models }
}
