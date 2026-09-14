import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Matrix4,
  Shape as Shape2D,
  SphereGeometry,
  TorusGeometry,
  TorusKnotGeometry,
  Vector2,
  Vector3,
} from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { SHAPE_RADIUS } from './constants'
import { randomQuaternion, range, type Rng } from './rng'

/** Texture repeats per world unit, so every part shows detail at the same scale. */
const UV_DENSITY = 1.1

/** A visible island of a part's surface smaller than this is a nub poking through a neighbor. */
const NUB_ABS_AREA = 0.03
const NUB_REL_AREA = 0.05

type InsideFn = (p: Vector3) => boolean

interface Part {
  geometry: BufferGeometry
  /** True when the point (world space after placement) is within the part's solid volume. */
  inside: InsideFn
}

function scaleUv(geometry: BufferGeometry, u: number, v: number): BufferGeometry {
  const uv = geometry.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * u * UV_DENSITY, uv.getY(i) * v * UV_DENSITY)
  return geometry
}

/** Planar UVs along each face's dominant axis; per vertex is fine when face normals are constant (boxes). */
function boxProjectUv(geometry: BufferGeometry): BufferGeometry {
  const pos = geometry.attributes.position
  const nor = geometry.attributes.normal
  const uv = geometry.attributes.uv
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i))
    const ay = Math.abs(nor.getY(i))
    const az = Math.abs(nor.getZ(i))
    const [a, b] =
      ax >= ay && ax >= az ? [pos.getZ(i), pos.getY(i)] : ay >= az ? [pos.getX(i), pos.getZ(i)] : [pos.getX(i), pos.getY(i)]
    uv.setXY(i, a * UV_DENSITY, b * UV_DENSITY)
  }
  return geometry
}

/**
 * Planar UVs per triangle using the face normal, for faceted parts (prisms). Projecting per
 * vertex there smears the texture, because smooth vertex normals straddle two projection planes.
 * Expects non-indexed geometry.
 */
function faceProjectUv(geometry: BufferGeometry): BufferGeometry {
  const pos = geometry.attributes.position
  const uv = geometry.attributes.uv
  const a = new Vector3()
  const b = new Vector3()
  const c = new Vector3()
  const n = new Vector3()
  for (let t = 0; t < pos.count; t += 3) {
    a.fromBufferAttribute(pos, t)
    b.fromBufferAttribute(pos, t + 1)
    c.fromBufferAttribute(pos, t + 2)
    n.copy(b).sub(a).cross(c.sub(a))
    const ax = Math.abs(n.x)
    const ay = Math.abs(n.y)
    const az = Math.abs(n.z)
    for (let k = t; k < t + 3; k++) {
      a.fromBufferAttribute(pos, k)
      const [u, v] = ax >= ay && ax >= az ? [a.z, a.y] : ay >= az ? [a.x, a.z] : [a.x, a.y]
      uv.setXY(k, u * UV_DENSITY, v * UV_DENSITY)
    }
  }
  return geometry
}

/** Torus arc with sphere caps on the open tube ends, merged into one geometry. */
function cappedArc(rng: Rng): Part {
  const radius = range(rng, 0.35, 0.6)
  const tube = range(rng, 0.07, 0.14)
  const arc = range(rng, Math.PI, Math.PI * 2)
  const torus = scaleUv(new TorusGeometry(radius, tube, 10, 32, arc), arc * radius, Math.PI * 2 * tube)

  const ends = [0, arc].map((a) => new Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0))
  const tube2 = tube * tube
  const inside: InsideFn = (p) => {
    let angle = Math.atan2(p.y, p.x)
    if (angle < 0) angle += Math.PI * 2
    if (angle <= arc) {
      const ring = Math.sqrt(p.x * p.x + p.y * p.y) - radius
      if (ring * ring + p.z * p.z <= tube2) return true
    }
    return ends.some((e) => p.distanceToSquared(e) <= tube2)
  }

  if (arc > Math.PI * 1.97) return { geometry: torus, inside }
  const caps = ends.map((e) => {
    const cap = scaleUv(new SphereGeometry(tube, 10, 8), Math.PI * 2 * tube, Math.PI * tube)
    cap.translate(e.x, e.y, e.z)
    return cap
  })
  const merged = mergeGeometries([torus, ...caps])
  ;[torus, ...caps].forEach((g) => g.dispose())
  return { geometry: merged ?? torus, inside }
}

function starPrism(rng: Rng): Part {
  const points = 5 + Math.floor(rng() * 3)
  const outer = range(rng, 0.3, 0.5)
  const inner = outer * range(rng, 0.4, 0.55)
  const shape = new Shape2D()
  const poly: Vector2[] = []
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2
    const r = i % 2 ? inner : outer
    poly.push(new Vector2(Math.cos(a) * r, Math.sin(a) * r))
    if (i === 0) shape.moveTo(poly[0].x, poly[0].y)
    else shape.lineTo(poly[i].x, poly[i].y)
  }
  const depth = range(rng, 0.15, 0.35)
  // ExtrudeGeometry's default UVs are already in world units
  const extruded = scaleUv(new ExtrudeGeometry(shape, { depth, bevelEnabled: false }), 1, 1)
  // index it so it can merge with the other (indexed) primitives
  const indexed = mergeVertices(extruded)
  extruded.dispose()
  indexed.computeBoundingBox()
  const center = new Vector3()
  indexed.boundingBox?.getCenter(center)
  indexed.center()

  const inside: InsideFn = (p) => {
    const z = p.z + center.z
    if (z < 0 || z > depth) return false
    const x = p.x + center.x
    const y = p.y + center.y
    let hit = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i]
      const b = poly[j]
      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit
    }
    return hit
  }
  return { geometry: indexed, inside }
}

const KNOTS: [number, number][] = [
  [2, 3],
  [3, 2],
  [2, 5],
]

/** three's torus knot centerline, sampled once for the inside test. */
function knotCurve(radius: number, p: number, q: number): Vector3[] {
  const pts: Vector3[] = []
  for (let i = 0; i <= 120; i++) {
    const u = (i / 120) * p * Math.PI * 2
    const cs = Math.cos((q / p) * u)
    pts.push(
      new Vector3(
        radius * (2 + cs) * 0.5 * Math.cos(u),
        radius * (2 + cs) * 0.5 * Math.sin(u),
        radius * Math.sin((q / p) * u) * 0.5,
      ),
    )
  }
  return pts
}

const seg = new Vector3()
const toP = new Vector3()

function nearCurve(p: Vector3, pts: Vector3[], dist: number): boolean {
  const d2 = dist * dist
  for (let i = 0; i < pts.length - 1; i++) {
    seg.copy(pts[i + 1]).sub(pts[i])
    toP.copy(p).sub(pts[i])
    const t = Math.min(Math.max(toP.dot(seg) / seg.lengthSq(), 0), 1)
    if (toP.sub(seg.multiplyScalar(t)).lengthSq() <= d2) return true
  }
  return false
}

function randomPart(rng: Rng): Part {
  const kind = Math.floor(rng() * 8)
  switch (kind) {
    case 0: {
      const w = range(rng, 0.15, 0.4)
      const h = range(rng, 0.15, 0.4)
      const d = range(rng, 0.7, 1.6)
      return {
        geometry: boxProjectUv(new BoxGeometry(w, h, d)),
        inside: (p) => Math.abs(p.x) <= w / 2 && Math.abs(p.y) <= h / 2 && Math.abs(p.z) <= d / 2,
      }
    }
    case 1: {
      const r = range(rng, 0.12, 0.28)
      const top = rng() < 0.35 ? 0 : r
      const height = range(rng, 0.7, 1.5)
      return {
        geometry: scaleUv(new CylinderGeometry(top, r, height, 20), Math.PI * (r + top), height),
        inside: (p) => {
          if (Math.abs(p.y) > height / 2) return false
          const rad = r + ((top - r) * (p.y + height / 2)) / height
          return p.x * p.x + p.z * p.z <= rad * rad
        },
      }
    }
    case 2: {
      const r = range(rng, 0.1, 0.22)
      const length = range(rng, 0.4, 1.1)
      return {
        geometry: scaleUv(new CapsuleGeometry(r, length, 4, 16), Math.PI * 2 * r, length + 2 * r),
        inside: (p) => {
          const y = Math.min(Math.max(p.y, -length / 2), length / 2)
          return p.x * p.x + (p.y - y) * (p.y - y) + p.z * p.z <= r * r
        },
      }
    }
    case 3:
      return cappedArc(rng)
    case 4: {
      const r = range(rng, 0.2, 0.35)
      const ellipsoid = new SphereGeometry(r, 16, 12)
      const sy = range(rng, 0.5, 1.6)
      const sz = range(rng, 0.4, 1)
      scaleUv(ellipsoid, Math.PI * 2 * r * ((1 + sz) / 2), Math.PI * r * sy)
      ellipsoid.scale(1, sy, sz)
      return {
        geometry: ellipsoid,
        inside: (p) => (p.x / r) ** 2 + (p.y / (r * sy)) ** 2 + (p.z / (r * sz)) ** 2 <= 1,
      }
    }
    case 5: {
      const r = range(rng, 0.15, 0.3)
      const height = range(rng, 0.5, 1.3)
      const sides = 3 + Math.floor(rng() * 4)
      const smooth = new CylinderGeometry(r, r, height, sides)
      const faceted = smooth.toNonIndexed()
      smooth.dispose()
      faceted.computeVertexNormals()
      faceProjectUv(faceted)
      const geometry = mergeVertices(faceted)
      faceted.dispose()
      const inradius = r * Math.cos(Math.PI / sides)
      const sector = (Math.PI * 2) / sides
      return {
        geometry,
        inside: (p) => {
          if (Math.abs(p.y) > height / 2) return false
          const rho = Math.hypot(p.x, p.z)
          if (rho <= inradius) return true
          let m = Math.atan2(p.x, p.z) % sector
          if (m < 0) m += sector
          return rho * Math.cos(m - sector / 2) <= inradius
        },
      }
    }
    case 6: {
      const [p, q] = KNOTS[Math.floor(rng() * KNOTS.length)]
      const radius = range(rng, 0.22, 0.35)
      const tube = range(rng, 0.05, 0.09)
      const curve = knotCurve(radius, p, q)
      return {
        geometry: scaleUv(new TorusKnotGeometry(radius, tube, 64, 8, p, q), Math.PI * 2 * radius * Math.max(p, q), Math.PI * 2 * tube),
        inside: (pt) => nearCurve(pt, curve, tube),
      }
    }
    default:
      return starPrism(rng)
  }
}

/**
 * Deletes tiny visible islands of a part's surface: patches that barely poke through a
 * neighbor look like nubs and slivers. The hole left behind sits inside the neighbor,
 * so it is never seen. Purely deterministic, so seeds stay stable.
 */
function removeNubs(parts: Part[]) {
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

/** Random cluster of overlapping primitives, centered and scaled to SHAPE_RADIUS. */
export function generateShape(rng: Rng): BufferGeometry {
  const count = 5 + Math.floor(rng() * 4)
  const centers: Vector3[] = []
  const parts: Part[] = []
  const one = new Vector3(1, 1, 1)

  for (let i = 0; i < count; i++) {
    const anchor = centers.length ? centers[Math.floor(rng() * centers.length)] : new Vector3()
    const pos = anchor.clone().add(randomInSphere(rng, i === 0 ? 0 : 0.55))
    const part = randomPart(rng)
    const matrix = new Matrix4().compose(pos, randomQuaternion(rng), one)
    part.geometry.applyMatrix4(matrix)
    const invert = matrix.clone().invert()
    const localInside = part.inside
    const local = new Vector3()
    part.inside = (point) => localInside(local.copy(point).applyMatrix4(invert))
    centers.push(pos)
    parts.push(part)
  }

  removeNubs(parts)

  const merged = mergeGeometries(parts.map((p) => p.geometry), true)
  parts.forEach((p) => p.geometry.dispose())
  if (!merged) throw new Error('Failed to merge shape geometry')

  merged.center()
  merged.computeBoundingSphere()
  const s = SHAPE_RADIUS / (merged.boundingSphere?.radius ?? 1)
  merged.scale(s, s, s)
  merged.computeBoundingSphere()
  return merged
}
