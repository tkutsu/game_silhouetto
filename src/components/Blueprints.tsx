import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CanvasTexture, SRGBColorSpace, type Group, type Mesh, type Texture } from 'three'
import { FRAME, SPRING_DAMP, SPRING_K } from '../lib/constants'
import { DIAL_RING, DIALS } from '../lib/dials'
import { dialTexture } from '../lib/silhouette'
import { dials, useGame } from '../state/store'

const W = 2048
// larger than the view in every direction, so no edge ever shows
const WORLD = 48
const PX_PER_UNIT = W / WORLD

function blueprint() {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = W
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const g = ctx.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2)
    g.addColorStop(0, '#4d85bd')
    g.addColorStop(0.18, '#2a5688')
    g.addColorStop(0.45, '#16334f')
    g.addColorStop(1, '#0a1626')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, W)

    const grid = (step: number, alpha: number) => {
      ctx.strokeStyle = `rgba(190,220,255,${alpha})`
      ctx.lineWidth = step > PX_PER_UNIT * 2 ? 2.5 : 1.5
      for (let x = 0.5; x <= W; x += step) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, W)
        ctx.stroke()
      }
      for (let y = 0.5; y <= W; y += step) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(W, y)
        ctx.stroke()
      }
    }
    grid(PX_PER_UNIT, 0.05)
    grid(PX_PER_UNIT * 5, 0.1)
  }
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  return tex
}

const KNOB_HOT = 1.35

/** How far an unlit blueprint fades back, so the ones in play lead. */
const DARK = ['#7d8fa6', '#6a7d93', '#ffffff']

/** One blueprint with its dial: the dashed ring and knob turn with the dial's spring, the grid stays still. */
function Blueprint({ index, map, ring, lit }: { index: number; map: Texture; ring: Texture; lit: boolean }) {
  const { center, frame, knob } = DIALS[index]
  const spin = useRef<Group>(null)
  const puck = useRef<Mesh>(null)

  useFrame((_, dt) => {
    const spring = dials.springs[index]
    spring.vel += (spring.target - spring.angle) * SPRING_K * dt
    spring.vel *= Math.exp(-SPRING_DAMP * dt)
    spring.angle += spring.vel * dt
    if (spin.current) spin.current.rotation.z = knob + spring.angle
    const p = puck.current
    if (p) p.scale.setScalar(p.scale.x + ((dials.hot.has(index) ? KNOB_HOT : 1) - p.scale.x) * (1 - Math.exp(-dt * 14)))
  })

  return (
    <group position={center} quaternion={frame}>
      <mesh>
        <planeGeometry args={[WORLD, WORLD]} />
        {/* a blueprint with no shadow on it is only scenery, and sits back */}
        <meshBasicMaterial map={map} color={lit ? '#ffffff' : DARK[index]} />
      </mesh>
      {/* only the dial turns; the blueprint under it stays put */}
      <group ref={spin}>
        <mesh position={[0, 0, 0.012]}>
          <planeGeometry args={[FRAME * 2, FRAME * 2]} />
          <meshBasicMaterial map={ring} transparent depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh ref={puck} position={[DIAL_RING, 0, 0.06]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.13, 0.13, 0.09, 28]} />
          <meshStandardMaterial color="#f5b841" emissive="#7a4a00" roughness={0.45} />
        </mesh>
      </group>
    </group>
  )
}

/**
 * The drafting corner: side wall, floor and back wall blueprints, one per rotation axis.
 * They ignore scene lights so the shape can be lit dramatically without washing out the
 * shadows, which LevelView lays over the ones the level lights up.
 */
export function Blueprints() {
  const gl = useThree((s) => s.gl)
  const map = useMemo(() => {
    const tex = blueprint()
    tex.anisotropy = gl.capabilities.getMaxAnisotropy()
    return tex
  }, [gl])
  const ring = useMemo(() => dialTexture(), [])
  useEffect(() => () => ring.dispose(), [ring])
  const views = useGame((s) => s.level?.views)

  return (
    <>
      {DIALS.map((_, i) => (
        <Blueprint key={i} index={i} map={map} ring={ring} lit={!!views?.some((v) => v.axis === i)} />
      ))}
    </>
  )
}
