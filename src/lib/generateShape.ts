import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Matrix4,
  TorusGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { SHAPE_RADIUS } from './constants'
import { randomQuaternion, range, type Rng } from './rng'

function randomPart(rng: Rng): BufferGeometry {
  const kind = Math.floor(rng() * 4)
  switch (kind) {
    case 0:
      return new BoxGeometry(range(rng, 0.15, 0.4), range(rng, 0.15, 0.4), range(rng, 0.7, 1.6))
    case 1: {
      const r = range(rng, 0.12, 0.28)
      return new CylinderGeometry(rng() < 0.35 ? 0 : r, r, range(rng, 0.7, 1.5), 20)
    }
    case 2:
      return new CapsuleGeometry(range(rng, 0.1, 0.22), range(rng, 0.4, 1.1), 4, 16)
    default:
      return new TorusGeometry(range(rng, 0.35, 0.6), range(rng, 0.07, 0.14), 10, 32, range(rng, Math.PI, Math.PI * 2))
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

  const merged = mergeGeometries(parts)
  parts.forEach((p) => p.dispose())
  if (!merged) throw new Error('Failed to merge shape geometry')

  merged.center()
  merged.computeBoundingSphere()
  const s = SHAPE_RADIUS / (merged.boundingSphere?.radius ?? 1)
  merged.scale(s, s, s)
  merged.computeBoundingSphere()
  return merged
}
