/** Half-size of the orthographic frame shared by the shadow camera, target overlay and scoring. */
export const FRAME = 1.6
export const SHAPE_RADIUS = 1.3
export const WALL_Z = -3.5
export const LIGHT_Z = 10

export const SCORE_RES = 128
export const TARGET_RES = 1024

export const WIN_IOU = 0.88
export const DEGENERATE_IOU = 0.75

/** Fixed camera pose; the pitch axis in level.ts is derived from it. */
export const CAM_POS = [5.2, 1.6, 6.4] as const
export const CAM_TARGET = [-0.2, 0, -1.7] as const

/** Rotation increment in radians; every move snaps to this grid. */
export const STEP = Math.PI / 12
/** Underdamped spring for landings: a small overshoot, then settle. */
export const SPRING_K = 420
export const SPRING_DAMP = 21
