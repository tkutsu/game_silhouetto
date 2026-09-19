import { Vector3 } from 'three'

/** Half-size of the orthographic frame shared by the shadow camera, target overlay and scoring. */
export const FRAME = 1.6
export const SHAPE_RADIUS = 1.3
export const WALL_Z = -3.5
/** The floor and side-wall blueprints, meeting the back wall in a corner behind the piece. */
export const FLOOR_Y = -2.1
export const SIDE_X = -2.3
export const LIGHT_Z = 10

/**
 * Pitch, yaw and roll: the normals of the side wall, floor and back wall blueprints, and
 * the three directions a shadow is cast along. Every mask, outline and dial is indexed by them.
 */
export const AXES = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)]
/** The back wall, where the shadow falls at every difficulty. */
export const BACK = 2

export const SCORE_RES = 128
export const TARGET_RES = 1024
/** Resolution of the cast shadows; they sit right beside the outline, so they have to be as crisp. */
export const SHADOW_RES = 1024

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
/** Portrait pose: more frontal and higher, so wall, piece and floor dial stack vertically. */
export const CAM_POS_PORTRAIT = [4.4, 4.4, 8.2] as const
export const CAM_TARGET_PORTRAIT = [-0.6, 0, -1.2] as const

/** Rotation increment in radians; every move snaps to this grid. */
export const STEP = Math.PI / 12
/** Underdamped spring for landings: a small overshoot, then settle. */
export const SPRING_K = 420
export const SPRING_DAMP = 21
