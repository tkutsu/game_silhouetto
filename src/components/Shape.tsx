import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Plane, Quaternion, Raycaster, Vector2, Vector3, type Mesh } from 'three'
import { FRAME, SCORE_RES, SPRING_DAMP, SPRING_K, STEP, WALL_Z, WIN_IOU } from '../lib/constants'
import { AXES, type Level, type Move } from '../lib/level'
import { createPartMaterials } from '../lib/materials'
import { iou, type Silhouetter } from '../lib/silhouette'
import * as sound from '../lib/sound'
import { searchMoves } from '../lib/solver'
import { useGame } from '../state/store'

const PX_PER_RADIAN = 125
const WHEEL_PER_RADIAN = 500
/** A step commits this far into the drag, so the snap kicks in early. */
const TRIGGER = 0.55
const SNAP_ANGLE = 0.5
const SCORE_MS = 100
const SQUASH = 0.055
/** Gap between moves when the Solve button plays them back. */
const AUTO_MS = 190
/** How fast the Solve button glides when no step path fits: the playback speed. */
const SOLVE_RATE = STEP / (AUTO_MS / 1000)
/** Wall drags inside this radius act as a dial; past the dashed ring they're inert. */
const DIAL_OUTER = FRAME * 1.05
/** The dashed ring's radius: the dial tracks the finger 1:1 there and slows toward
 * the centre, where a raw angle would spin wildly on tiny movements. */
const DIAL_RING = FRAME * 0.94

const [X, Y, Z] = AXES
const wobbleQ = new Quaternion()
const wobbleQ2 = new Quaternion()
const stepQ = new Quaternion()
const errQ = new Quaternion()
const springAxis = new Vector3()

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

interface PointerState {
  x: number
  y: number
  dial: boolean
  angle: number
}

export function Shape({ level, sil }: { level: Level; sil: Silhouetter }) {
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)
  const mesh = useRef<Mesh>(null)
  const materials = useMemo(() => createPartMaterials(level.seed, level.kinds, gl), [level, gl])
  const s = useRef({
    /** Logical orientation, always exactly on the step grid. */
    q: level.start.clone(),
    /** What's rendered: springs after q, overshooting a touch on each landing. */
    shown: level.start.clone(),
    spin: new Vector3(),
    squash: 0,
    snap: false,
    dirty: true,
    wobble: 1,
    lastScore: 0,
    /** Remaining moves while the Solve button plays; null until it's pressed. */
    plan: null as Move[] | null,
    nextMove: 0,
  }).current

  useEffect(
    () => () =>
      materials.forEach((m) => m.dispose()),
    [materials],
  )

  const commit = (axis: Vector3, dir: number) => {
    s.q.premultiply(stepQ.setFromAxisAngle(axis, dir * STEP)).normalize()
    s.dirty = true
    s.squash = 1
    if (!useGame.getState().muted) sound.clunk()
    navigator.vibrate?.(10)
    if (axis === Z) useGame.getState().rollBy(dir * STEP)
  }

  /** Freeform turn for the piece itself: no grid, no clunk, tracks the finger directly. */
  const rotate = (axis: Vector3, angle: number) => {
    s.q.premultiply(stepQ.setFromAxisAngle(axis, angle)).normalize()
    s.shown.copy(s.q)
    s.spin.set(0, 0, 0)
    s.dirty = true
  }

  useEffect(() => {
    const el = gl.domElement
    const pointers = new Map<number, PointerState>()
    const raycaster = new Raycaster()
    const ndc = new Vector2()
    const hitPoint = new Vector3()
    const wallPlane = new Plane(Z, -WALL_Z)
    // pending roll in radians; a step commits once TRIGGER of it is dragged
    const acc = { roll: 0 }

    const drainRoll = () => {
      while (Math.abs(acc.roll) >= STEP * TRIGGER) {
        commit(Z, Math.sign(acc.roll))
        acc.roll -= Math.sign(acc.roll) * STEP
      }
    }

    const cast = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1))
      raycaster.setFromCamera(ndc, camera)
    }
    const onShape = (e: PointerEvent) => {
      cast(e)
      return mesh.current ? raycaster.intersectObject(mesh.current, false).length > 0 : false
    }
    /** Angle and radius around the shadow's centre on the wall, or null when off the dial. */
    const dialHit = (e: PointerEvent): { angle: number; r: number } | null => {
      cast(e)
      if (!raycaster.ray.intersectPlane(wallPlane, hitPoint)) return null
      const r = Math.hypot(hitPoint.x, hitPoint.y)
      return r <= DIAL_OUTER ? { angle: Math.atan2(hitPoint.y, hitPoint.x), r } : null
    }

    const active = () => {
      if (useGame.getState().solved || useGame.getState().autoSolving) return false
      useGame.getState().begin()
      return true
    }

    const down = (e: PointerEvent) => {
      if (!active()) return
      const shape = onShape(e)
      const hit = shape ? null : dialHit(e)
      // grab only the piece or the dial; a second finger may land anywhere (twist gesture)
      if (pointers.size === 0 && !shape && hit === null) return
      el.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, dial: hit !== null, angle: hit?.angle ?? 0 })
      if (pointers.size === 1) acc.roll = 0
      el.style.cursor = 'grabbing'
    }

    const move = (e: PointerEvent) => {
      if (pointers.size === 0) {
        const solved = useGame.getState().solved
        el.style.cursor = !solved && (onShape(e) || dialHit(e) !== null) ? 'grab' : 'default'
        return
      }
      const prev = pointers.get(e.pointerId)
      if (!prev || !active()) return

      if (pointers.size === 1) {
        if (prev.dial) {
          const hit = dialHit(e)
          if (hit === null) {
            // off the dial: re-anchor on re-entry instead of applying the jump
            prev.angle = Number.NaN
          } else {
            if (!Number.isNaN(prev.angle)) acc.roll += wrapAngle(hit.angle - prev.angle) * Math.min(1, hit.r / DIAL_RING)
            prev.angle = hit.angle
            drainRoll()
          }
        } else {
          // turntable: horizontal drag yaws, vertical drag pitches; roll lives on the shadow dial
          rotate(Y, (e.clientX - prev.x) / PX_PER_RADIAN)
          rotate(X, (e.clientY - prev.y) / PX_PER_RADIAN)
        }
      } else {
        const other = [...pointers].find(([id]) => id !== e.pointerId)?.[1]
        if (other) {
          const before = Math.atan2(prev.y - other.y, prev.x - other.x)
          const after = Math.atan2(e.clientY - other.y, e.clientX - other.x)
          acc.roll -= wrapAngle(after - before)
          drainRoll()
        }
      }

      prev.x = e.clientX
      prev.y = e.clientY
    }

    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (pointers.size > 0) return
      el.style.cursor = 'default'
    }

    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      if (active()) {
        acc.roll -= e.deltaY / WHEEL_PER_RADIAN
        drainRoll()
      }
    }

    const keys: Record<string, [Vector3, number]> = {
      ArrowLeft: [Y, -1],
      ArrowRight: [Y, 1],
      ArrowUp: [X, -1],
      ArrowDown: [X, 1],
      KeyQ: [Z, 1],
      KeyE: [Z, -1],
    }
    const key = (e: KeyboardEvent) => {
      const k = keys[e.code]
      if (!k) return
      e.preventDefault()
      if (!active()) return
      const [axis, dir] = k
      // only the shadow's roll is stepped; arrows nudge the piece freely (hold to keep turning)
      if (axis === Z) commit(axis, dir)
      else rotate(axis, (dir * STEP) / 3)
    }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    window.addEventListener('keydown', key)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
      window.removeEventListener('keydown', key)
    }
  })

  useFrame((_, dt) => {
    const game = useGame.getState()
    const now = performance.now()

    if (game.solved) {
      s.q.copy(level.solution)
      if (s.snap) s.shown.slerp(level.solution, 1 - Math.exp(-dt * 6))
      s.spin.set(0, 0, 0)
      if (s.wobble > 0) s.wobble = 0
    } else {
      if (game.startedAt !== null && s.wobble > 0) s.wobble = Math.max(0, s.wobble - dt * 2)

      if (game.autoSolving) {
        // stepped playback when a short path exists; the piece is freeform now, so when
        // none does (or the path lands shy of the win) glide the rest of the way
        if (s.plan === null) {
          const wins = (q: Quaternion) => iou(sil.render(level.geometry, q, SCORE_RES), level.target) >= WIN_IOU
          s.plan = searchMoves(s.q, level.solution, wins) ?? []
        }
        if (s.plan.length > 0) {
          if (now >= s.nextMove) {
            const next = s.plan.shift()
            if (next) commit(next.axis, next.dir)
            s.nextMove = now + AUTO_MS
          }
        } else {
          s.q.rotateTowards(level.solution, SOLVE_RATE * dt)
          s.dirty = true
        }
      }

      // the win fires the instant the threshold is crossed, mid-drag included
      if (s.dirty && now - s.lastScore > SCORE_MS) {
        const match = iou(sil.render(level.geometry, s.q, SCORE_RES), level.target)
        s.dirty = false
        s.lastScore = now
        game.setMatch(match)
        if (match >= WIN_IOU && game.startedAt !== null) {
          s.snap = s.q.angleTo(level.solution) < SNAP_ANGLE
          game.solve(match)
        }
      }

      // spring the shown orientation toward the grid orientation
      errQ.copy(s.shown).invert().premultiply(s.q)
      if (errQ.w < 0) errQ.set(-errQ.x, -errQ.y, -errQ.z, -errQ.w)
      const err = 2 * Math.acos(Math.min(errQ.w, 1))
      if (err > 1e-4) {
        springAxis.set(errQ.x, errQ.y, errQ.z).normalize()
        s.spin.addScaledVector(springAxis, err * SPRING_K * dt)
      }
      s.spin.multiplyScalar(Math.exp(-SPRING_DAMP * dt))
      const w = s.spin.length()
      if (w > 1e-4) {
        s.shown.premultiply(stepQ.setFromAxisAngle(springAxis.copy(s.spin).divideScalar(w), w * dt)).normalize()
      } else if (err < 1e-3) {
        s.shown.copy(s.q)
      }
    }

    s.squash = Math.max(0, s.squash - dt * 6)

    const m = mesh.current
    if (!m) return
    m.quaternion.copy(s.shown)
    m.scale.setScalar(game.solved ? 1 : 1 - SQUASH * s.squash)

    if (s.wobble > 0.001) {
      const t = now / 1000
      wobbleQ
        .setFromAxisAngle(Y, Math.sin(t * 1.1) * 0.1 * s.wobble)
        .multiply(wobbleQ2.setFromAxisAngle(X, Math.sin(t * 0.7 + 1) * 0.07 * s.wobble))
      m.quaternion.premultiply(wobbleQ)
    }
  })

  return <mesh ref={mesh} geometry={level.geometry} material={materials} castShadow />
}
