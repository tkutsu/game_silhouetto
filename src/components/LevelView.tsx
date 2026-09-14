import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { MeshBasicMaterial } from 'three'
import { FRAME, WALL_Z } from '../lib/constants'
import { buildLevel } from '../lib/level'
import { Annotation } from './Annotation'
import { Silhouetter } from '../lib/silhouette'
import { useGame } from '../state/store'
import { Shape } from './Shape'

export function LevelView() {
  const gl = useThree((s) => s.gl)
  const seed = useGame((s) => s.seed)
  const level = useGame((s) => s.level)
  const solved = useGame((s) => s.solved)
  const didTumble = useGame((s) => s.didTumble)
  const didSpin = useGame((s) => s.didSpin)
  const sil = useMemo(() => new Silhouetter(gl), [gl])
  const overlay = useRef<MeshBasicMaterial>(null)

  useFrame(({ clock }) => {
    const m = overlay.current
    if (m) m.opacity = useGame.getState().solved ? 0.75 + Math.sin(clock.elapsedTime * 3) * 0.25 : 1
  })

  useEffect(() => () => sil.dispose(), [sil])
  useEffect(() => {
    const level = buildLevel(seed, sil)
    level.targetTexture.anisotropy = gl.capabilities.getMaxAnisotropy()
    useGame.getState().setLevel(level)
  }, [seed, sil, gl])

  if (!level) return null
  return (
    <>
      <Shape key={level.seed} level={level} sil={sil} />
      <mesh position={[0, 0, WALL_Z + 0.01]}>
        <planeGeometry args={[FRAME * 2, FRAME * 2]} />
        <meshBasicMaterial
          ref={overlay}
          map={level.targetTexture}
          color={solved ? '#f5c451' : '#e3f1ff'}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {!solved && !didTumble && (
        <Annotation position={[-3.6, 2.5]} arrow="down" lines={['DRAG THE SHAPE', 'TO TUMBLE IT']} />
      )}
      {!solved && !didSpin && (
        <Annotation position={[-0.3, -2.7]} arrow="up" lines={['DRAG SHADOW TO SPIN']} />
      )}
    </>
  )
}
