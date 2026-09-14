import { useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'
import { WALL_Z } from '../lib/constants'

function vignette() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const g = ctx.createRadialGradient(256, 256, 0, 256, 256, 256)
    g.addColorStop(0, '#ffffff')
    g.addColorStop(0.09, '#d9d1c8')
    g.addColorStop(0.22, '#3a3430')
    g.addColorStop(1, '#141110')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 512, 512)
  }
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  return tex
}

export function Wall() {
  const map = useMemo(() => vignette(), [])
  return (
    <mesh position={[0, 0, WALL_Z]} receiveShadow>
      <planeGeometry args={[40, 30]} />
      <meshStandardMaterial map={map} color="#e9dfd3" roughness={1} />
    </mesh>
  )
}
