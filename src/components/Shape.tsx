import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { DoubleSide, Quaternion, Vector3, type Mesh } from 'three'
import { SCORE_RES, WIN_IOU } from '../lib/constants'
import type { Level } from '../lib/level'
import { iou, type Silhouetter } from '../lib/silhouette'
import { useGame } from '../state/store'

const DRAG_SPEED = 0.008
const WHEEL_SPEED = 0.002
const KEY_STEP = 0.05
const MAX_SPIN = 12
const SNAP_ANGLE = 0.5
const SETTLE_MS = 150
const SCORE_MS = 100

const X = new Vector3(1, 0, 0)
const Y = new Vector3(0, 1, 0)
const Z = new Vector3(0, 0, 1)

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

export function Shape({ level, sil }: { level: Level; sil: Silhouetter }) {
  const gl = useThree((s) => s.gl)
  const mesh = useRef<Mesh>(null)
  const s = useRef({
    q: (useGame.getState().solved ? level.solution : level.start).clone(),
    vel: new Vector3(),
    dragging: false,
    snap: false,
    dirty: true,
    unchecked: false,
    lastInput: 0,
    lastScore: 0,
  }).current

  const rotate = (axis: Vector3, angle: number) => {
    if (!angle) return
    s.q.premultiply(new Quaternion().setFromAxisAngle(axis, angle)).normalize()
    s.dirty = s.unchecked = true
    s.lastInput = performance.now()
  }

  useEffect(() => {
    const el = gl.domElement
    const pointers = new Map<number, { x: number; y: number }>()
    const axis = new Vector3()
    let lastMove = 0

    const active = () => {
      if (useGame.getState().solved) return false
      useGame.getState().begin()
      return true
    }

    const down = (e: PointerEvent) => {
      if (!active()) return
      el.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      s.dragging = true
      s.vel.set(0, 0, 0)
      lastMove = performance.now()
    }

    const move = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId)
      if (!prev || useGame.getState().solved) return
      const now = performance.now()

      if (pointers.size === 1) {
        const dx = e.clientX - prev.x
        const dy = e.clientY - prev.y
        const len = Math.hypot(dx, dy)
        if (len > 0) {
          axis.set(dy, dx, 0).divideScalar(len)
          rotate(axis, len * DRAG_SPEED)
          const dt = Math.max((now - lastMove) / 1000, 1 / 240)
          s.vel.lerp(axis.multiplyScalar((len * DRAG_SPEED) / dt), 0.5).clampLength(0, MAX_SPIN)
        }
      } else {
        const other = [...pointers].find(([id]) => id !== e.pointerId)?.[1]
        if (other) {
          const before = Math.atan2(prev.y - other.y, prev.x - other.x)
          const after = Math.atan2(e.clientY - other.y, e.clientX - other.x)
          rotate(Z, -wrapAngle(after - before))
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
      if (performance.now() - lastMove > 60) s.vel.set(0, 0, 0)
    }

    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      if (active()) rotate(Z, -e.deltaY * WHEEL_SPEED)
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
      if (active()) rotate(...k)
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
    } else {
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

    mesh.current?.quaternion.copy(s.q)
  })

  return (
    <mesh ref={mesh} geometry={level.geometry} castShadow>
      <meshStandardMaterial color="#e07a5f" roughness={0.55} side={DoubleSide} />
    </mesh>
  )
}
