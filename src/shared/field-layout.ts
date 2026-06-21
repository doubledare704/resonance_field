export const LOGICAL_FIELD_WIDTH = 800;
export const LOGICAL_FIELD_HEIGHT = 600;

export const VIRTUAL_FIELD_WIDTH = LOGICAL_FIELD_WIDTH;
export const VIRTUAL_FIELD_HEIGHT = LOGICAL_FIELD_HEIGHT;

export const FIELD_SCALE = 1;

export const SCALE_X = FIELD_SCALE;
export const SCALE_Y = FIELD_SCALE;

export type FieldRect = { x: number; y: number; w: number; h: number };
export type FieldCircle = { x: number; y: number; r: number };

export type FieldLayout = {
  dayKey: string;
  seed: number;
  templateId: number;
  bounds: FieldRect;
  obstacles: FieldRect[];
  hazards: FieldCircle[];
  sink: FieldCircle;
  spawnBand: FieldRect;
};

export const logicalToCanonical = (lx: number, ly: number) => ({
  x: lx * FIELD_SCALE,
  y: ly * FIELD_SCALE,
});

export const canonicalToLogical = (cx: number, cy: number) => ({
  x: cx / FIELD_SCALE,
  y: cy / FIELD_SCALE,
});

export const pointInRect = (px: number, py: number, rect: FieldRect) =>
  px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;

export const pointInCircle = (px: number, py: number, circle: FieldCircle) => {
  const dx = px - circle.x;
  const dy = py - circle.y;
  return dx * dx + dy * dy <= circle.r * circle.r;
};

export const circleIntersectsRect = (circle: FieldCircle, rect: FieldRect) => {
  const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.h));
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy <= circle.r * circle.r;
};
