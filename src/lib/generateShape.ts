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

/** Torus arc with sphere caps on the open tube ends, merged into one geometry. */
function cappedArc(rng: Rng): BufferGeometry {
  const radius = range(rng, 0.35, 0.6)
  const tube = range(rng, 0.07, 0.14)
  const arc = range(rng, Math.PI, Math.PI * 2)
  const torus = new TorusGeometry(radius, tube, 10, 32, arc)
  if (arc > Math.PI * 1.97) return torus

  const caps = [0, arc].map((a) => {
    const cap = new SphereGeometry(tube, 10, 8)
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
  const extruded = new ExtrudeGeometry(shape, { depth: range(rng, 0.15, 0.35), bevelEnabled: false })
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
      return new BoxGeometry(range(rng, 0.15, 0.4), range(rng, 0.15, 0.4), range(rng, 0.7, 1.6))
    case 1: {
      const r = range(rng, 0.12, 0.28)
      return new CylinderGeometry(rng() < 0.35 ? 0 : r, r, range(rng, 0.7, 1.5), 20)
    }
    case 2:
      return new CapsuleGeometry(range(rng, 0.1, 0.22), range(rng, 0.4, 1.1), 4, 16)
    case 3:
      return cappedArc(rng)
    case 4: {
      const ellipsoid = new SphereGeometry(range(rng, 0.2, 0.35), 16, 12)
      ellipsoid.scale(1, range(rng, 0.5, 1.6), range(rng, 0.4, 1))
      return ellipsoid
    }
    case 5: {
      const r = range(rng, 0.15, 0.3)
      return new CylinderGeometry(r, r, range(rng, 0.5, 1.3), 3 + Math.floor(rng() * 4))
    }
    case 6: {
      const [p, q] = KNOTS[Math.floor(rng() * KNOTS.length)]
      return new TorusKnotGeometry(range(rng, 0.22, 0.35), range(rng, 0.05, 0.09), 64, 8, p, q)
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
