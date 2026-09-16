import { Matrix4, Plane, Quaternion, Vector3, type Ray } from 'three'
import { FLOOR_Y, FRAME, SIDE_X, WALL_Z } from './constants'
import { AXES } from './level'

/** Radius of each dashed ring, where the knob rides. */
export const DIAL_RING = FRAME * 0.94
/** Drags that start inside this radius grab the dial; past it they're inert. */
export const DIAL_OUTER = FRAME * 1.05

export interface Dial {
  axis: Vector3
  /** Where the axis through the piece meets the blueprint. */
  center: Vector3
  /** Lays the dial's local XY plane on the blueprint, local Z along the axis, so a local Z turn is a turn about the axis. */
  frame: Quaternion
  /** Resting angle of the knob, where the camera sees it clear of the piece. */
  knob: number
}

const dial = (i: number, center: Vector3, knob: number): Dial => ({
  axis: AXES[i],
  center,
  frame: new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(AXES[(i + 1) % 3], AXES[(i + 2) % 3], AXES[i])),
  knob,
})

/** Side wall (pitch), floor (yaw) and back wall (roll), indexed like AXES. */
export const DIALS = [
  dial(0, new Vector3(SIDE_X, 0, 0), 1.2),
  dial(1, new Vector3(0, FLOOR_Y, 0), 0.7),
  dial(2, new Vector3(0, 0, WALL_Z), -0.5),
]

/** The point on dial `i`'s ring at `angle`, in world space. */
export function ringPoint(i: number, angle: number, out: Vector3): Vector3 {
  const { center } = DIALS[i]
  return out
    .copy(center)
    .addScaledVector(AXES[(i + 1) % 3], Math.cos(angle) * DIAL_RING)
    .addScaledVector(AXES[(i + 2) % 3], Math.sin(angle) * DIAL_RING)
}

const plane = new Plane()
const hit = new Vector3()

/** Where a ray meets dial `i`'s blueprint: angle and radius around the dial, and distance along the ray. */
export function project(ray: Ray, i: number): { angle: number; r: number; dist: number } | null {
  const { axis, center } = DIALS[i]
  if (!ray.intersectPlane(plane.setFromNormalAndCoplanarPoint(axis, center), hit)) return null
  const dist = hit.distanceTo(ray.origin)
  hit.sub(center)
  const a = hit.getComponent((i + 1) % 3)
  const b = hit.getComponent((i + 2) % 3)
  return { angle: Math.atan2(b, a), r: Math.hypot(a, b), dist }
}

/** The dial under a ray: the nearest blueprint it hits, if the hit lands on that blueprint's dial. */
export function dialAt(ray: Ray): { i: number; angle: number; r: number } | null {
  let best: { i: number; angle: number; r: number; dist: number } | null = null
  for (let i = 0; i < DIALS.length; i++) {
    const p = project(ray, i)
    if (p && (!best || p.dist < best.dist)) best = { i, ...p }
  }
  return best && best.r <= DIAL_OUTER ? best : null
}
