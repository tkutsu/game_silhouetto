import { Quaternion } from 'three'
import { STEP } from './constants'
import { AXES, type Move } from './level'

/** Each half of the meet-in-the-middle search looks this many steps out, so paths up to twice this are found. */
const DEPTH = 6
/** Candidates this close to the solution get checked with the real match test. */
const MAX_ANGLE = (6 * Math.PI) / 180
const MAX_CHECKS = 120
/** Candidates longer than the shortest one found by more than this aren't worth keeping. */
const SLACK = 4

// move index: axis * 2 + (dir > 0 ? 1 : 0), so `m ^ 1` is its inverse
const MOVES = AXES.flatMap((axis) => [-1, 1].map((dir) => ({ axis, dir })))
const TURNS = MOVES.map(({ axis, dir }) => new Quaternion().setFromAxisAngle(axis, dir * STEP))

/** Every sequence of up to DEPTH steps that never undoes its previous step, as a parent-pointer tree. */
interface Tree {
  size: number
  parent: Int32Array
  move: Int8Array
  depth: Int8Array
  /** Net rotation of the path from the root, 4 components per node. */
  quat: Float64Array
}

let cached: Tree | null = null

function tree(): Tree {
  if (cached) return cached
  let size = 1
  for (let d = 1, n = 6; d <= DEPTH; d++, n *= 5) size += n
  const t: Tree = {
    size,
    parent: new Int32Array(size),
    move: new Int8Array(size),
    depth: new Int8Array(size),
    quat: new Float64Array(size * 4),
  }
  const q = new Quaternion()
  t.quat[3] = 1
  t.move[0] = -1
  let next = 1
  for (let i = 0; i < size && next < size; i++) {
    if (t.depth[i] === DEPTH) continue
    for (let m = 0; m < MOVES.length; m++) {
      if (i > 0 && m === (t.move[i] ^ 1)) continue
      q.fromArray(t.quat, i * 4).premultiply(TURNS[m]).toArray(t.quat, next * 4)
      t.parent[next] = i
      t.move[next] = m
      t.depth[next] = t.depth[i] + 1
      next++
    }
  }
  return (cached = t)
}

/** Root-to-node moves of a tree path. */
function pathTo(t: Tree, i: number): Move[] {
  const moves: Move[] = []
  for (; i > 0; i = t.parent[i]) moves.push(MOVES[t.move[i]])
  return moves.reverse()
}

/**
 * Shortest step sequence from `start` that lands near `solution` and passes `wins`.
 * Walks out DEPTH steps from both ends and joins paths whose orientations meet.
 */
export function searchMoves(start: Quaternion, solution: Quaternion, wins: (q: Quaternion) => boolean): Move[] | null {
  const t = tree()
  const q = new Quaternion()
  const fwd = new Float64Array(t.size * 4)
  const back = new Float64Array(t.size * 4)
  for (let i = 0; i < t.size; i++) {
    q.fromArray(t.quat, i * 4).multiply(start).toArray(fwd, i * 4)
    q.fromArray(t.quat, i * 4).multiply(solution).toArray(back, i * 4)
  }

  // hash backward orientations by x,y,z (w >= 0 picks one of q / -q); a cell spans the match distance
  const cell = 2 * Math.sin(MAX_ANGLE / 4)
  const span = Math.ceil(1 / cell) + 2
  const key = (x: number, y: number, z: number) => (x * span + y) * span + z
  const grid = new Map<number, number[]>()
  const add = (sign: number, i: number) => {
    const k = key(
      Math.floor((sign * back[i * 4]) / cell),
      Math.floor((sign * back[i * 4 + 1]) / cell),
      Math.floor((sign * back[i * 4 + 2]) / cell),
    )
    const list = grid.get(k)
    if (list) list.push(i)
    else grid.set(k, [i])
  }
  for (let i = 0; i < t.size; i++) {
    const w = back[i * 4 + 3]
    add(w < 0 ? -1 : 1, i)
    if (Math.abs(w) < cell) add(w < 0 ? 1 : -1, i)
  }

  const minDot = Math.cos(MAX_ANGLE / 2)
  const byLength: { i: number; j: number; dot: number }[][] = Array.from({ length: DEPTH * 2 + 1 }, () => [])
  let shortest = Infinity
  for (let i = 0; i < t.size; i++) {
    const o = i * 4
    const sign = fwd[o + 3] < 0 ? -1 : 1
    const cx = Math.floor((sign * fwd[o]) / cell)
    const cy = Math.floor((sign * fwd[o + 1]) / cell)
    const cz = Math.floor((sign * fwd[o + 2]) / cell)
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          for (const j of grid.get(key(cx + dx, cy + dy, cz + dz)) ?? []) {
            const len = t.depth[i] + t.depth[j]
            // the same move ending i and j cancels at the join, so a shorter pair covers it
            if (len > shortest + SLACK || (i > 0 && t.move[i] === t.move[j])) continue
            const b = j * 4
            const dot = Math.abs(
              fwd[o] * back[b] + fwd[o + 1] * back[b + 1] + fwd[o + 2] * back[b + 2] + fwd[o + 3] * back[b + 3],
            )
            if (dot < minDot) continue
            byLength[len].push({ i, j, dot })
            shortest = Math.min(shortest, len)
          }
        }
  }

  const found = byLength.flatMap((list) => list.sort((a, b) => b.dot - a.dot))
  const end = new Quaternion()
  for (const { i, j } of found.slice(0, MAX_CHECKS)) {
    // forward path i, then backward path j run in reverse with each step inverted
    end.fromArray(t.quat, j * 4).invert().multiply(q.fromArray(fwd, i * 4))
    if (!wins(end)) continue
    const tail = pathTo(t, j).reverse().map(({ axis, dir }) => ({ axis, dir: -dir }))
    return [...pathTo(t, i), ...tail]
  }
  return null
}
