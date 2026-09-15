import { BufferAttribute, BufferGeometry, Matrix4, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { SHAPE_RADIUS } from './constants'
import { buildObject, OBJECT_KINDS, type Solid } from './objects'
import { randomQuaternion, range, type Rng } from './rng'

/** A visible island of a part's surface smaller than this is a nub poking through a neighbor. */
const NUB_ABS_AREA = 0.03
const NUB_REL_AREA = 0.05

export interface GeneratedShape {
  geometry: BufferGeometry
  /** Object kind per geometry group, for contextual materials. */
  kinds: string[]
}

/** Difficulty ramps the object count: 1, 2, 2, 3, 3, 4, 4, then 5. */
export const partsFor = (difficulty: number) => Math.min(5, Math.ceil((difficulty + 1) / 2))

/**
 * Deletes tiny visible islands of a part's surface: patches that barely poke through a
 * neighbor look like nubs and slivers. The hole left behind sits inside the neighbor,
 * so it is never seen. Purely deterministic, so seeds stay stable.
 */
function removeNubs(parts: Solid[]) {
  const p = new Vector3()
  const a = new Vector3()
  const b = new Vector3()
  const c = new Vector3()

  parts.forEach((part, i) => {
    const geometry = part.geometry
    const index = geometry.index
    const pos = geometry.attributes.position
    if (!index) return
    const others = parts.filter((_, j) => j !== i)

    // weld by position so UV/normal seams don't split one island into several
    const weld = new Map<string, number>()
    const canon = new Uint32Array(pos.count)
    for (let v = 0; v < pos.count; v++) {
      const key = `${Math.round(pos.getX(v) * 1e4)},${Math.round(pos.getY(v) * 1e4)},${Math.round(pos.getZ(v) * 1e4)}`
      const seen = weld.get(key)
      if (seen === undefined) {
        weld.set(key, v)
        canon[v] = v
      } else canon[v] = seen
    }

    const outside = new Uint8Array(pos.count)
    for (let v = 0; v < pos.count; v++) {
      if (canon[v] !== v) continue
      p.fromBufferAttribute(pos, v)
      outside[v] = others.some((o) => o.inside(p)) ? 0 : 1
    }

    const parent = new Uint32Array(pos.count)
    for (let v = 0; v < pos.count; v++) parent[v] = v
    const find = (x: number): number => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]]
        x = parent[x]
      }
      return x
    }

    const triCount = index.count / 3
    const areas = new Float32Array(triCount)
    const visible = new Uint8Array(triCount)
    let partArea = 0
    for (let t = 0; t < triCount; t++) {
      const i0 = canon[index.getX(t * 3)]
      const i1 = canon[index.getX(t * 3 + 1)]
      const i2 = canon[index.getX(t * 3 + 2)]
      a.fromBufferAttribute(pos, i0)
      b.fromBufferAttribute(pos, i1)
      c.fromBufferAttribute(pos, i2)
      areas[t] = b.sub(a).cross(c.sub(a)).length() / 2
      partArea += areas[t]
      if (outside[i0] || outside[i1] || outside[i2]) {
        visible[t] = 1
        parent[find(i0)] = find(i1)
        parent[find(i1)] = find(i2)
      }
    }

    const islandArea = new Map<number, number>()
    for (let t = 0; t < triCount; t++) {
      if (!visible[t]) continue
      const root = find(canon[index.getX(t * 3)])
      islandArea.set(root, (islandArea.get(root) ?? 0) + areas[t])
    }

    const limit = Math.max(NUB_ABS_AREA, NUB_REL_AREA * partArea)
    const keep: number[] = []
    for (let t = 0; t < triCount; t++) {
      const nub = visible[t] && (islandArea.get(find(canon[index.getX(t * 3)])) ?? 0) < limit
      if (!nub) keep.push(index.getX(t * 3), index.getX(t * 3 + 1), index.getX(t * 3 + 2))
    }
    if (keep.length < index.count) geometry.setIndex(new BufferAttribute(new Uint32Array(keep), 1))
  })
}

function randomInSphere(rng: Rng, radius: number): Vector3 {
  const v = new Vector3()
  do v.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1)
  while (v.lengthSq() > 1)
  return v.multiplyScalar(radius)
}

/** Cluster of distinct recognizable objects, centered and scaled to SHAPE_RADIUS. */
export function generateShape(rng: Rng, difficulty: number): GeneratedShape {
  const count = partsFor(difficulty)
  const order = [...OBJECT_KINDS]
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const kinds = order.slice(0, count)

  const centers: Vector3[] = []
  const parts: Solid[] = []
  for (const kind of kinds) {
    const anchor = centers.length ? centers[Math.floor(rng() * centers.length)] : new Vector3()
    const pos = anchor.clone().add(randomInSphere(rng, centers.length ? 0.62 : 0))
    const scale = range(rng, 0.8, 1.15)
    const matrix = new Matrix4().compose(pos, randomQuaternion(rng), new Vector3(scale, scale, scale))

    const solid = buildObject(kind)
    solid.geometry.applyMatrix4(matrix)
    const invert = matrix.clone().invert()
    const local = new Vector3()
    const inner = solid.inside
    parts.push({ geometry: solid.geometry, inside: (p) => inner(local.copy(p).applyMatrix4(invert)) })
    centers.push(pos)
  }

  if (parts.length > 1) removeNubs(parts)

  const merged = mergeGeometries(parts.map((p) => p.geometry), true)
  parts.forEach((p) => p.geometry.dispose())
  if (!merged) throw new Error('Failed to merge shape geometry')

  merged.center()
  merged.computeBoundingSphere()
  const s = SHAPE_RADIUS / (merged.boundingSphere?.radius ?? 1)
  merged.scale(s, s, s)
  merged.computeBoundingSphere()
  return { geometry: merged, kinds }
}
