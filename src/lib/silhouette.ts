import {
  Color,
  DataTexture,
  DoubleSide,
  LinearFilter,
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

/** Outline + faint fill texture for drawing the target on the wall. */
export function maskTexture(mask: Mask, res: number, stroke = 3): DataTexture {
  const data = new Uint8Array(res * res * 4)
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < res && y < res && mask[y * res + x] === 1

  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      if (!at(x, y)) continue
      let edge = false
      for (let d = 1; d <= stroke && !edge; d++) {
        edge = !at(x + d, y) || !at(x - d, y) || !at(x, y + d) || !at(x, y - d)
      }
      const i = (y * res + x) * 4
      data[i] = data[i + 1] = data[i + 2] = 255
      data[i + 3] = edge ? 255 : 40
    }
  }

  const tex = new DataTexture(data, res, res)
  tex.colorSpace = SRGBColorSpace
  tex.magFilter = LinearFilter
  tex.minFilter = LinearFilter
  tex.needsUpdate = true
  return tex
}
