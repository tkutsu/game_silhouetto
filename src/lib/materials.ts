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
 * CC0 texture sets in public/textures/<id>/ from ambientCG and Poly Haven, picked for
 * strong normal maps over flat glossy surfaces. See public/textures/CREDITS.md.
 * `metal: 'full'` sets are uniformly metallic, so they skip the map download.
 */
const SETS: { id: string; metal?: 'map' | 'full' }[] = [
  { id: 'AcousticFoam003' },
  { id: 'Bamboo001A' },
  { id: 'Bark004' },
  { id: 'Bricks075A' },
  { id: 'Candy001' },
  { id: 'Candy002' },
  { id: 'Candy003' },
  { id: 'Carpet014' },
  { id: 'Chainmail004', metal: 'full' },
  { id: 'Cork001' },
  { id: 'CorrugatedSteel008A' },
  { id: 'CorrugatedSteel009', metal: 'full' },
  { id: 'denim_fabric' },
  { id: 'DiamondPlate007D', metal: 'map' },
  { id: 'Fabric083' },
  { id: 'Foam001' },
  { id: 'Foam002' },
  { id: 'Foam003' },
  { id: 'Foil002', metal: 'full' },
  { id: 'Grass001' },
  { id: 'Ground054' },
  { id: 'knitted_fleece' },
  { id: 'Lava001' },
  { id: 'Lava003' },
  { id: 'Leather034C' },
  { id: 'Moss001' },
  { id: 'Pizza001' },
  { id: 'Pizza002' },
  { id: 'Pizza003' },
  { id: 'Pizza004' },
  { id: 'Rock030' },
  { id: 'RoofingTiles006' },
  { id: 'RoofingTiles014A' },
  { id: 'Rope001' },
  { id: 'Rope003' },
  { id: 'Shells001' },
  { id: 'Sponge001' },
  { id: 'Sponge002' },
  { id: 'Sponge003' },
  { id: 'Wicker006' },
  { id: 'Wicker008A' },
  { id: 'Wicker010A' },
  { id: 'WoodChips001' },
]

const BUMP = new Vector2(1.4, 1.4)
const loader = new TextureLoader()
const cache = new Map<string, Texture>()

/** Textures are shared across puzzles and never disposed; the whole set is about 2.5 MB. */
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
  for (const { id, metal } of SETS) {
    texture(id, 'color', true)
    texture(id, 'normal')
    texture(id, 'rough')
    if (metal === 'map') texture(id, 'metal')
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

/** 'Foam002' and 'Foam001' look alike; group ids by their letter prefix so a shape never repeats a family. */
const family = (id: string) => /^[A-Z]/.test(id) ? (id.match(/^[A-Za-z]+/) as RegExpMatchArray)[0] : id

/** One seeded material per merged-geometry group; no two parts share a texture family. */
export function createPartMaterials(seed: string, count: number, gl: WebGLRenderer): MeshStandardMaterial[] {
  const rng = rngFor(`${seed}#materials`)
  const order = SETS.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const picked: number[] = []
  const used = new Set<string>()
  for (const idx of order) {
    const fam = family(SETS[idx].id)
    if (used.has(fam)) continue
    used.add(fam)
    picked.push(idx)
    if (picked.length === count) break
  }
  return Array.from({ length: count }, (_, i) => {
    const { id, metal } = SETS[picked[i % picked.length]]
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
