import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Plane, Quaternion, Raycaster, Vector2, Vector3, type Mesh } from 'three'
import { FRAME, SCORE_RES, WALL_Z, WIN_IOU } from '../lib/constants'
import type { Level } from '../lib/level'
import { createPartMaterials } from '../lib/materials'
import { iou, type Silhouetter } from '../lib/silhouette'
import { useGame } from '../state/store'

const DRAG_SPEED = 0.008
const WHEEL_SPEED = 0.002
const KEY_STEP = 0.05
const MAX_SPIN = 12
const SNAP_ANGLE = 0.5
const SETTLE_MS = 150
const SCORE_MS = 100
/** Drags starting on the wall this close to the shadow's centre act as a dial. */
const DIAL_RADIUS = FRAME * 2.2

const X = new Vector3(1, 0, 0)
const Y = new Vector3(0, 1, 0)
const Z = new Vector3(0, 0, 1)
const wobbleQ = new Quaternion()
const wobbleQ2 = new Quaternion()

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
  const materials = useMemo(() => createPartMaterials(level.seed, level.geometry.groups.length), [level])
  const s = useRef({
    q: (useGame.getState().solved ? level.solution : level.start).clone(),
    vel: new Vector3(),
    dragging: false,
    snap: false,
    dirty: true,
    unchecked: false,
    wobble: useGame.getState().solved ? 0 : 1,
    lastInput: 0,
    lastScore: 0,
  }).current

  useEffect(
    () => () =>
      materials.forEach((m) => {
        m.map?.dispose()
        m.dispose()
      }),
    [materials],
  )

  const rotate = (axis: Vector3, angle: number) => {
    if (!angle) return
    s.q.premultiply(new Quaternion().setFromAxisAngle(axis, angle)).normalize()
    s.dirty = s.unchecked = true
    s.lastInput = performance.now()
  }

  useEffect(() => {
    const el = gl.domElement
    const pointers = new Map<number, PointerState>()
    const raycaster = new Raycaster()
    const ndc = new Vector2()
    const hitPoint = new Vector3()
    const wallPlane = new Plane(Z, -WALL_Z)
    const axis = new Vector3()
    let lastMove = 0

    const cast = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1))
      raycaster.setFromCamera(ndc, camera)
    }
    const onShape = (e: PointerEvent) => {
      cast(e)
      return mesh.current ? raycaster.intersectObject(mesh.current, false).length > 0 : false
    }
    /** Angle around the shadow's centre on the wall, or null when off the dial. */
    const dialAngle = (e: PointerEvent): number | null => {
      cast(e)
      if (!raycaster.ray.intersectPlane(wallPlane, hitPoint)) return null
      return Math.hypot(hitPoint.x, hitPoint.y) <= DIAL_RADIUS ? Math.atan2(hitPoint.y, hitPoint.x) : null
    }

    const active = () => {
      if (useGame.getState().solved) return false
      useGame.getState().begin()
      return true
    }

    const down = (e: PointerEvent) => {
      if (!active()) return
      el.setPointerCapture(e.pointerId)
      const angle = onShape(e) ? null : dialAngle(e)
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, dial: angle !== null, angle: angle ?? 0 })
      s.dragging = true
      s.vel.set(0, 0, 0)
      lastMove = performance.now()
      el.style.cursor = 'grabbing'
    }

    const move = (e: PointerEvent) => {
      if (pointers.size === 0) {
        const solved = useGame.getState().solved
        el.style.cursor = !solved && (onShape(e) || dialAngle(e) !== null) ? 'grab' : 'default'
        return
      }
      const prev = pointers.get(e.pointerId)
      if (!prev || useGame.getState().solved) return
      const now = performance.now()

      if (pointers.size === 1) {
        if (prev.dial) {
          const angle = dialAngle(e)
          if (angle !== null) {
            rotate(Z, wrapAngle(angle - prev.angle))
            prev.angle = angle
            useGame.getState().markSpin()
          }
        } else {
          const dx = e.clientX - prev.x
          const dy = e.clientY - prev.y
          const len = Math.hypot(dx, dy)
          if (len > 0) {
            axis.set(dy, dx, 0).divideScalar(len)
            rotate(axis, len * DRAG_SPEED)
            useGame.getState().markTumble()
            const dt = Math.max((now - lastMove) / 1000, 1 / 240)
            s.vel.lerp(axis.multiplyScalar((len * DRAG_SPEED) / dt), 0.5).clampLength(0, MAX_SPIN)
          }
        }
      } else {
        const other = [...pointers].find(([id]) => id !== e.pointerId)?.[1]
        if (other) {
          const before = Math.atan2(prev.y - other.y, prev.x - other.x)
          const after = Math.atan2(e.clientY - other.y, e.clientX - other.x)
          rotate(Z, -wrapAngle(after - before))
          useGame.getState().markSpin()
        }
      }

      lastMove = now
      prev.x = e.clientX
      prev.y = e.clientY
    }

    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (pointers.size > 0) return
      s.dragging = false
      el.style.cursor = 'default'
      if (performance.now() - lastMove > 60) s.vel.set(0, 0, 0)
    }

    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      if (active()) {
        rotate(Z, -e.deltaY * WHEEL_SPEED)
        useGame.getState().markSpin()
      }
    }

    const keys: Record<string, [Vector3, number]> = {
      ArrowLeft: [Y, -KEY_STEP],
      ArrowRight: [Y, KEY_STEP],
      ArrowUp: [X, -KEY_STEP],
      ArrowDown: [X, KEY_STEP],
      KeyQ: [Z, KEY_STEP],
      KeyE: [Z, -KEY_STEP],
    }
    const key = (e: KeyboardEvent) => {
      const k = keys[e.code]
      if (!k) return
      e.preventDefault()
      if (active()) {
        rotate(...k)
        useGame.getState()[k[0] === Z ? 'markSpin' : 'markTumble']()
      }
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
      if (s.snap) s.q.slerp(level.solution, 1 - Math.exp(-dt * 6))
      if (s.wobble > 0) s.wobble = 0
    } else {
      if (game.startedAt !== null && s.wobble > 0) s.wobble = Math.max(0, s.wobble - dt * 2)

      if (!s.dragging && s.vel.lengthSq() > 0) {
        const w = s.vel.length()
        rotate(s.vel.clone().divideScalar(w), w * dt)
        s.vel.multiplyScalar(Math.exp(-dt * 5))
        if (w < 0.05) s.vel.set(0, 0, 0)
      }

      const settled = !s.dragging && s.vel.lengthSq() === 0 && now - s.lastInput > SETTLE_MS
      if ((settled && s.unchecked) || (s.dirty && now - s.lastScore > SCORE_MS)) {
        const match = iou(sil.render(level.geometry, s.q, SCORE_RES), level.target)
        s.dirty = false
        s.lastScore = now
        game.setMatch(match)
        if (settled) {
          s.unchecked = false
          if (match >= WIN_IOU) {
            s.snap = s.q.angleTo(level.solution) < SNAP_ANGLE
            game.solve(match)
          }
        }
      }
    }

    const m = mesh.current
    if (!m) return
    m.quaternion.copy(s.q)
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
