import { Box3, BufferGeometry, Mesh, Vector3, type MeshStandardMaterial, type Object3D, type Texture } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type InsideFn = (p: Vector3) => boolean

export interface Solid {
  geometry: BufferGeometry
  /** True when the point is within the solid volume (or a voxel its surface crosses), in the same frame as the geometry. */
  inside: InsideFn
  /** Points spread over the surface, in the same frame, for overlap tests. */
  samples: Float32Array
  /** Real-world size relative to the median model, clamped so tiny items stay readable. */
  scale: number
  /** Bounding box in the model frame, which is upright as the kit authored it. */
  box: Box3
  role: Role
  /** Stick-in objects can go into it: soft food, cups, bowls. */
  host: boolean
}

/**
 * How an object joins a scene. Bases go under everything, stackables sit on or beside
 * things, leaners tilt against them and stick-ins go tip first into a host.
 */
export type Role = 'base' | 'stack' | 'lean' | 'poke'

/**
 * Low-poly CC0 models from Kenney's Food and Holiday kits (public/models/CREDITS.md).
 * Each kit colors its models from one small palette image.
 */
const MODELS: Record<string, string[]> = {
  food: [
    'advocado-half', 'apple-half', 'bacon', 'banana', 'barrel', 'beet', 'bottle-ketchup', 'bottle-oil',
    'bowl-broth', 'bowl-cereal', 'bowl-soup', 'bread', 'broccoli', 'burger', 'cake-birthday', 'cake-slicer',
    'can-open', 'candy-bar-wrapper', 'carrot', 'carton', 'cauliflower', 'celery-stick', 'cheese', 'cheese-cut',
    'cherries', 'chinese', 'chocolate-wrapper', 'chopstic-decorative', 'cocktail', 'coconut-half', 'cookie',
    'cooking-knife', 'cooking-knife-chopping', 'cooking-spatula', 'cooking-spoon', 'corn', 'corn-dog',
    'croissant', 'cup-coffee', 'cup-tea', 'cupcake', 'cutting-board-japanese', 'dim-sum', 'donut-sprinkles',
    'egg-cooked', 'eggplant', 'fish', 'fish-bones', 'frappe', 'fries', 'frikandel-speciaal', 'frying-pan',
    'ginger-bread', 'grapes', 'honey', 'hot-dog', 'ice-cream', 'knife-block', 'leek', 'lemon-half', 'loaf',
    'loaf-baguette', 'lollypop', 'meat-cooked', 'meat-tenderizer', 'mug', 'mushroom-half', 'onion-half',
    'orange', 'pan-stew', 'pancakes', 'paprika', 'paprika-slice', 'peanut-butter', 'pear', 'pear-half', 'pie',
    'pineapple', 'pizza', 'plate-dinner', 'popsicle', 'popsicle-chocolate', 'pot-stew',
    'pumpkin', 'pumpkin-basic', 'radish', 'rice-ball', 'rollingPin', 'salad', 'sandwich', 'shaker-salt',
    'skewer', 'skewer-vegetables', 'soda-can', 'soda-glass', 'strawberry', 'styrofoam-dinner', 'sub', 'sundae',
    'sushi-egg', 'sushi-salmon', 'taco', 'tomato', 'turkey', 'utensil-fork', 'utensil-knife', 'utensil-spoon',
    'whole-ham', 'wholer-ham', 'wine-red', 'wine-white',
  ],
  holiday: [
    'bench-short', 'candy-cane-green', 'candy-cane-red', 'gingerbread-man', 'gingerbread-woman', 'lantern',
    'nutcracker', 'present-a-cube', 'reindeer', 'sled', 'sled-long', 'snowman', 'train-locomotive',
    'tree-decorated-snow', 'wreath-decorated',
  ],
}

const BASES = new Set([
  'plate-dinner', 'pizza', 'pie', 'frying-pan', 'cutting-board-japanese', 'styrofoam-dinner', 'pan-stew',
  'sled', 'sled-long', 'bench-short',
])
const POKERS = new Set([
  'utensil-fork', 'utensil-knife', 'utensil-spoon', 'chopstic-decorative', 'skewer', 'skewer-vegetables',
  'candy-cane-red', 'candy-cane-green', 'lollypop', 'cooking-spoon', 'cake-slicer', 'celery-stick',
])
const HOSTS = new Set([
  'cake-birthday', 'pie', 'cupcake', 'burger', 'sundae', 'ice-cream', 'bowl-broth', 'bowl-cereal', 'bowl-soup',
  'salad', 'mug', 'cup-coffee', 'cup-tea', 'pot-stew', 'pan-stew', 'frappe', 'cocktail', 'soda-glass', 'can-open',
  'pineapple', 'cheese', 'loaf', 'whole-ham', 'wholer-ham', 'turkey', 'pumpkin', 'pumpkin-basic', 'honey',
  'peanut-butter', 'chinese', 'fries',
])

const KIT_OF = new Map(Object.entries(MODELS).flatMap(([kit, kinds]) => kinds.map((kind) => [kind, kit])))
export const OBJECT_KINDS = [...KIT_OF.keys()]

/** Every model is scaled to this bounding-sphere radius before its real-size scale. */
export const MODEL_RADIUS = 0.5
/** Real-size scale bounds: a rice ball next to a Christmas tree would vanish. */
const SIZE_MIN = 0.6
const SIZE_MAX = 1.5
/** Inside tests use a voxel grid this many cells across the model's bounding box. */
const VOXELS = 32
/** Overlap samples are spread over the surface this far apart, finer than the thinnest model. */
const SAMPLE_SPACING = 0.015

const geometries = new Map<string, BufferGeometry>()
const palettes = new Map<string, Texture>()
const nativeRadii = new Map<string, number>()
const voxels = new Map<string, Pick<Solid, 'inside' | 'samples'>>()
let loading: Promise<void> | null = null

/** One indexed position/normal/uv geometry per model, centered and scaled to MODEL_RADIUS, plus its native radius. */
function flatten(root: Object3D): { geometry: BufferGeometry; palette: Texture | null; radius: number } {
  const parts: BufferGeometry[] = []
  let palette: Texture | null = null
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return
    palette ??= (o.material as MeshStandardMaterial).map
    let g = new BufferGeometry()
    for (const name of ['position', 'normal', 'uv']) g.setAttribute(name, o.geometry.attributes[name].clone())
    if (o.geometry.index) g.setIndex(o.geometry.index.clone())
    else g = mergeVertices(g)
    g.applyMatrix4(o.matrixWorld)
    parts.push(g)
  })
  const geometry = parts.length === 1 ? parts[0] : mergeGeometries(parts)
  if (parts.length > 1) parts.forEach((g) => g.dispose())
  if (!geometry) throw new Error('model merge failed')
  geometry.center()
  geometry.computeBoundingSphere()
  const radius = geometry.boundingSphere?.radius ?? 1
  geometry.scale(MODEL_RADIUS / radius, MODEL_RADIUS / radius, MODEL_RADIUS / radius)
  return { geometry, palette, radius }
}

/** Fetches every model once; levels can only be built after this resolves. */
export function loadObjects(): Promise<void> {
  loading ??= (async () => {
    const loader = new GLTFLoader()
    await Promise.all(
      OBJECT_KINDS.map(async (kind) => {
        const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${KIT_OF.get(kind)}/${kind}.glb`)
        gltf.scene.updateMatrixWorld(true)
        const { geometry, palette, radius } = flatten(gltf.scene)
        geometries.set(kind, geometry)
        nativeRadii.set(kind, radius)
        const kit = KIT_OF.get(kind) ?? ''
        if (palette && !palettes.has(kit)) palettes.set(kit, palette)
      }),
    )
  })()
  return loading
}

/** The kit's palette image that colors this kind. */
export function paletteFor(kind: string): Texture | null {
  return palettes.get(KIT_OF.get(kind) ?? '') ?? null
}

const corners = [new Vector3(), new Vector3(), new Vector3()]
const stretch = new Vector3()
const from = new Vector3()
const to = new Vector3()
const point = new Vector3()

/**
 * Calls `visit` with points covering triangle `t` of a flat array, neighbors at most
 * `spacing` apart, after stretching each axis by `scale`. Rows run parallel to the
 * longest edge, so slivers stay cheap. Points are passed back unstretched.
 */
function surfacePoints(tris: Float32Array, t: number, spacing: number, scale: number[], visit: (p: Vector3) => void) {
  stretch.fromArray(scale)
  corners.forEach((v, i) => v.fromArray(tris, t + 3 * i).multiply(stretch))
  const lengths = corners.map((v, i) => v.distanceTo(corners[(i + 1) % 3]))
  const k = lengths.indexOf(Math.max(...lengths))
  const [p0, p1, p2] = [corners[k], corners[(k + 1) % 3], corners[(k + 2) % 3]]
  const long = lengths[k]
  const height = long ? from.subVectors(p1, p0).cross(to.subVectors(p2, p0)).length() / long : 0
  const rows = Math.max(1, Math.ceil(height / spacing))
  for (let r = 0; r <= rows; r++) {
    from.lerpVectors(p0, p2, r / rows)
    to.lerpVectors(p1, p2, r / rows)
    const steps = Math.max(1, Math.ceil((long * (1 - r / rows)) / spacing))
    for (let i = 0; i <= steps; i++) visit(point.lerpVectors(from, to, i / steps).divide(stretch))
  }
}

/**
 * Solid voxel grid from ray parity along all three axes, with a majority vote so
 * open bits (flat leaves, stems) don't flood a whole row, plus every cell the surface
 * crosses. Samples are points spread evenly over the surface.
 */
function voxelize(geometry: BufferGeometry): Pick<Solid, 'inside' | 'samples'> {
  geometry.computeBoundingBox()
  const box = geometry.boundingBox
  if (!box) return { inside: () => false, samples: new Float32Array() }
  const min = box.min.toArray()
  const size = box.getSize(new Vector3()).toArray().map((s) => Math.max(s, 1e-6))
  const pos = geometry.attributes.position
  const index = geometry.index
  const triCount = index ? index.count / 3 : pos.count / 3
  const tris = new Float32Array(triCount * 9)
  for (let t = 0; t < triCount; t++) {
    for (let k = 0; k < 3; k++) {
      const v = index ? index.getX(t * 3 + k) : t * 3 + k
      tris[t * 9 + k * 3] = pos.getX(v)
      tris[t * 9 + k * 3 + 1] = pos.getY(v)
      tris[t * 9 + k * 3 + 2] = pos.getZ(v)
    }
  }

  const N = VOXELS
  const votes = new Uint8Array(N * N * N)
  const cell = [0, 0, 0]
  const hits: number[] = []
  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3
    const w = (axis + 2) % 3
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const pu = min[u] + ((i + 0.5) * size[u]) / N
        const pw = min[w] + ((j + 0.5) * size[w]) / N
        hits.length = 0
        for (let t = 0; t < tris.length; t += 9) {
          const au = tris[t + u], aw = tris[t + w]
          const bu = tris[t + 3 + u], bw = tris[t + 3 + w]
          const cu = tris[t + 6 + u], cw = tris[t + 6 + w]
          const d = (bw - cw) * (au - cu) + (cu - bu) * (aw - cw)
          if (Math.abs(d) < 1e-12) continue
          const l0 = ((bw - cw) * (pu - cu) + (cu - bu) * (pw - cw)) / d
          const l1 = ((cw - aw) * (pu - cu) + (au - cu) * (pw - cw)) / d
          const l2 = 1 - l0 - l1
          if (l0 < 0 || l1 < 0 || l2 < 0) continue
          hits.push(l0 * tris[t + axis] + l1 * tris[t + 3 + axis] + l2 * tris[t + 6 + axis])
        }
        hits.sort((a, b) => a - b)
        // a ray through a shared edge hits both triangles; count it once
        const unique = hits.filter((h, k) => k === 0 || h - hits[k - 1] > 1e-5)
        for (let k = 0; k + 1 < unique.length; k += 2) {
          const from = Math.max(0, Math.ceil(((unique[k] - min[axis]) / size[axis]) * N - 0.5))
          const to = Math.min(N - 1, Math.floor(((unique[k + 1] - min[axis]) / size[axis]) * N - 0.5))
          cell[u] = i
          cell[w] = j
          for (let c = from; c <= to; c++) {
            cell[axis] = c
            votes[cell[0] + N * (cell[1] + N * cell[2])]++
          }
        }
      }
    }
  }

  // every cell the surface passes through is solid too: flat open meshes (bacon, cutlery)
  // have no parity volume, and cell centers alone would let touching parts sink in
  const cellOf = (v: number, axis: number) => Math.min(N - 1, Math.max(0, Math.floor(((v - min[axis]) / size[axis]) * N)))
  const toCells = size.map((s) => N / s)
  for (let t = 0; t < tris.length; t += 9) {
    surfacePoints(tris, t, 0.5, toCells, (p) => {
      votes[cellOf(p.x, 0) + N * (cellOf(p.y, 1) + N * cellOf(p.z, 2))] = 3
    })
  }

  const inside: InsideFn = (p) => {
    const x = Math.floor(((p.x - min[0]) / size[0]) * N)
    const y = Math.floor(((p.y - min[1]) / size[1]) * N)
    const z = Math.floor(((p.z - min[2]) / size[2]) * N)
    if (x < 0 || y < 0 || z < 0 || x >= N || y >= N || z >= N) return false
    return votes[x + N * (y + N * z)] >= 2
  }

  const samples: number[] = []
  for (let t = 0; t < tris.length; t += 9) {
    surfacePoints(tris, t, SAMPLE_SPACING, [1, 1, 1], (p) => samples.push(p.x, p.y, p.z))
  }
  return { inside, samples: new Float32Array(samples) }
}

let medianRadius = 0

function sizeOf(kind: string): number {
  if (!medianRadius) {
    const sorted = [...nativeRadii.values()].sort((a, b) => a - b)
    medianRadius = sorted[Math.floor(sorted.length / 2)]
  }
  return Math.min(SIZE_MAX, Math.max(SIZE_MIN, (nativeRadii.get(kind) ?? medianRadius) / medianRadius))
}

/** A fresh copy of a loaded model; the caller owns (and disposes) the geometry. */
export function buildObject(kind: string): Solid {
  const source = geometries.get(kind)
  if (!source) throw new Error(`model not loaded: ${kind}`)
  let voxel = voxels.get(kind)
  if (!voxel) {
    voxel = voxelize(source)
    voxels.set(kind, voxel)
  }
  const box = source.boundingBox?.clone() ?? new Box3()
  return {
    geometry: source.clone(),
    ...voxel,
    scale: sizeOf(kind),
    box,
    role: roleOf(kind, box),
    host: HOSTS.has(kind),
  }
}

/** Anything lying down that is much longer than it is wide or tall leans, like a rolling pin. */
function roleOf(kind: string, box: Box3): Role {
  if (BASES.has(kind)) return 'base'
  if (POKERS.has(kind)) return 'poke'
  const size = box.getSize(new Vector3())
  const long = Math.max(size.x, size.z)
  return long > 2.5 * Math.max(size.y, Math.min(size.x, size.z)) ? 'lean' : 'stack'
}

/** By kind alone, for picking a scene's objects before building them. */
export function isBase(kind: string): boolean {
  return BASES.has(kind)
}
