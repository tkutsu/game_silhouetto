import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { MeshBasicMaterial } from 'three'
import { FRAME } from '../lib/constants'
import { DIALS } from '../lib/dials'
import { buildLevel, progressOf, type View } from '../lib/level'
import { loadObjects } from '../lib/objects'
import { Silhouetter } from '../lib/silhouette'
import { dials, useGame } from '../state/store'
import { Shape } from './Shape'

/** Lifted off its blueprint in this order: grid, outline, shadow over both. */
const OUTLINE_Z = 0.001
const SHADOW_Z = 0.002

/**
 * One lit projection on its blueprint: the outline to fill, and the shadow the piece casts
 * along that axis. The outline is also that axis's own progress meter — cold faint blue far
 * away, brightening toward gold as its shadow closes in, pulsing when it nearly fits.
 */
function Projection({ view, index, sil }: { view: View; index: number; sil: Silhouetter }) {
  const outline = useRef<MeshBasicMaterial>(null)
  const { center, frame } = DIALS[view.axis]

  useFrame(({ clock }) => {
    const m = outline.current
    if (!m) return
    const game = useGame.getState()
    if (game.solved) {
      m.color.set('#f5c451')
      m.opacity = 0.75 + Math.sin(clock.elapsedTime * 3) * 0.25
    } else {
      const n = progressOf(game.matches[index] ?? 0, view)
      m.color.setHSL((210 - 165 * n) / 360, 0.8, 0.72 + 0.22 * n)
      m.opacity = 0.8 + 0.2 * n + (n > 0.85 ? Math.sin(clock.elapsedTime * 7) * 0.12 : 0)
    }
  })

  return (
    <group position={center} quaternion={frame}>
      <mesh position={[0, 0, OUTLINE_Z]}>
        <planeGeometry args={[FRAME * 2, FRAME * 2]} />
        <meshBasicMaterial
          ref={outline}
          map={view.texture}
          color="#e3f1ff"
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {/* the silhouette render is white on black, so it serves as the shadow's alpha */}
      <mesh position={[0, 0, SHADOW_Z]}>
        <planeGeometry args={[FRAME * 2, FRAME * 2]} />
        <meshBasicMaterial
          color="#010611"
          alphaMap={sil.shadow(view.axis).texture}
          transparent
          opacity={0.6}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

export function LevelView() {
  const gl = useThree((s) => s.gl)
  const seed = useGame((s) => s.seed)
  const level = useGame((s) => s.level)
  const sil = useMemo(() => new Silhouetter(gl), [gl])

  useEffect(() => () => sil.dispose(), [sil])
  useEffect(() => {
    let live = true
    loadObjects().then(() => {
      if (!live) return
      const level = buildLevel(seed, sil)
      for (const view of level.views) view.texture.anisotropy = gl.capabilities.getMaxAnisotropy()
      useGame.getState().setLevel(level)
      for (const spring of dials.springs) Object.assign(spring, { target: 0, angle: 0, vel: 0 })
    })
    return () => {
      live = false
    }
  }, [seed, sil, gl])

  if (!level) return null
  return (
    <>
      <Shape key={level.seed} level={level} sil={sil} />
      {level.views.map((view, i) => (
        <Projection key={view.axis} view={view} index={i} sil={sil} />
      ))}
    </>
  )
}
