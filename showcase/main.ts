import {
  ACESFilmicToneMapping,
  Box3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Sphere,
  WebGLRenderer,
  type Object3D,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { OBJECT_KINDS } from '../src/lib/objects'
import './showcase.css'

interface Model {
  kit: string
  name: string
  file: string
}

interface View {
  el: HTMLElement
  scene: Scene
  pivot: Group
  yaw: number
  pitch: number
  dragging: boolean
  load?: () => Promise<void>
}

const PICKS_KEY = 'silhouetto-showcase-picks-v2'
const PANEL = new Color('#0f1b2e')
const WALL = new Color('#dbe4f0')
const SHADOW = new MeshBasicMaterial({ color: '#0b1220' })
const IN_GAME = new Set(OBJECT_KINDS)

const canvas = document.querySelector<HTMLCanvasElement>('#gl')!
const renderer = new WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.toneMapping = ACESFilmicToneMapping
const environment = new PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
const camera = new PerspectiveCamera(32, 1, 0.1, 20)
camera.position.set(0, 0.35, 3.6)
camera.lookAt(0, 0, 0)
const loader = new GLTFLoader()

const views: View[] = []
let shadowView = false

/** Same lights as the game scene. */
function makeScene(): { scene: Scene; pivot: Group } {
  const scene = new Scene()
  scene.environment = environment
  scene.environmentIntensity = 0.5
  scene.add(new HemisphereLight('#dce9ff', '#3b2c20', 1.1))
  const key = new DirectionalLight('#fff0db', 2.4)
  key.position.set(-4, 6, 5)
  const rim = new DirectionalLight('#9cc4ff', 2.2)
  rim.position.set(3, 2.5, -6)
  const front = new DirectionalLight('#ffffff', 0.9)
  front.position.set(0, 0, 8)
  const pivot = new Group()
  scene.add(key, rim, front, pivot)
  return { scene, pivot }
}

/** Centers the object and scales it into a unit sphere. */
function fit(object: Object3D): Group {
  const sphere = new Box3().setFromObject(object).getBoundingSphere(new Sphere())
  object.position.sub(sphere.center)
  const wrap = new Group()
  wrap.add(object)
  wrap.scale.setScalar(1 / sphere.radius)
  return wrap
}

function triangles(object: Object3D): number {
  let n = 0
  object.traverse((o) => {
    if (o instanceof Mesh) n += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3
  })
  return n
}

function addView(el: HTMLElement, url: string, onLoad: (object: Object3D) => void) {
  const { scene, pivot } = makeScene()
  const view: View = { el, scene, pivot, yaw: Math.random() * Math.PI * 2, pitch: 0.15, dragging: false }
  view.load = async () => {
    view.load = undefined
    const object = (await loader.loadAsync(url)).scene
    pivot.add(fit(object))
    onLoad(object)
  }

  let last = { x: 0, y: 0 }
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId)
    view.dragging = true
    last = { x: e.clientX, y: e.clientY }
  })
  el.addEventListener('pointermove', (e) => {
    if (!view.dragging) return
    view.yaw += (e.clientX - last.x) * 0.012
    view.pitch = Math.max(-1.4, Math.min(1.4, view.pitch + (e.clientY - last.y) * 0.012))
    last = { x: e.clientX, y: e.clientY }
  })
  const release = () => (view.dragging = false)
  el.addEventListener('pointerup', release)
  el.addEventListener('pointercancel', release)
  views.push(view)
}

// ---------- picks ----------

const picks = new Set<string>(JSON.parse(localStorage.getItem(PICKS_KEY) ?? 'null') ?? OBJECT_KINDS)
const count = document.querySelector('#count')!
const savePicks = () => {
  localStorage.setItem(PICKS_KEY, JSON.stringify([...picks]))
  count.textContent = String(picks.size)
}

function toast(text: string) {
  const el = document.querySelector<HTMLElement>('#toast')!
  el.textContent = text
  el.style.opacity = '1'
  setTimeout(() => (el.style.opacity = '0'), 1800)
}

document.querySelector('#copy')!.addEventListener('click', async () => {
  const added = [...picks].filter((k) => !IN_GAME.has(k)).sort()
  const removed = OBJECT_KINDS.filter((k) => !picks.has(k))
  await navigator.clipboard.writeText(JSON.stringify({ add: added, remove: removed }, null, 2))
  toast(`Copied: ${added.length} to add, ${removed.length} to remove`)
})

document.querySelector<HTMLInputElement>('#shadow')!.addEventListener('change', (e) => {
  shadowView = (e.target as HTMLInputElement).checked
})

// ---------- cards ----------

function modelCard(model: Model, url: string): HTMLElement {
  const card = document.createElement('article')
  card.className = 'card overflow-hidden rounded-xl bg-slate-900/60 ring-1 ring-white/10'
  card.dataset.kit = model.kit
  card.dataset.game = String(IN_GAME.has(model.name))
  card.innerHTML = `
    <div class="aspect-square cursor-grab touch-none active:cursor-grabbing"></div>
    <div class="flex flex-col gap-1 p-3">
      <div class="flex items-center justify-between gap-2">
        <h3 class="truncate text-sm font-medium text-slate-100"></h3>
        <label class="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-slate-300">
          <input type="checkbox" class="accent-amber-400" /> Use
        </label>
      </div>
      <p class="meta truncate text-xs text-slate-400"></p>
    </div>`
  card.querySelector('h3')!.textContent = model.name.replace(/-/g, ' ')
  const meta = card.querySelector<HTMLElement>('.meta')!
  const kit = model.kit === 'food' ? 'Food' : 'Holiday'
  meta.textContent = `${kit}${IN_GAME.has(model.name) ? ' · in game' : ''}`

  const box = card.querySelector<HTMLInputElement>('input')!
  const sync = () => card.classList.toggle('picked', picks.has(model.name))
  box.checked = picks.has(model.name)
  sync()
  box.addEventListener('change', () => {
    if (box.checked) picks.add(model.name)
    else picks.delete(model.name)
    sync()
    savePicks()
  })

  addView(card.querySelector<HTMLElement>('.aspect-square')!, url, (object) => {
    meta.textContent += ` · ${Math.round(triangles(object))} tris`
  })
  return card
}

// ---------- filters ----------

const FILTERS: [string, (card: HTMLElement) => boolean][] = [
  ['All', () => true],
  ['Picked', (c) => c.classList.contains('picked')],
  ['In game', (c) => c.dataset.game === 'true'],
  ['Food', (c) => c.dataset.kit === 'food'],
  ['Holiday', (c) => c.dataset.kit === 'holiday'],
]

function setupFilters(grid: HTMLElement) {
  const nav = document.querySelector('#filters')!
  const buttons = FILTERS.map(([label, test]) => {
    const b = document.createElement('button')
    b.textContent = label
    b.className = 'rounded-lg px-2.5 py-1 text-slate-300 hover:bg-white/10'
    b.addEventListener('click', () => {
      buttons.forEach((x) => x.classList.remove('bg-white/15', 'text-white'))
      b.classList.add('bg-white/15', 'text-white')
      for (const card of grid.children) (card as HTMLElement).hidden = !test(card as HTMLElement)
    })
    nav.append(b)
    return b
  })
  buttons[0].click()
}

// ---------- render ----------

function frame() {
  renderer.setScissorTest(false)
  renderer.setClearColor(0x000000, 0)
  renderer.clear()
  renderer.setScissorTest(true)

  for (const view of views) {
    const r = view.el.getBoundingClientRect()
    if (r.width === 0 || r.bottom < -innerHeight || r.top > innerHeight * 2) continue
    view.load?.()
    if (r.bottom < 0 || r.top > innerHeight) continue

    if (!view.dragging) view.yaw += 0.006
    view.pivot.rotation.set(view.pitch, view.yaw, 0, 'XYZ')
    view.scene.overrideMaterial = shadowView ? SHADOW : null

    const y = innerHeight - r.bottom
    renderer.setViewport(r.left, y, r.width, r.height)
    renderer.setScissor(r.left, y, r.width, r.height)
    renderer.setClearColor(shadowView ? WALL : PANEL, 1)
    renderer.clear()
    camera.aspect = r.width / r.height
    camera.updateProjectionMatrix()
    renderer.render(view.scene, camera)
  }
  requestAnimationFrame(frame)
}

async function main() {
  const grid = document.querySelector<HTMLElement>('#models')!
  const res = await fetch('/showcase/models/manifest.json')
  const candidates: Model[] = res.ok ? await res.json() : []
  const cards = candidates.map((m) => modelCard(m, `/showcase/models/${m.file}`))
  grid.append(...cards.sort((a, b) => Number(b.dataset.game === 'true') - Number(a.dataset.game === 'true')))
  if (!res.ok) {
    grid.insertAdjacentHTML(
      'beforeend',
      '<p class="col-span-full text-sm text-amber-300">No models yet. Run <code>python3 showcase/fetch-models.py</code> and reload.</p>',
    )
  }
  setupFilters(grid)
  savePicks()
  const resize = () => renderer.setSize(innerWidth, innerHeight, false)
  resize()
  addEventListener('resize', resize)
  requestAnimationFrame(frame)
}

main()
