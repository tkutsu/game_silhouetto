import {
  CanvasTexture,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  Quaternion,
  Scene,
  SRGBColorSpace,
  WebGLRenderTarget,
  type BufferGeometry,
  type WebGLRenderer,
} from 'three'
import { FRAME, LIGHT_Z } from './constants'

export type Mask = Uint8Array

/** Renders a geometry's orthographic silhouette along -Z, matching the shadow light's projection. */
export class Silhouetter {
  private scene = new Scene()
  private camera = new OrthographicCamera(-FRAME, FRAME, FRAME, -FRAME, 0.1, LIGHT_Z * 2)
  private mesh = new Mesh(undefined, new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide }))
  private targets = new Map<number, { rt: WebGLRenderTarget; buf: Uint8Array }>()
  private gl: WebGLRenderer

  constructor(gl: WebGLRenderer) {
    this.gl = gl
    this.scene.background = new Color(0x000000)
    this.camera.position.set(0, 0, LIGHT_Z)
    this.scene.add(this.mesh)
  }

  render(geometry: BufferGeometry, quaternion: Quaternion, res: number): Mask {
    let target = this.targets.get(res)
    if (!target) {
      target = { rt: new WebGLRenderTarget(res, res), buf: new Uint8Array(res * res * 4) }
      this.targets.set(res, target)
    }
    this.mesh.geometry = geometry
    this.mesh.quaternion.copy(quaternion)

    const prev = this.gl.getRenderTarget()
    this.gl.setRenderTarget(target.rt)
    this.gl.render(this.scene, this.camera)
    this.gl.readRenderTargetPixels(target.rt, 0, 0, res, res, target.buf)
    this.gl.setRenderTarget(prev)

    const mask = new Uint8Array(res * res)
    for (let i = 0; i < mask.length; i++) mask[i] = target.buf[i * 4] > 127 ? 1 : 0
    return mask
  }

  dispose() {
    this.targets.forEach(({ rt }) => rt.dispose())
    this.targets.clear()
    this.mesh.material.dispose()
  }
}

export function iou(a: Mask, b: Mask): number {
  let inter = 0
  let union = 0
  for (let i = 0; i < a.length; i++) {
    inter += a[i] & b[i]
    union += a[i] | b[i]
  }
  return union ? inter / union : 0
}

export const coverage = (mask: Mask) => mask.reduce((n, v) => n + v, 0) / mask.length

/** Blueprint-style target: white outline, hatched fill, dashed dial ring with rotation arrows. */
export function maskTexture(mask: Mask, res: number, label: string): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = res
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')

  const k = res / 512
  const stroke = Math.max(2, Math.round(3 * k))
  const hatchPeriod = Math.max(4, Math.round(7 * k))
  const hatchWidth = Math.max(1, Math.round(2 * k))
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < res && y < res && mask[y * res + x] === 1
  const img = ctx.createImageData(res, res)
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      if (!at(x, y)) continue
      let edge = false
      for (let d = 1; d <= stroke && !edge; d++) {
        edge = !at(x + d, y) || !at(x - d, y) || !at(x, y + d) || !at(x, y - d)
      }
      // canvas rows run top-down; the mask (from readPixels) runs bottom-up
      const i = ((res - 1 - y) * res + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
      img.data[i + 3] = edge ? 255 : (x + y) % hatchPeriod < hatchWidth ? 90 : 32
    }
  }
  ctx.putImageData(img, 0, 0)

  const c = res / 2
  const r = res * 0.47
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'
  ctx.lineWidth = Math.max(1, res / 256)
  ctx.setLineDash([res / 64, res / 96])
  ctx.beginPath()
  ctx.arc(c, c, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2
    ctx.beginPath()
    ctx.moveTo(c + Math.cos(a) * (r - res / 48), c + Math.sin(a) * (r - res / 48))
    ctx.lineTo(c + Math.cos(a) * (r + res / 48), c + Math.sin(a) * (r + res / 48))
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  for (const base of [Math.PI / 4, Math.PI + Math.PI / 4]) {
    const ax = c + Math.cos(base) * r
    const ay = c + Math.sin(base) * r
    const t = base + Math.PI / 2
    const size = res / 36
    ctx.beginPath()
    ctx.moveTo(ax + Math.cos(t) * size, ay + Math.sin(t) * size)
    ctx.lineTo(ax + Math.cos(base) * size * 0.6, ay + Math.sin(base) * size * 0.6)
    ctx.lineTo(ax - Math.cos(base) * size * 0.6, ay - Math.sin(base) * size * 0.6)
    ctx.closePath()
    ctx.fill()
  }

  ctx.font = `${res / 26}px ui-monospace, monospace`
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.textAlign = 'left'
  ctx.fillText(label, res * 0.015, res * 0.99)

  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  return tex
}
