export const TILE = 1;
export const CHUNK_SIZE = 16;
export const HEIGHT_UNIT = 0.46;
export const PLAYER_RADIUS = 0.28;
export const MOVE_SPEED = 5.15;
export const WATER_SPEED = 3.55;
export const JUMP_SPEED = 7.45;
export const GRAVITY = 21;
export const WALK_STEP = 1;
export const WALK_DOWN = 2;
export const JUMP_CLIMB = 3;
export const COYOTE_TIME = 0.11;
export const JUMP_BUFFER = 0.14;
export const FIXED_DT = 1 / 60;
export const CAM_ROT_SPEED = 0.82;
export const ISO_RIGHT = { x: Math.SQRT1_2, z: -Math.SQRT1_2 };
export const ISO_UP = { x: -Math.SQRT1_2, z: -Math.SQRT1_2 };

export const PLAYER_MAX_HP = 10;
export const PLAYER_IFRAME = 0.85;
export const STOMP_BOUNCE = 5.35;
export const HARE_FLEE_R = 6.6;
export const WOLF_AGGRO_R = 11.5;

export const BIOME_TOP = ["#cbb892", "#6e8f5c", "#4f7a58", "#8a8478", "#4a8ea0"] as const;
export const BIOME_SIDE = ["#8d7a5c", "#5a4a38", "#3f4f40", "#5c5852", "#2c5c6c"] as const;
