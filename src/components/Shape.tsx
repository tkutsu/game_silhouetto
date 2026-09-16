import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Quaternion, Raycaster, Vector2, Vector3, type Group, type Mesh } from 'three'
import { SCORE_RES, SPRING_DAMP, SPRING_K, STEP } from '../lib/constants'
import { DIAL_RING, dialAt, DIALS, project, ringPoint } from '../lib/dials'
import { flourishAt, FLOURISH_DELAY_SEC, FLOURISH_STAGGER_SEC } from '../lib/flourish'
import { AXES, type Level, type Move } from '../lib/level'
import { partMaterials } from '../lib/materials'
import { iou, type Silhouetter } from '../lib/silhouette'
import * as sound from '../lib/sound'
import { retrace, searchMoves } from '../lib/solver'
import { dials, useGame } from '../state/store'

const WHEEL_PER_RADIAN = 500
/** Floor on a dial's drag scale, in CSS px per radian, for rings seen nearly edge-on. */
const MIN_PX_PER_RADIAN = 60
/** Grabs this close to a ring's centre pull along the knob's direction instead of their own. */
const CENTRE_GRAB = DIAL_RING * 0.35
/**
 * How far off the ring (as a fraction of its radius) the pointer still circles the dial:
 * fully within ON_RING, fading out by OFF_RING, past which a drag is a straight pull.
 */
const ON_RING = 0.35
const OFF_RING = 0.6
/** A step commits this far into the drag, so the snap kicks in early. */
const TRIGGER = 0.55
/**
 * On a win this close the piece settles onto the exact solution, so the shadow lands dead
 * on the outline for the celebration. Wide enough for the few clicks a level's threshold
 * can accept, narrow enough that winning on a mirrored second solution doesn't spin it.
 */
const SNAP_ANGLE = 0.8
const SCORE_MS = 100
const SQUASH = 0.055
/** Gap between moves when the Solve button plays them back. */
const AUTO_MS = 190

const [X, Y] = AXES
const wobbleQ = new Quaternion()
const wobbleQ2 = new Quaternion()
const noteQ = new Quaternion()
const noteOffset = new Vector3()
const stepQ = new Quaternion()
const errQ = new Quaternion()
const springAxis = new Vector3()

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

interface PointerState {
  x: number
  y: number
  /** The grabbed dial's index; null for a second finger, which twists the roll. */
  dial: number | null
  /** Screen direction (unit, CSS px) a straight pull turns the dial forward along. */
  dx: number
  dy: number
  /** CSS px of pull along that direction per radian of turn. */
  scale: number
  /** The pointer's angle around the grabbed dial; NaN when its ray misses the dial's plane. */
  angle: number
  /** Smoothed pointer motion in CSS px, so one jittery event can't swing the pull direction. */
  mx: number
  my: number
}

export function Shape({ level, sil }: { level: Level; sil: Silhouetter }) {
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)
  const group = useRef<Group>(null)
  const models = useRef<(Mesh | null)[]>([])
  const materials = useMemo(() => partMaterials(level.kinds, gl), [level, gl])
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
    /** When the win landed, for the flourish; 0 until then. */
    solvedAt: 0,
    /** The player's piece turns, so Solve can always retrace the way back. */
    history: [] as Move[],
    /** Remaining moves while the Solve button plays; null until it's pressed. */
    plan: null as Move[] | null,
    nextMove: 0,
  }).current

  /** One 15° click of dial `i`, turning the piece about its axis. */
  const commit = (i: number, dir: number) => {
    dials.springs[i].target += dir * STEP
    s.q.premultiply(stepQ.setFromAxisAngle(AXES[i], dir * STEP)).normalize()
    s.history.push({ axis: AXES[i], dir })
    s.squash = 1
    s.dirty = true
    if (!useGame.getState().muted) sound.clunk()
    navigator.vibrate?.(10)
  }

  useEffect(() => {
    const el = gl.domElement
    const pointers = new Map<number, PointerState>()
    const raycaster = new Raycaster()
    const ndc = new Vector2()
    const a = new Vector3()
    const b = new Vector3()
    // pending turn per dial in radians; a step commits once TRIGGER of it is dragged
    const acc = [0, 0, 0]

    const drain = (i: number) => {
      while (Math.abs(acc[i]) >= STEP * TRIGGER) {
        commit(i, Math.sign(acc[i]))
        acc[i] -= Math.sign(acc[i]) * STEP
      }
    }

    const cast = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1))
      raycaster.setFromCamera(ndc, camera)
      return raycaster.ray
    }

    /** A world point in CSS px relative to the canvas. */
    const toScreen = (p: Vector3) => {
      const r = el.getBoundingClientRect()
      p.project(camera)
      return p.set(((p.x + 1) / 2) * r.width, ((1 - p.y) / 2) * r.height, 0)
    }

    /** The ring's on-screen tangent at `angle`: forward direction and CSS px per radian, 1:1 with the knob. */
    const tangent = (i: number, angle: number) => {
      const eps = 0.01
      toScreen(ringPoint(i, angle, a))
      toScreen(ringPoint(i, angle + eps, b)).sub(a).divideScalar(eps)
      const len = b.length() || 1
      return { dx: b.x / len, dy: b.y / len, scale: Math.max(len, MIN_PX_PER_RADIAN) }
    }

    const active = () => {
      const game = useGame.getState()
      // the help overlay covers the canvas, but keys would still reach the piece and start the clock
      if (game.solved || game.autoSolving || game.helpOpen) return false
      useGame.getState().begin()
      return true
    }

    const down = (e: PointerEvent) => {
      if (!active()) return
      const hit = dialAt(cast(e))
      // grab only a dial; a second finger may land anywhere (twist gesture)
      if (pointers.size === 0 && hit === null) return
      el.setPointerCapture(e.pointerId)
      const dir = hit
        ? tangent(hit.i, hit.r > CENTRE_GRAB ? hit.angle : DIALS[hit.i].knob + dials.springs[hit.i].target)
        : { dx: 0, dy: 0, scale: 1 }
      pointers.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
        dial: hit?.i ?? null,
        ...dir,
        angle: hit?.angle ?? Number.NaN,
        mx: 0,
        my: 0,
      })
      if (pointers.size === 1) acc.fill(0)
      dials.hot = hit?.i ?? dials.hot
      el.style.cursor = 'grabbing'
    }

    /**
     * Circling on the ring turns the dial with the pointer's angle around it. Off the ring
     * the drag is a straight pull, forward being the way the pointer last moved around the
     * dial: a wide circle keeps steering it, while a yank soon heads away from the centre,
     * which freezes it, so the dial keeps turning without having to circle.
     */
    const drag = (p: PointerState, i: number, e: PointerEvent) => {
      const mx = e.clientX - p.x
      const my = e.clientY - p.y
      const straight = (mx * p.dx + my * p.dy) / p.scale
      const hit = project(cast(e), i)
      const off = hit ? Math.abs(hit.r / DIAL_RING - 1) : Infinity
      const w = Math.min(1, Math.max(0, (OFF_RING - off) / (OFF_RING - ON_RING)))
      const circle = hit && !Number.isNaN(p.angle) ? wrapAngle(hit.angle - p.angle) : straight
      acc[i] += w * circle + (1 - w) * straight
      p.angle = hit?.angle ?? Number.NaN

      p.mx += (mx - p.mx) * 0.5
      p.my += (my - p.my) * 0.5
      const len = Math.hypot(p.mx, p.my)
      if (hit && len > 0) {
        const t = tangent(i, hit.angle)
        const along = (p.mx * t.dx + p.my * t.dy) / len
        // motion toward or away from the centre says nothing about which way is forward
        if (Math.abs(along) > 0.5) {
          p.dx = (Math.sign(along) * p.mx) / len
          p.dy = (Math.sign(along) * p.my) / len
          p.scale = t.scale
        }
      }
      drain(i)
    }

    const move = (e: PointerEvent) => {
      if (pointers.size === 0) {
        const hit = useGame.getState().solved ? null : dialAt(cast(e))
        dials.hot = hit?.i ?? -1
        el.style.cursor = hit ? 'grab' : 'default'
        return
      }
      const prev = pointers.get(e.pointerId)
      if (!prev || !active()) return

      if (pointers.size === 1) {
        if (prev.dial !== null) drag(prev, prev.dial, e)
      } else {
        const other = [...pointers].find(([id]) => id !== e.pointerId)?.[1]
        if (other) {
          const before = Math.atan2(prev.y - other.y, prev.x - other.x)
          const after = Math.atan2(e.clientY - other.y, e.clientX - other.x)
          acc[2] -= wrapAngle(after - before)
          drain(2)
        }
      }

      prev.x = e.clientX
      prev.y = e.clientY
    }

    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (pointers.size > 0) return
      dials.hot = -1
      el.style.cursor = 'default'
    }

    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      if (active()) {
        acc[2] -= e.deltaY / WHEEL_PER_RADIAN
        drain(2)
      }
    }

    // [dial, direction]
    const keys: Record<string, [number, number]> = {
      ArrowLeft: [1, -1],
      ArrowRight: [1, 1],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      KeyQ: [2, 1],
      KeyE: [2, -1],
    }
    const key = (e: KeyboardEvent) => {
      const k = keys[e.code]
      if (!k) return
      e.preventDefault()
      if (!active()) return
      commit(k[0], k[1])
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
      if (s.snap) s.shown.slerp(s.q, 1 - Math.exp(-dt * 6))
      s.spin.set(0, 0, 0)
      if (s.wobble > 0) s.wobble = 0

      // once the shadow has settled on the outline, each model takes its bow in turn
      if (!s.solvedAt) s.solvedAt = now
      const since = (now - s.solvedAt) / 1000 - FLOURISH_DELAY_SEC
      level.parts.forEach((part, i) => {
        const model = models.current[i]
        if (!model) return
        flourishAt(part.flourish, since - i * FLOURISH_STAGGER_SEC, noteOffset, noteQ)
        model.position.copy(part.pivot).add(noteOffset)
        model.quaternion.copy(noteQ)
      })
    } else {
      if (game.startedAt !== null && s.wobble > 0) s.wobble = Math.max(0, s.wobble - dt * 2)

      if (game.autoSolving) {
        if (s.plan === null) {
          const wins = (q: Quaternion) => iou(sil.render(level.geometry, q, SCORE_RES), level.target) >= level.winIou
          s.plan = searchMoves(s.q, level.solution, wins) ?? retrace(level.scramble, s.history)
        }
        const next = now >= s.nextMove ? s.plan.shift() : undefined
        if (next) {
          commit(AXES.indexOf(next.axis), next.dir)
          s.nextMove = now + AUTO_MS
        }
      }

      // the win fires the instant the threshold is crossed, mid-drag included
      if (s.dirty && now - s.lastScore > SCORE_MS) {
        const match = iou(sil.render(level.geometry, s.q, SCORE_RES), level.target)
        s.dirty = false
        s.lastScore = now
        game.setMatch(match)
        if (match >= level.winIou && game.startedAt !== null) {
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

    const m = group.current
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

  return (
    <group ref={group}>
      {level.parts.map((part, i) => (
        <mesh
          key={i}
          ref={(model) => {
            models.current[i] = model
          }}
          geometry={part.geometry}
          material={materials[i]}
          position={part.pivot}
          castShadow
        />
      ))}
    </group>
  )
}
