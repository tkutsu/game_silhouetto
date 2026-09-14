import type { BufferGeometry } from 'three'
import type { PartStyle } from './materials'
import { rngFor } from './rng'

export interface HairTuft {
  positions: Float32Array
  color: string
}

/**
 * Line-segment fur for parts whose style grows hair: short strands from the
 * part's surface along its normals, with a little droop and jitter. Only the
 * display mesh gets these — the silhouette/scoring passes render the bare
 * geometry, so fur never changes the target or the match score.
 */
export function buildHair(geometry: BufferGeometry, styles: PartStyle[], seed: string): HairTuft[] {
  const index = geometry.index
  const pos = geometry.attributes.position
  const nor = geometry.attributes.normal
  if (!index || !pos || !nor) return []

  const rng = rngFor(`${seed}#hair`)
  const tufts: HairTuft[] = []

  geometry.groups.forEach((group, i) => {
    const color = styles[i]?.hair
    if (!color) return
    const strands = Math.min(600, Math.floor(group.count / 4))
    const out = new Float32Array(strands * 6)
    for (let k = 0; k < strands; k++) {
      const vi = index.getX(group.start + Math.floor(rng() * group.count))
      const px = pos.getX(vi)
      const py = pos.getY(vi)
      const pz = pos.getZ(vi)
      const len = 0.05 + rng() * 0.08
      out[k * 6] = px
      out[k * 6 + 1] = py
      out[k * 6 + 2] = pz
      out[k * 6 + 3] = px + nor.getX(vi) * len + (rng() - 0.5) * 0.03
      out[k * 6 + 4] = py + nor.getY(vi) * len - len * 0.35
      out[k * 6 + 5] = pz + nor.getZ(vi) * len + (rng() - 0.5) * 0.03
    }
    tufts.push({ positions: out, color })
  })
  return tufts
}
