import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { FRAME, WALL_Z } from '../lib/constants'
import { buildLevel } from '../lib/level'
import { Silhouetter } from '../lib/silhouette'
import { useGame } from '../state/store'
import { Shape } from './Shape'

export function LevelView() {
  const gl = useThree((s) => s.gl)
  const seed = useGame((s) => s.seed)
  const level = useGame((s) => s.level)
  const solved = useGame((s) => s.solved)
  const sil = useMemo(() => new Silhouetter(gl), [gl])

  useEffect(() => () => sil.dispose(), [sil])
  useEffect(() => {
    useGame.getState().setLevel(buildLevel(seed, sil))
  }, [seed, sil])

  if (!level) return null
  return (
    <>
      <Shape key={level.seed} level={level} sil={sil} />
      <mesh position={[0, 0, WALL_Z + 0.01]}>
        <planeGeometry args={[FRAME * 2, FRAME * 2]} />
        <meshBasicMaterial
          map={level.targetTexture}
          color={solved ? '#f5c451' : '#38bdf8'}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </>
  )
}
