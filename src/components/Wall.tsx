import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { CanvasTexture, SRGBColorSpace, type Mesh } from 'three'
import { SPRING_DAMP, SPRING_K, WALL_Z } from '../lib/constants'
import { rollSpring, useGame } from '../state/store'

const W = 2048
// square and larger than the view, so the blueprint can spin without exposing corners
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

export function Wall() {
  const gl = useThree((s) => s.gl)
  const grid = useRef<Mesh>(null)
  const map = useMemo(() => {
    const tex = blueprint()
    tex.anisotropy = gl.capabilities.getMaxAnisotropy()
    return tex
  }, [gl])

  // Drives the shared blueprint spring; the wall mounts first, so the outline
  // and dial in LevelView read this frame's value.
  useFrame((_, dt) => {
    rollSpring.vel += (useGame.getState().roll - rollSpring.angle) * SPRING_K * dt
    rollSpring.vel *= Math.exp(-SPRING_DAMP * dt)
    rollSpring.angle += rollSpring.vel * dt
    if (grid.current) grid.current.rotation.z = rollSpring.angle
  })

  // The wall ignores scene lights so the shape can be lit dramatically without washing out
  // the shadow; a ShadowMaterial layer on top darkens only where the shape blocks the light.
  return (
    <>
      <mesh ref={grid} position={[0, 0, WALL_Z]}>
        <planeGeometry args={[WORLD, WORLD]} />
        <meshBasicMaterial map={map} />
      </mesh>
      <mesh position={[0, 0, WALL_Z + 0.002]} receiveShadow>
        <planeGeometry args={[WORLD, WORLD]} />
        <shadowMaterial color="#010611" opacity={0.6} transparent depthWrite={false} />
      </mesh>
    </>
  )
}
