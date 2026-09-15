import {
  CanvasTexture,
  DoubleSide,
  MeshStandardMaterial,
  PMREMGenerator,
  type Texture,
  type WebGLRenderer,
} from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { paletteFor } from './objects'

let environment: Texture | null = null

/**
 * Studio reflections for the shape only. Set per material rather than on
 * scene.environment, which would also light the wall and wash out the shadow.
 */
function reflections(gl: WebGLRenderer): Texture {
  if (!environment) {
    const pmrem = new PMREMGenerator(gl)
    environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
  }
  return environment
}

/** The kit palettes ship muted; repaint each one punchier for a toy-like look. */
function vivid(palette: Texture): Texture {
  const image = palette.image as { width: number; height: number }
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return palette
  ctx.filter = 'saturate(1.5) brightness(1.05)'
  ctx.drawImage(palette.image as CanvasImageSource, 0, 0)
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = palette.colorSpace
  tex.flipY = palette.flipY
  tex.wrapS = palette.wrapS
  tex.wrapT = palette.wrapT
  tex.magFilter = palette.magFilter
  tex.minFilter = palette.minFilter
  return tex
}

const cache = new Map<Texture | null, MeshStandardMaterial>()

/** One flat-colored material per geometry group, shared by every model of the same kit. Never disposed. */
export function partMaterials(kinds: string[], gl: WebGLRenderer): MeshStandardMaterial[] {
  return kinds.map((kind) => {
    const palette = paletteFor(kind)
    let material = cache.get(palette)
    if (!material) {
      material = new MeshStandardMaterial({
        map: palette && vivid(palette),
        // glossy toy plastic
        roughness: 0.3,
        envMap: reflections(gl),
        envMapIntensity: 0.9,
        // removeNubs leaves holes inside neighboring parts; their back faces must still render
        side: DoubleSide,
      })
      cache.set(palette, material)
    }
    return material
  })
}
