import type { BufferGeometry, CanvasTexture, Quaternion } from 'three'
import { DEGENERATE_IOU, SCORE_RES, TARGET_RES } from './constants'
import { puzzleNumber } from './daily'
import { generateShape } from './generateShape'
import { hashString, randomQuaternion, rngFor } from './rng'
import { coverage, iou, maskTexture, type Mask, type Silhouetter } from './silhouette'

export interface Level {
  seed: string
  geometry: BufferGeometry
  solution: Quaternion
  start: Quaternion
  target: Mask
  targetTexture: CanvasTexture
}

const PROBES = 24
const MAX_ATTEMPTS = 20

/**
 * Deterministic for a seed: rejects shapes whose silhouette is too easy to hit by chance
 * (round/symmetric blobs) or too small/large to read.
 */
export function buildLevel(seed: string, sil: Silhouetter): Level {
  for (let attempt = 0; ; attempt++) {
    const rng = rngFor(`${seed}#${attempt}`)
    const geometry = generateShape(rng)
    const solution = randomQuaternion(rng)
    const target = sil.render(geometry, solution, SCORE_RES)

    const probeRng = rngFor(`${seed}#${attempt}#probe`)
    let best = 0
    for (let i = 0; i < PROBES; i++) {
      best = Math.max(best, iou(sil.render(geometry, randomQuaternion(probeRng), SCORE_RES), target))
    }
    const fill = coverage(target)
    const last = attempt === MAX_ATTEMPTS - 1

    if (last || (best < DEGENERATE_IOU && fill > 0.12 && fill < 0.5)) {
      const startRng = rngFor(`${seed}#${attempt}#start`)
      const starts = Array.from({ length: 8 }, () => {
        const q = randomQuaternion(startRng)
        return { q, score: iou(sil.render(geometry, q, SCORE_RES), target) }
      })
      const start = starts.reduce((a, b) => (b.score < a.score ? b : a)).q
      const label = seed.startsWith('daily-') ? `FIG. ${puzzleNumber()}` : `FIG. ${100 + (hashString(seed) % 900)}`
      const targetTexture = maskTexture(sil.render(geometry, solution, TARGET_RES), TARGET_RES, label)
      return { seed, geometry, solution, start, target, targetTexture }
    }
    geometry.dispose()
  }
}
