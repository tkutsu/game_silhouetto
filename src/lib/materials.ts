import {
  DoubleSide,
  MeshStandardMaterial,
  PMREMGenerator,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
  type WebGLRenderer,
} from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { rngFor } from './rng'

/**
 * CC0 texture sets in public/textures/<id>/ (color, normal, rough, optional metal),
 * from ambientCG and Poly Haven. See public/textures/CREDITS.md.
 */
const SETS: { id: string; metal?: boolean }[] = [
  { id: 'Candy001' },
  { id: 'Carpet006' },
  { id: 'Chainmail004', metal: true },
  { id: 'ChristmasTreeOrnament011', metal: true },
  { id: 'ChristmasTreeOrnament015', metal: true },
  { id: 'ChristmasTreeOrnament016', metal: true },
  { id: 'ChristmasTreeOrnament017', metal: true },
  { id: 'Clay003' },
  { id: 'Cork003' },
  { id: 'Fabric080' },
  { id: 'Foam002' },
  { id: 'Foil002', metal: true },
  { id: 'Grass005' },
  { id: 'Ice002' },
  { id: 'Lava004' },
  { id: 'Leather034C' },
  { id: 'Marble016' },
  { id: 'Metal032', metal: true },
  { id: 'Metal048A', metal: true },
  { id: 'Metal053C', metal: true },
  { id: 'Moss002' },
  { id: 'Onyx010' },
  { id: 'Onyx011' },
  { id: 'PaintedMetal010', metal: true },
  { id: 'PaintedMetal016', metal: true },
  { id: 'Pizza003' },
  { id: 'Plastic014A' },
  { id: 'Plastic015A' },
  { id: 'Rope001', metal: true },
  { id: 'Sponge001' },
  { id: 'Sponge003' },
  { id: 'Terrazzo009' },
  { id: 'Wicker007A' },
  { id: 'Wood066' },
  { id: 'denim_fabric' },
  { id: 'knitted_fleece' },
]

const loader = new TextureLoader()
const cache = new Map<string, Texture>()

/** Textures are shared across puzzles and never disposed; the whole set is 4.4 MB. */
function texture(id: string, map: string, color = false): Texture {
  const url = `${import.meta.env.BASE_URL}textures/${id}/${map}.jpg`
  let tex = cache.get(url)
  if (!tex) {
    tex = loader.load(url)
    tex.wrapS = tex.wrapT = RepeatWrapping
    if (color) tex.colorSpace = SRGBColorSpace
    cache.set(url, tex)
  }
  return tex
}

export function preloadTextures() {
  for (const { id, metal } of SETS) {
    texture(id, 'color', true)
    texture(id, 'normal')
    texture(id, 'rough')
    if (metal) texture(id, 'metal')
  }
}

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

/** One seeded material per merged-geometry group, drawn without repeats from the shuffled sets. */
export function createPartMaterials(seed: string, count: number, gl: WebGLRenderer): MeshStandardMaterial[] {
  const rng = rngFor(`${seed}#materials`)
  const order = SETS.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return Array.from({ length: count }, (_, i) => {
    const { id, metal } = SETS[order[i % order.length]]
    return new MeshStandardMaterial({
      map: texture(id, 'color', true),
      normalMap: texture(id, 'normal'),
      roughnessMap: texture(id, 'rough'),
      metalnessMap: metal ? texture(id, 'metal') : null,
      metalness: metal ? 1 : 0,
      envMap: reflections(gl),
      envMapIntensity: 0.6,
      side: DoubleSide,
    })
  })
}
