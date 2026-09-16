/** Half-size of the orthographic frame shared by the shadow camera, target overlay and scoring. */
export const FRAME = 1.6
export const SHAPE_RADIUS = 1.3
export const WALL_Z = -3.5
/** The floor and side-wall blueprints, meeting the back wall in a corner behind the piece. */
export const FLOOR_Y = -2.1
export const SIDE_X = -2.3
export const LIGHT_Z = 10

export const SCORE_RES = 128
export const TARGET_RES = 1024

/** The strictest a level's win threshold ever gets: a fit this good always counts. */
export const WIN_IOU = 0.9
/**
 * The most generous it ever gets, and the bar a shape has to clear to be used: no
 * orientation found by chance may score this well, so no level can be won on one.
 */
export const DEGENERATE_IOU = 0.8

/** Fixed camera pose, looking into the corner of the three blueprints. */
export const CAM_POS = [5.8, 3.6, 7.6] as const
export const CAM_TARGET = [-0.6, -0.8, -1.2] as const

/** Rotation increment in radians; every move snaps to this grid. */
export const STEP = Math.PI / 12
/** Underdamped spring for landings: a small overshoot, then settle. */
export const SPRING_K = 420
export const SPRING_DAMP = 21
