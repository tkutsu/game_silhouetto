import { useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'
import { WALL_Z } from '../lib/constants'

const W = 2048
const H = 1536
const WORLD_W = 40
const WORLD_H = 30
const PX_PER_UNIT = W / WORLD_W

function blueprint() {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2)
    g.addColorStop(0, '#4d85bd')
    g.addColorStop(0.18, '#2a5688')
    g.addColorStop(0.45, '#16334f')
    g.addColorStop(1, '#0a1626')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)

    const grid = (step: number, alpha: number) => {
      ctx.strokeStyle = `rgba(190,220,255,${alpha})`
      ctx.lineWidth = step > PX_PER_UNIT * 2 ? 2.5 : 1.5
      for (let x = 0.5; x <= W; x += step) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, H)
        ctx.stroke()
      }
      for (let y = 0.5; y <= H; y += step) {
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
  const map = useMemo(() => {
    const tex = blueprint()
    tex.anisotropy = gl.capabilities.getMaxAnisotropy()
    return tex
  }, [gl])
  return (
    <mesh position={[0, 0, WALL_Z]} receiveShadow>
      <planeGeometry args={[WORLD_W, WORLD_H]} />
      <meshStandardMaterial map={map} roughness={1} />
    </mesh>
  )
}
