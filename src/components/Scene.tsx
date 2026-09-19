import { Canvas, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { NeutralToneMapping, Vector3, type PerspectiveCamera } from 'three'
import { CAM_POS, CAM_POS_PORTRAIT, CAM_TARGET, CAM_TARGET_PORTRAIT, LIGHT_Z } from '../lib/constants'
import { useGame } from '../state/store'
import { Blueprints } from './Blueprints'
import { LevelView } from './LevelView'

const FOV = 36
/** Aspect range over which the camera swings from the landscape pose to the portrait one. */
const LANDSCAPE_ASPECT = 1
const PORTRAIT_ASPECT = 0.62
/** Horizontal extent to preserve, in aspect terms; the portrait pose needs less width, so it shrinks less. */
const MIN_ASPECT = 1
const MIN_ASPECT_PORTRAIT = 0.78
/** A lit side wall reaches further left than the portrait pose keeps in frame, so the view widens for it. */
const MIN_ASPECT_PORTRAIT_WIDE = 1.02

const a = new Vector3()
const b = new Vector3()

/** Swings toward the stacked portrait pose as the screen narrows, widening the view only as much as the pose needs. */
function CameraRig() {
  const get = useThree((s) => s.get)
  const aspect = useThree((s) => s.size.width / s.size.height)
  const sideLit = useGame((s) => !!s.level?.views.some((v) => v.axis === 0))

  useEffect(() => {
    const camera = get().camera as PerspectiveCamera
    const t = Math.min(1, Math.max(0, (LANDSCAPE_ASPECT - aspect) / (LANDSCAPE_ASPECT - PORTRAIT_ASPECT)))
    const portrait = sideLit ? MIN_ASPECT_PORTRAIT_WIDE : MIN_ASPECT_PORTRAIT
    const minAspect = MIN_ASPECT + (portrait - MIN_ASPECT) * t
    const halfTan = Math.tan((FOV * Math.PI) / 360) * Math.max(1, minAspect / aspect)
    camera.fov = (Math.atan(halfTan) * 360) / Math.PI
    camera.position.copy(a.set(...CAM_POS).lerp(b.set(...CAM_POS_PORTRAIT), t))
    camera.lookAt(a.set(...CAM_TARGET).lerp(b.set(...CAM_TARGET_PORTRAIT), t))
    camera.updateProjectionMatrix()
  }, [get, aspect, sideLit])

  return null
}

export function Scene() {
  return (
    <Canvas
      className="touch-none"
      camera={{ position: [...CAM_POS], fov: FOV }}
      // ACES desaturates the palette; Neutral keeps the toy colors vivid
      onCreated={({ gl }) => {
        gl.toneMapping = NeutralToneMapping
      }}
    >
      <CameraRig />
      <color attach="background" args={['#081120']} />
      <hemisphereLight args={['#dce9ff', '#3b2c20', 1.1]} />
      {/* Stands in for the lamp behind the camera whose shadows the blueprints wear. */}
      <directionalLight position={[0, 0, LIGHT_Z]} intensity={0.9} />
      <directionalLight position={[-4, 6, 5]} intensity={2.4} color="#fff0db" />
      <directionalLight position={[3, 2.5, -6]} intensity={2.2} color="#9cc4ff" />
      <Blueprints />
      <LevelView />
    </Canvas>
  )
}
