import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { Mesh, MeshBasicMaterial } from 'three'
import { FRAME, SPRING_DAMP, SPRING_K, WALL_Z, WIN_IOU } from '../lib/constants'
import { buildLevel } from '../lib/level'
import { preloadTextures } from '../lib/materials'
import { dialTexture, Silhouetter } from '../lib/silhouette'
import { useGame } from '../state/store'
import { Shape } from './Shape'

export function LevelView() {
  const gl = useThree((s) => s.gl)
  const seed = useGame((s) => s.seed)
  const level = useGame((s) => s.level)
  const sil = useMemo(() => new Silhouetter(gl), [gl])
  const overlay = useRef<MeshBasicMaterial>(null)
  const dial = useRef<Mesh>(null)
  const dialMap = useMemo(() => dialTexture(), [])
  // 1-D version of the shape's landing spring, so the ring turns in unison with roll steps
  const spring = useRef({ angle: 0, vel: 0 }).current

  // The outline itself is the progress meter: cold faint blue far away,
  // brightening toward gold as the match rises, pulsing when close.
  useFrame(({ clock }, dt) => {
    const m = overlay.current
    if (!m) return
    const game = useGame.getState()
    if (game.solved) {
      m.color.set('#f5c451')
      m.opacity = 0.75 + Math.sin(clock.elapsedTime * 3) * 0.25
    } else {
      const n = Math.min(Math.max((game.match - 0.35) / (WIN_IOU - 0.35), 0), 1)
      m.color.setHSL((210 - 165 * n) / 360, 0.8, 0.72 + 0.22 * n)
      m.opacity = 0.8 + 0.2 * n + (n > 0.85 ? Math.sin(clock.elapsedTime * 7) * 0.12 : 0)
    }

    if (dial.current) {
      spring.vel += (game.roll - spring.angle) * SPRING_K * dt
      spring.vel *= Math.exp(-SPRING_DAMP * dt)
      spring.angle += spring.vel * dt
      dial.current.rotation.z = spring.angle
    }
  })

  useEffect(() => () => sil.dispose(), [sil])
  useEffect(() => () => dialMap.dispose(), [dialMap])
  useEffect(() => {
    // after the first puzzle's own textures have started, so they win the race
    const id = setTimeout(preloadTextures, 1500)
    return () => clearTimeout(id)
  }, [])
  useEffect(() => {
    const level = buildLevel(seed, sil)
    level.targetTexture.anisotropy = gl.capabilities.getMaxAnisotropy()
    useGame.getState().setLevel(level)
    spring.angle = 0
    spring.vel = 0
  }, [seed, sil, gl, spring])

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
      <mesh ref={dial} position={[0, 0, WALL_Z + 0.012]}>
        <planeGeometry args={[FRAME * 2, FRAME * 2]} />
        <meshBasicMaterial map={dialMap} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </>
  )
}
