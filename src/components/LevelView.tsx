import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { MeshBasicMaterial } from 'three'
import { FRAME, WALL_Z } from '../lib/constants'
import { buildLevel } from '../lib/level'
import { loadObjects } from '../lib/objects'
import { Silhouetter } from '../lib/silhouette'
import { dials, useGame } from '../state/store'
import { Shape } from './Shape'

export function LevelView() {
  const gl = useThree((s) => s.gl)
  const seed = useGame((s) => s.seed)
  const level = useGame((s) => s.level)
  const sil = useMemo(() => new Silhouetter(gl), [gl])
  const overlay = useRef<MeshBasicMaterial>(null)

  // The outline itself is the progress meter: cold faint blue far away,
  // brightening toward gold as the match rises, pulsing when close.
  useFrame(({ clock }) => {
    const m = overlay.current
    if (!m) return
    const game = useGame.getState()
    if (game.solved) {
      m.color.set('#f5c451')
      m.opacity = 0.75 + Math.sin(clock.elapsedTime * 3) * 0.25
    } else {
      const win = game.level?.winIou ?? 1
      const n = Math.min(Math.max((game.match - 0.35) / (win - 0.35), 0), 1)
      m.color.setHSL((210 - 165 * n) / 360, 0.8, 0.72 + 0.22 * n)
      m.opacity = 0.8 + 0.2 * n + (n > 0.85 ? Math.sin(clock.elapsedTime * 7) * 0.12 : 0)
    }
  })

  useEffect(() => () => sil.dispose(), [sil])
  useEffect(() => {
    let live = true
    loadObjects().then(() => {
      if (!live) return
      const level = buildLevel(seed, sil)
      level.targetTexture.anisotropy = gl.capabilities.getMaxAnisotropy()
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
      {/* Sits between the wall and its shadow layer, so the cast shadow darkens over the blueprint. */}
      <mesh position={[0, 0, WALL_Z + 0.001]}>
        <planeGeometry args={[FRAME * 2, FRAME * 2]} />
        <meshBasicMaterial
          ref={overlay}
          map={level.targetTexture}
          color="#e3f1ff"
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </>
  )
}
