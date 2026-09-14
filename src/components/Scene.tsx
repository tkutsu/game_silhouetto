import { Canvas, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import type { PerspectiveCamera } from 'three'
import { FRAME, LIGHT_Z } from '../lib/constants'
import { LevelView } from './LevelView'
import { Wall } from './Wall'

const S = FRAME * 1.2
const FOV = 42
const MIN_ASPECT = 0.85

/** Keeps the horizontal view wide enough on portrait screens. */
function CameraRig() {
  const get = useThree((s) => s.get)
  const aspect = useThree((s) => s.size.width / s.size.height)

  useEffect(() => {
    const camera = get().camera as PerspectiveCamera
    const halfTan = Math.tan((FOV * Math.PI) / 360) * Math.max(1, MIN_ASPECT / aspect)
    camera.fov = (Math.atan(halfTan) * 360) / Math.PI
    camera.lookAt(-0.2, 0, -1.7)
    camera.updateProjectionMatrix()
  }, [get, aspect])

  return null
}

export function Scene() {
  return (
    <Canvas shadows="percentage" className="touch-none" camera={{ position: [5.2, 1.6, 6.4], fov: FOV }}>
      <CameraRig />
      <color attach="background" args={['#081120']} />
      <ambientLight intensity={0.22} />
      <directionalLight
        position={[0, 0, LIGHT_Z]}
        intensity={2.7}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
      >
        <orthographicCamera attach="shadow-camera" args={[-S, S, S, -S, 0.1, LIGHT_Z * 2]} />
      </directionalLight>
      <directionalLight position={[4, 5, 2]} intensity={0.55} color="#cfe0ff" />
      <directionalLight position={[-5, 4, -3]} intensity={1.1} color="#a8c8ff" />
      <Wall />
      <LevelView />
    </Canvas>
  )
}
