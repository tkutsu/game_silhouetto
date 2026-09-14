import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'
import { WALL_Z } from '../lib/constants'

/** Canvas pixels per world unit. High because the wall is seen at a steep angle and magnifies the near side. */
const PX = 320
const FONT = 110
const LINE = 146
const PAD = 40
const ARROW = 300
const INK = 'rgba(230,242,255,0.95)'

type Arrow = 'up' | 'down'

function makeLabel(text: string, arrow: Arrow, anisotropy: number) {
  const lines = text.split('\n')
  const font = `600 ${FONT}px ui-monospace, SFMono-Regular, Menlo, monospace`
  const measure = document.createElement('canvas').getContext('2d')
  let textW = 0
  if (measure) {
    measure.font = font
    measure.letterSpacing = '6px'
    textW = Math.max(...lines.map((l) => measure.measureText(l).width))
  }

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(textW + PAD * 2)
  canvas.height = lines.length * LINE + PAD * 2 + ARROW
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.font = font
    ctx.letterSpacing = '6px'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.fillStyle = INK
    ctx.strokeStyle = INK

    const cx = canvas.width / 2
    const textTop = arrow === 'down' ? PAD : PAD + ARROW
    lines.forEach((l, i) => ctx.fillText(l, cx, textTop + LINE * (i + 0.5)))

    const dir = arrow === 'down' ? 1 : -1
    const start = arrow === 'down' ? textTop + lines.length * LINE + 20 : textTop - 20
    const tip = start + dir * (ARROW - 50)
    ctx.lineWidth = 12
    ctx.lineCap = 'round'
    ctx.setLineDash([34, 26])
    ctx.beginPath()
    ctx.moveTo(cx, start)
    ctx.lineTo(cx, tip - dir * 44)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(cx, tip)
    ctx.lineTo(cx - 34, tip - dir * 58)
    ctx.lineTo(cx + 34, tip - dir * 58)
    ctx.closePath()
    ctx.fill()
  }

  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = anisotropy
  return { tex, w: canvas.width / PX, h: canvas.height / PX }
}

/** Blueprint-style callout drawn on the wall, with a dashed arrow toward its subject. */
export function Annotation({ position, text, arrow }: { position: [number, number]; text: string; arrow: Arrow }) {
  const gl = useThree((s) => s.gl)
  const { tex, w, h } = useMemo(
    () => makeLabel(text, arrow, gl.capabilities.getMaxAnisotropy()),
    [text, arrow, gl],
  )
  useEffect(() => () => tex.dispose(), [tex])
  return (
    <mesh position={[position[0], position[1], WALL_Z + 0.02]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}
