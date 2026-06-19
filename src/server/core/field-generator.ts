import { LOGICAL_FIELD_HEIGHT, LOGICAL_FIELD_WIDTH, type FieldLayout } from '../../shared/field-layout';

type TemplateDef = {
  bounds: { x: number; y: number; w: number; h: number };
  obstacles: Array<{ x: number; y: number; w: number; h: number }>;
  hazards: Array<{ x: number; y: number; r: number }>;
  sink: { x: number; y: number; r: number };
  spawnBand: { x: number; y: number; w: number; h: number };
};

const TEMPLATES: TemplateDef[] = [
  {
    bounds: { x: 24, y: 24, w: LOGICAL_FIELD_WIDTH - 48, h: LOGICAL_FIELD_HEIGHT - 48 },
    obstacles: [
      { x: 120, y: 180, w: 40, h: 200 },
      { x: 360, y: 100, w: 40, h: 160 },
      { x: 600, y: 220, w: 40, h: 180 },
    ],
    hazards: [{ x: 400, y: 300, r: 35 }],
    sink: { x: 400, y: 480, r: 45 },
    spawnBand: { x: 0, y: 0, w: LOGICAL_FIELD_WIDTH, h: 80 },
  },
  {
    bounds: { x: 24, y: 24, w: LOGICAL_FIELD_WIDTH - 48, h: LOGICAL_FIELD_HEIGHT - 48 },
    obstacles: [
      { x: 80, y: 140, w: 180, h: 40 },
      { x: 420, y: 200, w: 200, h: 40 },
      { x: 200, y: 380, w: 160, h: 40 },
    ],
    hazards: [{ x: 300, y: 280, r: 30 }, { x: 550, y: 380, r: 30 }],
    sink: { x: 280, y: 500, r: 40 },
    spawnBand: { x: 0, y: 0, w: LOGICAL_FIELD_WIDTH, h: 80 },
  },
  {
    bounds: { x: 24, y: 24, w: LOGICAL_FIELD_WIDTH - 48, h: LOGICAL_FIELD_HEIGHT - 48 },
    obstacles: [
      { x: 100, y: 200, w: 40, h: 120 },
      { x: 300, y: 160, w: 40, h: 120 },
      { x: 500, y: 200, w: 40, h: 120 },
      { x: 200, y: 400, w: 400, h: 40 },
    ],
    hazards: [],
    sink: { x: 520, y: 490, r: 42 },
    spawnBand: { x: 0, y: 0, w: LOGICAL_FIELD_WIDTH, h: 80 },
  },
  {
    bounds: { x: 24, y: 24, w: LOGICAL_FIELD_WIDTH - 48, h: LOGICAL_FIELD_HEIGHT - 48 },
    obstacles: [
      { x: 160, y: 120, w: 480, h: 30 },
      { x: 160, y: 350, w: 480, h: 30 },
    ],
    hazards: [{ x: 400, y: 240, r: 40 }],
    sink: { x: 200, y: 480, r: 45 },
    spawnBand: { x: 0, y: 0, w: LOGICAL_FIELD_WIDTH, h: 80 },
  },
  {
    bounds: { x: 24, y: 24, w: LOGICAL_FIELD_WIDTH - 48, h: LOGICAL_FIELD_HEIGHT - 48 },
    obstacles: [
      { x: 60, y: 160, w: 120, h: 40 },
      { x: 380, y: 120, w: 120, h: 40 },
      { x: 200, y: 280, w: 40, h: 160 },
      { x: 520, y: 280, w: 40, h: 160 },
    ],
    hazards: [{ x: 140, y: 400, r: 32 }, { x: 620, y: 400, r: 32 }],
    sink: { x: 400, y: 510, r: 48 },
    spawnBand: { x: 0, y: 0, w: LOGICAL_FIELD_WIDTH, h: 80 },
  },
  {
    bounds: { x: 24, y: 24, w: LOGICAL_FIELD_WIDTH - 48, h: LOGICAL_FIELD_HEIGHT - 48 },
    obstacles: [
      { x: 100, y: 100, w: 40, h: 240 },
      { x: 660, y: 100, w: 40, h: 240 },
      { x: 280, y: 420, w: 240, h: 40 },
    ],
    hazards: [{ x: 400, y: 200, r: 38 }],
    sink: { x: 400, y: 480, r: 44 },
    spawnBand: { x: 0, y: 0, w: LOGICAL_FIELD_WIDTH, h: 80 },
  },
];

const mulberry32 = (seed: number) => {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const hashString = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
};

export const generateDailyField = (postId: string, utcDayStart: number): FieldLayout => {
  const seedValue = hashString(`${postId}:${utcDayStart}`);
  const rng = mulberry32(seedValue);
  const templateId = Math.floor(rng() * TEMPLATES.length);
  const template = TEMPLATES[templateId]!;

  const jitter = (base: number, max: number) => {
    const offset = (rng() - 0.5) * 2 * max;
    return Math.round(base + offset);
  };

  const obstacles = template.obstacles.map((obs) => ({
    x: jitter(obs.x, 8),
    y: jitter(obs.y, 8),
    w: obs.w,
    h: obs.h,
  }));

  const hazards = template.hazards.map((h) => ({
    x: jitter(h.x, 8),
    y: jitter(h.y, 8),
    r: h.r,
  }));

  return {
    dayKey: new Date(utcDayStart).toISOString().split('T')[0] ?? '',
    seed: seedValue,
    templateId,
    bounds: template.bounds,
    obstacles,
    hazards,
    sink: template.sink,
    spawnBand: template.spawnBand,
  };
};
