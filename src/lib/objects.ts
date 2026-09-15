import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Matrix4,
  Shape as Shape2D,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** Texture repeats per world unit, so every part shows detail at the same scale. */
export const UV_DENSITY = 1.1

export type InsideFn = (p: Vector3) => boolean

export interface Solid {
  geometry: BufferGeometry
  /** True when the point is within the solid volume, in the same frame as the geometry. */
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

/** Applies a matrix to the geometry and reroutes the inside test through its inverse. */
export function place(solid: Solid, matrix: Matrix4): Solid {
  solid.geometry.applyMatrix4(matrix)
  const invert = matrix.clone().invert()
  const local = new Vector3()
  const inner = solid.inside
  return { geometry: solid.geometry, inside: (p) => inner(local.copy(p).applyMatrix4(invert)) }
}

const at = (x: number, y: number, z = 0) => new Matrix4().makeTranslation(x, y, z)
const rotZ = (a: number) => new Matrix4().makeRotationZ(a)
const rotX = (a: number) => new Matrix4().makeRotationX(a)
const rotY = (a: number) => new Matrix4().makeRotationY(a)

function union(...solids: Solid[]): Solid {
  const merged = mergeGeometries(solids.map((s) => s.geometry))
  solids.forEach((s) => s.geometry.dispose())
  if (!merged) throw new Error('union failed')
  const tests = solids.map((s) => s.inside)
  return { geometry: merged, inside: (p) => tests.some((t) => t(p)) }
}

function box(w: number, h: number, d: number): Solid {
  return {
    geometry: boxProjectUv(new BoxGeometry(w, h, d)),
    inside: (p) => Math.abs(p.x) <= w / 2 && Math.abs(p.y) <= h / 2 && Math.abs(p.z) <= d / 2,
  }
}

function cylinder(rTop: number, rBottom: number, height: number, segments = 24): Solid {
  return {
    geometry: scaleUv(new CylinderGeometry(rTop, rBottom, height, segments), Math.PI * (rTop + rBottom), height),
    inside: (p) => {
      if (Math.abs(p.y) > height / 2) return false
      const r = rBottom + ((rTop - rBottom) * (p.y + height / 2)) / height
      return p.x * p.x + p.z * p.z <= r * r
    },
  }
}

/** Ellipsoid: sphere of radius r stretched by sx/sy/sz. */
function blob(r: number, sx = 1, sy = 1, sz = 1): Solid {
  const geometry = new SphereGeometry(r, 20, 14)
  scaleUv(geometry, Math.PI * 2 * r * ((sx + sz) / 2), Math.PI * r * sy)
  geometry.scale(sx, sy, sz)
  return {
    geometry,
    inside: (p) => (p.x / (r * sx)) ** 2 + (p.y / (r * sy)) ** 2 + (p.z / (r * sz)) ** 2 <= 1,
  }
}

/** Capsule along Y, optionally flattened in Z (for cookie limbs). */
function pill(r: number, length: number, flatten = 1): Solid {
  const geometry = scaleUv(new CapsuleGeometry(r, length, 4, 14), Math.PI * 2 * r, length + 2 * r)
  if (flatten !== 1) geometry.scale(1, 1, flatten)
  return {
    geometry,
    inside: (p) => {
      const z = p.z / flatten
      const y = Math.min(Math.max(p.y, -length / 2), length / 2)
      return p.x * p.x + (p.y - y) * (p.y - y) + z * z <= r * r
    },
  }
}

/** Torus arc in the XY plane with sphere-capped ends. */
function bentTube(radius: number, tube: number, arc: number): Solid {
  const torus = scaleUv(new TorusGeometry(radius, tube, 12, 32, arc), arc * radius, Math.PI * 2 * tube)
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

/** Full torus around the Z axis. */
function ring(radius: number, tube: number): Solid {
  return bentTube(radius, tube, Math.PI * 2)
}

/** Beveled extrusion of a 2D outline, centered on its Z depth. Inside test ignores the bevel. */
function slab(points: Vector2[], depth: number, bevel: number): Solid {
  const shape = new Shape2D(points)
  const extruded = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 2,
  })
  scaleUv(extruded, 1, 1)
  const indexed = mergeVertices(extruded)
  extruded.dispose()
  indexed.translate(0, 0, -depth / 2)
  const zMax = depth / 2 + bevel
  return {
    geometry: indexed,
    inside: (p) => {
      if (Math.abs(p.z) > zMax) return false
      let hit = false
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i]
        const b = points[j]
        if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit
      }
      return hit
    },
  }
}

const v2 = (x: number, y: number) => new Vector2(x, y)

function arcPoints(cx: number, cy: number, r: number, from: number, to: number, n: number): Vector2[] {
  const pts: Vector2[] = []
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n
    pts.push(v2(cx + Math.cos(a) * r, cy + Math.sin(a) * r))
  }
  return pts
}

function starPoints(spikes: number, outer: number, inner: number): Vector2[] {
  const pts: Vector2[] = []
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2 + Math.PI / 2
    const r = i % 2 ? inner : outer
    pts.push(v2(Math.cos(a) * r, Math.sin(a) * r))
  }
  return pts
}

/** Pie wedge with the apex at the origin, opening around +X. */
function wedgePoints(radius: number, angle: number): Vector2[] {
  return [v2(0, 0), ...arcPoints(0, 0, radius, -angle / 2, angle / 2, 10)]
}

const BUILDERS: Record<string, () => Solid> = {
  coin: () =>
    union(cylinder(0.44, 0.44, 0.1, 40), place(ring(0.44, 0.055), rotX(Math.PI / 2))),

  star: () => slab(starPoints(5, 0.52, 0.23), 0.1, 0.055),

  gingerbread: () => {
    const t = 0.42 // flatten factor for the cookie
    return union(
      place(blob(0.17, 1, 1, t), at(0, 0.34)),
      place(blob(0.26, 1, 1.15, t * 0.7), at(0, -0.04)),
      place(pill(0.09, 0.26, t), rotZ(1.15).premultiply(at(-0.26, 0.14))),
      place(pill(0.09, 0.26, t), rotZ(-1.15).premultiply(at(0.26, 0.14))),
      place(pill(0.1, 0.3, t), rotZ(0.35).premultiply(at(-0.14, -0.4))),
      place(pill(0.1, 0.3, t), rotZ(-0.35).premultiply(at(0.14, -0.4))),
    )
  },

  teddy: () =>
    union(
      place(blob(0.21), at(0, 0.35)),
      place(blob(0.09), at(-0.16, 0.52)),
      place(blob(0.09), at(0.16, 0.52)),
      place(blob(0.09), at(0, 0.3, 0.17)),
      place(blob(0.29, 1, 1.15, 0.9), at(0, -0.08)),
      place(pill(0.1, 0.24), rotZ(1.0).premultiply(at(-0.31, 0.05))),
      place(pill(0.1, 0.24), rotZ(-1.0).premultiply(at(0.31, 0.05))),
      place(pill(0.11, 0.26), rotZ(0.3).premultiply(at(-0.17, -0.42))),
      place(pill(0.11, 0.26), rotZ(-0.3).premultiply(at(0.17, -0.42))),
    ),

  piggy: () =>
    union(
      blob(0.3, 1.25, 0.9, 1),
      place(cylinder(0.11, 0.11, 0.14, 18), rotZ(Math.PI / 2).premultiply(at(0.42, 0.02))),
      place(cylinder(0, 0.09, 0.17, 12), rotZ(-0.5).premultiply(at(0.2, 0.3, 0.13))),
      place(cylinder(0, 0.09, 0.17, 12), rotZ(-0.5).premultiply(at(0.2, 0.3, -0.13))),
      place(cylinder(0.07, 0.07, 0.2, 12), at(0.2, -0.28, 0.15)),
      place(cylinder(0.07, 0.07, 0.2, 12), at(0.2, -0.28, -0.15)),
      place(cylinder(0.07, 0.07, 0.2, 12), at(-0.2, -0.28, 0.15)),
      place(cylinder(0.07, 0.07, 0.2, 12), at(-0.2, -0.28, -0.15)),
      place(bentTube(0.07, 0.028, 4.4), at(-0.41, 0.08)),
    ),

  spoon: () =>
    union(
      place(blob(0.2, 1, 1.35, 0.32), at(0, 0.32)),
      place(box(0.09, 0.62, 0.05), at(0, -0.18)),
    ),

  cake: () => slab(wedgePoints(0.62, 1.15), 0.3, 0.04),

  sausage: () => bentTube(0.35, 0.13, 2.4),

  pizza: () => {
    const angle = 1.0
    return union(slab(wedgePoints(0.65, angle), 0.07, 0), place(bentTube(0.62, 0.07, angle), rotZ(-angle / 2)))
  },

  mug: () =>
    union(cylinder(0.3, 0.3, 0.6, 28), place(ring(0.17, 0.05), at(0.33, 0))),

  bone: () =>
    union(
      pill(0.1, 0.5),
      place(blob(0.14), at(-0.11, 0.36)),
      place(blob(0.14), at(0.11, 0.36)),
      place(blob(0.14), at(-0.11, -0.36)),
      place(blob(0.14), at(0.11, -0.36)),
    ),

  heart: () => {
    const pts = [
      ...arcPoints(0.19, 0.2, 0.24, -0.6, 2.5, 10),
      ...arcPoints(-0.19, 0.2, 0.24, 0.64, 3.74, 10),
      v2(0, -0.5),
    ]
    pts.reverse() // wind the outline the way ExtrudeGeometry expects
    return slab(pts, 0.16, 0.05)
  },

  moon: () => {
    const outer = arcPoints(0, 0, 0.48, 0.9, 2 * Math.PI - 0.9, 22)
    const inner = arcPoints(0.2, 0, 0.4, 2 * Math.PI - 1.25, 1.25, 18)
    inner.reverse()
    return slab([...outer, ...inner], 0.13, 0.04)
  },

  rocket: () =>
    union(
      cylinder(0.16, 0.16, 0.55, 20),
      place(cylinder(0, 0.16, 0.28, 20), at(0, 0.41)),
      ...[0, 1, 2].map((i) =>
        place(box(0.04, 0.26, 0.16), rotY((i * Math.PI * 2) / 3).multiply(at(0.19, -0.24, 0))),
      ),
    ),

  pawn: () =>
    union(
      place(cylinder(0.23, 0.25, 0.1, 24), at(0, -0.4)),
      place(cylinder(0.08, 0.21, 0.5, 20), at(0, -0.1)),
      place(blob(0.15), at(0, 0.28)),
    ),

  fish: () =>
    union(
      blob(0.3, 1.3, 0.75, 0.5),
      place(slab([v2(0, 0), v2(-0.28, 0.2), v2(-0.28, -0.2)], 0.05, 0), at(-0.34, 0)),
      place(slab([v2(0, 0), v2(-0.18, 0.16), v2(0.1, 0.16)], 0.04, 0), at(0.02, 0.2)),
    ),
}

export const OBJECT_KINDS = Object.keys(BUILDERS)

export function buildObject(kind: string): Solid {
  return BUILDERS[kind]()
}
