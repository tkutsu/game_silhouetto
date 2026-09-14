import { CanvasTexture, DoubleSide, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three'
import { range, rngFor, type Rng } from './rng'

const SIZE = 256
const PASTELS = ['#f9a8d4', '#fca5a5', '#fcd34d', '#86efac', '#93c5fd', '#c4b5fd', '#fdba74']

type Ctx = CanvasRenderingContext2D

const pastel = (rng: Rng) => PASTELS[Math.floor(rng() * PASTELS.length)]

const base = (ctx: Ctx, color: string) => {
  ctx.fillStyle = color
  ctx.fillRect(0, 0, SIZE, SIZE)
}

const blobs = (ctx: Ctx, rng: Rng, color: string, n: number, rx: [number, number], ry: [number, number]) => {
  ctx.fillStyle = color
  for (let i = 0; i < n; i++) {
    ctx.beginPath()
    ctx.ellipse(rng() * SIZE, rng() * SIZE, range(rng, ...rx), range(rng, ...ry), rng() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
}

const speckle = (ctx: Ctx, rng: Rng, colors: string[], n: number, size = 2) => {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)]
    ctx.globalAlpha = 0.25 + rng() * 0.5
    ctx.fillRect(rng() * SIZE, rng() * SIZE, size, size)
  }
  ctx.globalAlpha = 1
}

const strokes = (
  ctx: Ctx,
  rng: Rng,
  colors: string[],
  n: number,
  len: [number, number],
  spread: number,
  down = 0,
) => {
  ctx.lineWidth = 1.6
  for (let i = 0; i < n; i++) {
    ctx.strokeStyle = colors[Math.floor(rng() * colors.length)]
    const x = rng() * SIZE
    const y = rng() * SIZE
    const a = Math.PI / 2 + (rng() - 0.5) * spread + down
    const l = range(rng, ...len)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (rng() - 0.5) * 6, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l)
    ctx.stroke()
  }
}

interface Style {
  draw: (ctx: Ctx, rng: Rng) => void
  metalness?: number
  roughness?: number
  opacity?: number
}

const STYLES: Style[] = [
  {
    // brushed metal
    metalness: 0.7,
    roughness: 0.35,
    draw(ctx, rng) {
      base(ctx, '#c8d2da')
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
      base(ctx, '#fdfdf6')
      blobs(ctx, rng, '#241f1c', 7 + Math.floor(rng() * 4), [18, 45], [14, 34])
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
      base(ctx, a)
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
      base(ctx, pastel(rng))
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
  {
    // gold
    metalness: 0.85,
    roughness: 0.28,
    draw(ctx, rng) {
      base(ctx, '#f7c948')
      for (let i = 0; i < 70; i++) {
        ctx.strokeStyle = rng() < 0.5 ? 'rgba(255,240,180,0.5)' : 'rgba(190,130,30,0.4)'
        const x = rng() * SIZE
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x + range(rng, -20, 20), SIZE)
        ctx.stroke()
      }
    },
  },
  {
    // glass
    metalness: 0.1,
    roughness: 0.08,
    opacity: 0.5,
    draw(ctx, rng) {
      base(ctx, '#cfeaf6')
      ctx.strokeStyle = 'rgba(255,255,255,0.65)'
      ctx.lineWidth = 10
      for (let i = 0; i < 4; i++) {
        const x = range(rng, 0, SIZE)
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x + 70, SIZE)
        ctx.stroke()
      }
    },
  },
  {
    // wood grain
    roughness: 0.8,
    draw(ctx, rng) {
      base(ctx, '#9a6b3f')
      ctx.lineWidth = 2
      for (let y = 4; y < SIZE; y += range(rng, 7, 15)) {
        ctx.strokeStyle = rng() < 0.3 ? 'rgba(60,35,15,0.6)' : 'rgba(120,80,45,0.55)'
        ctx.beginPath()
        ctx.moveTo(0, y)
        for (let x = 0; x <= SIZE; x += 32) ctx.lineTo(x, y + Math.sin(x / 30 + y) * 4)
        ctx.stroke()
      }
      blobs(ctx, rng, 'rgba(60,35,15,0.5)', 2, [4, 7], [6, 10])
    },
  },
  {
    // grass
    roughness: 1,
    draw(ctx, rng) {
      base(ctx, '#3f8a35')
      strokes(ctx, rng, ['#2c6b25', '#5cb14e', '#7ed06b'], 500, [8, 18], 0.9)
    },
  },
  {
    // fur
    roughness: 1,
    draw(ctx, rng) {
      base(ctx, '#c98a4b')
      strokes(ctx, rng, ['#8a5a28', '#e3aa6b', '#a5713a', '#f0c896'], 700, [10, 20], 0.5, 0.3)
    },
  },
  {
    // cheese
    roughness: 0.75,
    draw(ctx, rng) {
      base(ctx, '#f6c453')
      const n = 8 + Math.floor(rng() * 5)
      for (let i = 0; i < n; i++) {
        const x = rng() * SIZE
        const y = rng() * SIZE
        const r = range(rng, 6, 18)
        ctx.fillStyle = '#c78f2e'
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#a9741f'
        ctx.beginPath()
        ctx.arc(x + r * 0.15, y + r * 0.2, r * 0.75, 0, Math.PI * 2)
        ctx.fill()
      }
    },
  },
  {
    // denim
    roughness: 0.95,
    draw(ctx, rng) {
      base(ctx, '#3b5b8f')
      ctx.lineWidth = 1
      for (let i = -SIZE; i < SIZE * 2; i += 4) {
        ctx.strokeStyle = i % 8 ? 'rgba(255,255,255,0.09)' : 'rgba(20,35,70,0.25)'
        ctx.beginPath()
        ctx.moveTo(i, 0)
        ctx.lineTo(i + SIZE, SIZE)
        ctx.stroke()
      }
      ctx.strokeStyle = '#e8a33d'
      ctx.lineWidth = 3
      ctx.setLineDash([10, 8])
      const y = range(rng, 40, SIZE - 40)
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(SIZE, y)
      ctx.stroke()
    },
  },
  {
    // concrete
    roughness: 1,
    draw(ctx, rng) {
      base(ctx, '#9aa0a6')
      speckle(ctx, rng, ['#7d838a', '#b4bac0', '#6a7076', '#c9cfd4'], 1800)
      ctx.strokeStyle = 'rgba(80,85,90,0.5)'
      ctx.lineWidth = 1
      for (let i = 0; i < 3; i++) {
        let x = rng() * SIZE
        let y = rng() * SIZE
        ctx.beginPath()
        ctx.moveTo(x, y)
        for (let k = 0; k < 5; k++) {
          x += range(rng, -30, 30)
          y += range(rng, 10, 30)
          ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
    },
  },
  {
    // rust
    metalness: 0.45,
    roughness: 0.85,
    draw(ctx, rng) {
      base(ctx, '#8c4a2a')
      ctx.globalAlpha = 0.55
      blobs(ctx, rng, '#5e3320', 10, [10, 35], [8, 26])
      blobs(ctx, rng, '#b06030', 10, [8, 30], [6, 22])
      blobs(ctx, rng, '#d97b3f', 6, [5, 16], [4, 12])
      ctx.globalAlpha = 1
      speckle(ctx, rng, ['#3f2114', '#e08a4a'], 700)
    },
  },
  {
    // glossy plastic
    roughness: 0.12,
    draw(ctx, rng) {
      base(ctx, pastel(rng))
      const g = ctx.createLinearGradient(0, 0, SIZE, SIZE)
      g.addColorStop(0, 'rgba(255,255,255,0.5)')
      g.addColorStop(0.4, 'rgba(255,255,255,0)')
      g.addColorStop(1, 'rgba(0,0,0,0.12)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, SIZE, SIZE)
    },
  },
  {
    // watermelon
    roughness: 0.7,
    draw(ctx, rng) {
      base(ctx, '#ff6b81')
      ctx.fillStyle = '#2b1a12'
      for (let i = 0; i < 26; i++) {
        ctx.save()
        ctx.translate(rng() * SIZE, rng() * SIZE)
        ctx.rotate(rng() * Math.PI)
        ctx.beginPath()
        ctx.ellipse(0, 0, 3, 5.5, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    },
  },
  {
    // leopard
    roughness: 0.9,
    draw(ctx, rng) {
      base(ctx, '#e0b163')
      for (let i = 0; i < 22; i++) {
        const x = rng() * SIZE
        const y = rng() * SIZE
        const r = range(rng, 7, 13)
        ctx.strokeStyle = '#3d2413'
        ctx.lineWidth = 4
        for (let k = 0; k < 3; k++) {
          const a0 = rng() * Math.PI * 2
          ctx.beginPath()
          ctx.arc(x, y, r, a0, a0 + range(rng, 1, 2.2))
          ctx.stroke()
        }
        ctx.fillStyle = 'rgba(150,90,40,0.8)'
        ctx.beginPath()
        ctx.arc(x, y, r * 0.45, 0, Math.PI * 2)
        ctx.fill()
      }
    },
  },
  {
    // circuit board
    metalness: 0.4,
    roughness: 0.5,
    draw(ctx, rng) {
      base(ctx, '#0f5132')
      ctx.strokeStyle = '#d4af37'
      ctx.fillStyle = '#d4af37'
      ctx.lineWidth = 3
      for (let i = 0; i < 14; i++) {
        let x = rng() * SIZE
        let y = rng() * SIZE
        ctx.beginPath()
        ctx.arc(x, y, 5, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.moveTo(x, y)
        for (let k = 0; k < 3; k++) {
          if (rng() < 0.5) x += range(rng, -60, 60)
          else y += range(rng, -60, 60)
          ctx.lineTo(x, y)
        }
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(x, y, 5, 0, Math.PI * 2)
        ctx.fill()
      }
    },
  },
  {
    // bologna
    roughness: 0.65,
    draw(ctx, rng) {
      base(ctx, '#e59aa7')
      speckle(ctx, rng, ['#d4838f', '#f2b3bd'], 500)
      blobs(ctx, rng, 'rgba(250,246,240,0.95)', 14 + Math.floor(rng() * 6), [4, 12], [4, 11])
      blobs(ctx, rng, '#7a9e4f', 3, [2.5, 4], [2.5, 4])
    },
  },
  {
    // bee
    roughness: 0.8,
    draw(ctx) {
      base(ctx, '#f5c518')
      ctx.fillStyle = '#221a10'
      for (let y = 0; y < SIZE; y += 64) ctx.fillRect(0, y, SIZE, 30)
    },
  },
  {
    // night sky
    roughness: 0.9,
    draw(ctx, rng) {
      base(ctx, '#1b2a5e')
      for (let i = 0; i < 90; i++) {
        ctx.fillStyle = `rgba(255,255,${200 + Math.floor(rng() * 55)},${0.4 + rng() * 0.6})`
        const r = rng() < 0.9 ? 1.2 : 2.5
        ctx.beginPath()
        ctx.arc(rng() * SIZE, rng() * SIZE, r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = '#f6e7b2'
      ctx.beginPath()
      ctx.arc(rng() * SIZE, rng() * SIZE, 14, 0, Math.PI * 2)
      ctx.fill()
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
  const materials: MeshStandardMaterial[] = []
  for (let i = 0; i < count; i++) {
    const style = STYLES[order[i % order.length]]
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = SIZE
    const ctx = canvas.getContext('2d')
    if (ctx) style.draw(ctx, rng)
    const map = new CanvasTexture(canvas)
    map.colorSpace = SRGBColorSpace
    map.wrapS = map.wrapT = RepeatWrapping
    materials.push(
      new MeshStandardMaterial({
        map,
        metalness: style.metalness ?? 0,
        roughness: style.roughness ?? 0.8,
        transparent: style.opacity !== undefined,
        opacity: style.opacity ?? 1,
        side: DoubleSide,
      }),
    )
  }
  return materials
}
