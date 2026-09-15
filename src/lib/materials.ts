import {
  DoubleSide,
  MeshStandardMaterial,
  PMREMGenerator,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  type Texture,
  type WebGLRenderer,
} from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { rngFor } from './rng'

/**
 * Contextual CC0 texture sets per object kind (ambientCG + Poly Haven, see
 * public/textures/CREDITS.md): a teddy gets plush fabrics, a coin gets metals.
 * At least three options each, so repeated kinds across puzzles still vary.
 */
const OBJECT_TEXTURES: Record<string, string[]> = {
  coin: ['Foil002', 'Metal032', 'DiamondPlate007D', 'Chainmail004'],
  star: ['Foil002', 'Candy001', 'Snow009A', 'Lava001'],
  gingerbread: ['Cork001', 'WoodChips001', 'Sponge001', 'Bark004'],
  teddy: ['knitted_fleece', 'Carpet014', 'Fabric083', 'denim_fabric'],
  piggy: ['Cork001', 'Candy001', 'Foil002', 'Snow009A'],
  spoon: ['Metal032', 'Wood066', 'Foil002', 'Bamboo001A'],
  cake: ['Sponge001', 'Candy001', 'Snow009A', 'Cork001'],
  sausage: ['Leather034C', 'Cork001', 'Bark004', 'WoodChips001'],
  pizza: ['Pizza003', 'Sponge001', 'Cork001', 'RoofingTiles006'],
  mug: ['Snow009A', 'Candy001', 'Bricks075A', 'Foam002'],
  bone: ['Snow009A', 'Foam002', 'Shells001', 'Rock030'],
  heart: ['Candy001', 'Cork001', 'knitted_fleece', 'Lava001'],
  moon: ['Snow009A', 'Foil002', 'Rock030', 'AcousticFoam003'],
  rocket: ['CorrugatedSteel009', 'DiamondPlate007D', 'Foil002', 'Lava001'],
  pawn: ['Wood066', 'Metal032', 'Snow009A', 'Rock030'],
  fish: ['Shells001', 'denim_fabric', 'Foil002', 'Snow009A'],
}

/** Uniformly metallic sets skip the metalness-map download; 'map' sets ship one. */
const METAL: Record<string, 'map' | 'full'> = {
  Chainmail004: 'full',
  CorrugatedSteel009: 'full',
  DiamondPlate007D: 'map',
  Foil002: 'full',
  Metal032: 'full',
}

const ALL_SETS = [...new Set(Object.values(OBJECT_TEXTURES).flat())]

const BUMP = new Vector2(1.4, 1.4)
const loader = new TextureLoader()
const cache = new Map<string, Texture>()

/** Textures are shared across puzzles and never disposed; the whole set is about 1.5 MB. */
function texture(id: string, map: string, color = false): Texture {
  const url = `${import.meta.env.BASE_URL}textures/${id}/${map}.webp`
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
  for (const id of ALL_SETS) {
    texture(id, 'color', true)
    texture(id, 'normal')
    texture(id, 'rough')
    if (METAL[id] === 'map') texture(id, 'metal')
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

/** One material per object, seeded from its kind's contextual list, no repeats within a level. */
export function createPartMaterials(seed: string, kinds: string[], gl: WebGLRenderer): MeshStandardMaterial[] {
  const rng = rngFor(`${seed}#materials`)
  const used = new Set<string>()
  return kinds.map((kind) => {
    const options = OBJECT_TEXTURES[kind] ?? ALL_SETS
    const offset = Math.floor(rng() * options.length)
    let id = options[offset]
    for (let i = 0; i < options.length; i++) {
      const candidate = options[(offset + i) % options.length]
      if (!used.has(candidate)) {
        id = candidate
        break
      }
    }
    used.add(id)
    const metal = METAL[id]
    return new MeshStandardMaterial({
      name: id,
      map: texture(id, 'color', true),
      normalMap: texture(id, 'normal'),
      roughnessMap: texture(id, 'rough'),
      normalScale: BUMP,
      metalnessMap: metal === 'map' ? texture(id, 'metal') : null,
      metalness: metal ? 1 : 0,
      envMap: reflections(gl),
      envMapIntensity: 0.6,
      side: DoubleSide,
    })
  })
}
