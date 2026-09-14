import { CanvasTexture, DoubleSide, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three'
import { range, rngFor, type Rng } from './rng'

const SIZE = 256
const PASTELS = ['#f9a8d4', '#fca5a5', '#fcd34d', '#86efac', '#93c5fd', '#c4b5fd', '#fdba74']

type Ctx = CanvasRenderingContext2D

const pastel = (rng: Rng) => PASTELS[Math.floor(rng() * PASTELS.length)]

interface Style {
  draw: (ctx: Ctx, rng: Rng) => void
  metalness?: number
  roughness?: number
}

const STYLES: Style[] = [
  {
    // brushed metal
    metalness: 0.7,
    roughness: 0.35,
    draw(ctx, rng) {
      ctx.fillStyle = '#c8d2da'
      ctx.fillRect(0, 0, SIZE, SIZE)
      for (let i = 0; i < 120; i++) {
        const g = 150 + Math.floor(rng() * 100)
        ctx.strokeStyle = `rgba(${g},${g + 8},${g + 16},0.5)`
        const x = rng() * SIZE
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, SIZE)
        ctx.stroke()
      }
    },
  },
  {
    // cow
    roughness: 0.9,
    draw(ctx, rng) {
      ctx.fillStyle = '#fdfdf6'
      ctx.fillRect(0, 0, SIZE, SIZE)
      ctx.fillStyle = '#241f1c'
      const n = 7 + Math.floor(rng() * 4)
      for (let i = 0; i < n; i++) {
        ctx.beginPath()
        ctx.ellipse(rng() * SIZE, rng() * SIZE, range(rng, 18, 45), range(rng, 14, 34), rng() * Math.PI, 0, Math.PI * 2)
        ctx.fill()
      }
    },
  },
  {
    // patchwork with stitches
    roughness: 1,
    draw(ctx, rng) {
      const n = 4
      const s = SIZE / n
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          ctx.fillStyle = pastel(rng)
          ctx.fillRect(x * s, y * s, s, s)
        }
      ctx.strokeStyle = 'rgba(70,45,70,0.55)'
      ctx.setLineDash([6, 5])
      ctx.lineWidth = 2
      for (let i = 0; i <= n; i++) {
        ctx.beginPath()
        ctx.moveTo(i * s, 0)
        ctx.lineTo(i * s, SIZE)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(0, i * s)
        ctx.lineTo(SIZE, i * s)
        ctx.stroke()
      }
    },
  },
  {
    // candy stripes
    roughness: 0.6,
    draw(ctx, rng) {
      const a = pastel(rng)
      let b = pastel(rng)
      while (b === a) b = pastel(rng)
      ctx.fillStyle = a
      ctx.fillRect(0, 0, SIZE, SIZE)
      ctx.fillStyle = b
      ctx.translate(SIZE / 2, SIZE / 2)
      ctx.rotate(Math.PI / 4)
      for (let x = -SIZE; x < SIZE; x += 48) ctx.fillRect(x, -SIZE, 24, SIZE * 2)
    },
  },
  {
    // polka dots
    roughness: 0.85,
    draw(ctx, rng) {
      ctx.fillStyle = pastel(rng)
      ctx.fillRect(0, 0, SIZE, SIZE)
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      const s = 36
      for (let y = 0; y * s < SIZE; y++)
        for (let x = 0; x * s < SIZE; x++) {
          ctx.beginPath()
          ctx.arc(x * s + (y % 2 ? s / 2 : 0) + s / 4, y * s + s / 4, 7, 0, Math.PI * 2)
          ctx.fill()
        }
    },
  },
]

/** One seeded material per merged-geometry group, cycling through shuffled styles. */
export function createPartMaterials(seed: string, count: number): MeshStandardMaterial[] {
  const rng = rngFor(`${seed}#materials`)
  const order = STYLES.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return Array.from({ length: count }, (_, i) => {
    const style = STYLES[order[i % order.length]]
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = SIZE
    const ctx = canvas.getContext('2d')
    if (ctx) style.draw(ctx, rng)
    const map = new CanvasTexture(canvas)
    map.colorSpace = SRGBColorSpace
    map.wrapS = map.wrapT = RepeatWrapping
    return new MeshStandardMaterial({
      map,
      metalness: style.metalness ?? 0,
      roughness: style.roughness ?? 0.8,
      side: DoubleSide,
    })
  })
}
