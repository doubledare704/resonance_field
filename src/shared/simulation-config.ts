import { NodeType } from './contract';
import { VIRTUAL_FIELD_WIDTH } from './field-layout';

const LEGACY_VIRTUAL_WIDTH = 1920;
const PHYSICS_SCALE = VIRTUAL_FIELD_WIDTH / LEGACY_VIRTUAL_WIDTH;

export const SIMULATION_CONFIG = {
  alphaRange: { max: 0.85, min: 0.25 },
  baseGravity: 0.216 * PHYSICS_SCALE,
  burstVelocityY: {
    max: 1.6 * PHYSICS_SCALE,
    min: 0.7 * PHYSICS_SCALE,
  },
  captureRadius: 384 * PHYSICS_SCALE,
  initialVelocityX: {
    max: 0.45 * PHYSICS_SCALE,
    min: -0.45 * PHYSICS_SCALE,
  },
  initialVelocityY: {
    max: 0.9 * PHYSICS_SCALE,
    min: 0.35 * PHYSICS_SCALE,
  },
  maxSpeed: 28.8 * PHYSICS_SCALE,
  nodeAccents: {
    [NodeType.Attractor]: 0x00f0ff,
    [NodeType.Repeller]: 0xff0055,
    [NodeType.Vortex]: 0xffaa00,
  },
  nodeForceScale: {
    [NodeType.Attractor]: 0.95 * PHYSICS_SCALE,
    [NodeType.Repeller]: 1.35 * PHYSICS_SCALE,
    [NodeType.Vortex]: 1.75 * PHYSICS_SCALE,
  },
  particleLifetimeMs: 1_800_000,
  particleTint: 0xe7ffff,
  scaleRange: { max: 1.8, min: 0.6 },
  sinkPulseRate: 0.004,
  spawnMargin: 24,
} as const;

export type SimulationConfig = typeof SIMULATION_CONFIG;
