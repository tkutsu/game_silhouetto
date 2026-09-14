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
  TorusKnotGeometry,
  Vector3,
} from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { SHAPE_RADIUS } from './constants'
import { randomQuaternion, range, type Rng } from './rng'

/** Texture repeats per world unit, so every part shows detail at the same scale. */
const UV_DENSITY = 1.1

function scaleUv(geometry: BufferGeometry, u: number, v: number): BufferGeometry {
  const uv = geometry.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * u * UV_DENSITY, uv.getY(i) * v * UV_DENSITY)
  return geometry
}

/** Planar UVs along each face's dominant axis; right for flat-faced parts whose own UVs stretch per face. */
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

/** Torus arc with sphere caps on the open tube ends, merged into one geometry. */
function cappedArc(rng: Rng): BufferGeometry {
  const radius = range(rng, 0.35, 0.6)
  const tube = range(rng, 0.07, 0.14)
  const arc = range(rng, Math.PI, Math.PI * 2)
  const torus = scaleUv(new TorusGeometry(radius, tube, 10, 32, arc), arc * radius, Math.PI * 2 * tube)
  if (arc > Math.PI * 1.97) return torus

  const caps = [0, arc].map((a) => {
    const cap = scaleUv(new SphereGeometry(tube, 10, 8), Math.PI * 2 * tube, Math.PI * tube)
    cap.translate(Math.cos(a) * radius, Math.sin(a) * radius, 0)
    return cap
  })
  const merged = mergeGeometries([torus, ...caps])
  ;[torus, ...caps].forEach((g) => g.dispose())
  return merged ?? torus
}

function starPrism(rng: Rng): BufferGeometry {
  const points = 5 + Math.floor(rng() * 3)
  const outer = range(rng, 0.3, 0.5)
  const inner = outer * range(rng, 0.4, 0.55)
  const shape = new Shape2D()
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2
    const r = i % 2 ? inner : outer
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  // ExtrudeGeometry's default UVs are already in world units
  const extruded = scaleUv(new ExtrudeGeometry(shape, { depth: range(rng, 0.15, 0.35), bevelEnabled: false }), 1, 1)
  // index it so it can merge with the other (indexed) primitives
  const indexed = mergeVertices(extruded)
  extruded.dispose()
  indexed.center()
  return indexed
}

const KNOTS: [number, number][] = [
  [2, 3],
  [3, 2],
  [2, 5],
]

function randomPart(rng: Rng): BufferGeometry {
  const kind = Math.floor(rng() * 8)
  switch (kind) {
    case 0:
      return boxProjectUv(new BoxGeometry(range(rng, 0.15, 0.4), range(rng, 0.15, 0.4), range(rng, 0.7, 1.6)))
    case 1: {
      const r = range(rng, 0.12, 0.28)
      const top = rng() < 0.35 ? 0 : r
      const height = range(rng, 0.7, 1.5)
      return scaleUv(new CylinderGeometry(top, r, height, 20), Math.PI * (r + top), height)
    }
    case 2: {
      const r = range(rng, 0.1, 0.22)
      const length = range(rng, 0.4, 1.1)
      return scaleUv(new CapsuleGeometry(r, length, 4, 16), Math.PI * 2 * r, length + 2 * r)
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
      return ellipsoid
    }
    case 5: {
      const r = range(rng, 0.15, 0.3)
      return boxProjectUv(new CylinderGeometry(r, r, range(rng, 0.5, 1.3), 3 + Math.floor(rng() * 4)))
    }
    case 6: {
      const [p, q] = KNOTS[Math.floor(rng() * KNOTS.length)]
      const radius = range(rng, 0.22, 0.35)
      const tube = range(rng, 0.05, 0.09)
      return scaleUv(new TorusKnotGeometry(radius, tube, 64, 8, p, q), Math.PI * 2 * radius * Math.max(p, q), Math.PI * 2 * tube)
    }
    default:
      return starPrism(rng)
  }
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
  const parts: BufferGeometry[] = []
  const one = new Vector3(1, 1, 1)

  for (let i = 0; i < count; i++) {
    const anchor = centers.length ? centers[Math.floor(rng() * centers.length)] : new Vector3()
    const pos = anchor.clone().add(randomInSphere(rng, i === 0 ? 0 : 0.55))
    const part = randomPart(rng)
    part.applyMatrix4(new Matrix4().compose(pos, randomQuaternion(rng), one))
    centers.push(pos)
    parts.push(part)
  }

  const merged = mergeGeometries(parts, true)
  parts.forEach((p) => p.dispose())
  if (!merged) throw new Error('Failed to merge shape geometry')

  merged.center()
  merged.computeBoundingSphere()
  const s = SHAPE_RADIUS / (merged.boundingSphere?.radius ?? 1)
  merged.scale(s, s, s)
  merged.computeBoundingSphere()
  return merged
}
