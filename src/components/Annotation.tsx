import { useEffect, useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'
import { WALL_Z } from '../lib/constants'

const PX = 64 // canvas pixels per world unit
const FONT = 34
const LINE = 46
const PAD = 18
const ARROW = 110
const ARROW_V = 80

type Arrow = 'left' | 'right' | 'up' | 'down'

function arrowhead(ctx: CanvasRenderingContext2D, tipX: number, tipY: number, dx: number, dy: number) {
  ctx.beginPath()
  ctx.moveTo(tipX + dx * 12, tipY + dy * 12)
  ctx.lineTo(tipX - dx * 6 - dy * 10, tipY - dy * 6 + dx * 10)
  ctx.lineTo(tipX - dx * 6 + dy * 10, tipY - dy * 6 - dx * 10)
  ctx.closePath()
  ctx.fillStyle = 'rgba(230,242,255,0.8)'
  ctx.fill()
}

function makeLabel(lines: string[], arrow: Arrow) {
  const canvas = document.createElement('canvas')
  const ctx0 = canvas.getContext('2d')
  const font = `${FONT}px ui-monospace, SFMono-Regular, monospace`
  let textW = 0
  if (ctx0) {
    ctx0.font = font
    textW = Math.max(...lines.map((l) => ctx0.measureText(l).width))
  }
  const sideArrow = arrow === 'left' || arrow === 'right'
  canvas.width = Math.ceil(textW + PAD * 2 + (sideArrow ? ARROW : 0))
  canvas.height = lines.length * LINE + PAD * 2 + (sideArrow ? 0 : ARROW_V)
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.font = font
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(230,242,255,0.92)'
    ctx.strokeStyle = 'rgba(230,242,255,0.8)'
    const textX = arrow === 'left' ? ARROW + PAD : PAD
    const textY = sideArrow || arrow === 'down' ? PAD : PAD + ARROW_V
    lines.forEach((l, i) => ctx.fillText(l, textX, textY + LINE * (i + 0.5)))

    ctx.lineWidth = 3
    ctx.setLineDash([12, 9])
    if (sideArrow) {
      const y = canvas.height / 2
      const [from, to] = arrow === 'left' ? [ARROW - 14, 16] : [canvas.width - ARROW + 14, canvas.width - 16]
      ctx.beginPath()
      ctx.moveTo(from, y)
      ctx.lineTo(to, y)
      ctx.stroke()
      ctx.setLineDash([])
      arrowhead(ctx, to, y, arrow === 'left' ? -1 : 1, 0)
    } else {
      const x = canvas.width / 2
      const [from, to] = arrow === 'up' ? [ARROW_V - 14, 16] : [canvas.height - ARROW_V + 14, canvas.height - 16]
      ctx.beginPath()
      ctx.moveTo(x, from)
      ctx.lineTo(x, to)
      ctx.stroke()
      ctx.setLineDash([])
      arrowhead(ctx, x, to, 0, arrow === 'up' ? -1 : 1)
    }
  }
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  return { tex, w: canvas.width / PX, h: canvas.height / PX }
}

/** Blueprint-style callout drawn on the wall, with a dashed arrow toward its subject. */
export function Annotation({ position, lines, arrow }: { position: [number, number]; lines: string[]; arrow: Arrow }) {
  const { tex, w, h } = useMemo(() => makeLabel(lines, arrow), [lines, arrow])
  useEffect(() => () => tex.dispose(), [tex])
  return (
    <mesh position={[position[0], position[1], WALL_Z + 0.02]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}
