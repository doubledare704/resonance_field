import { describe, it, expect, vi } from 'vitest';
import { NodeType } from '../../shared/api';
import type { FieldLayout, GameNode } from '../../shared/api';

type MockParticle = {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  life: number;
  lifeCurrent: number;
  scaleX: number;
  scaleY: number;
};

const mocks = vi.hoisted(() => {
  class MockParticleEmitter {
    particles: MockParticle[] = [];
    depth = 0;
    alpha = 1;
    private cfg: { maxParticles: number; lifespan: number };

    constructor(_s: unknown, _x: number, _y: number, _t: string, config: { maxParticles: number; lifespan: number }) {
      this.cfg = config;
    }
    setDepth(d: number) { this.depth = d; return this; }
    setAlpha(a: number) { this.alpha = a; return this; }
    emitParticleAt(x: number, y: number): MockParticle | null {
      if (this.particles.length >= this.cfg.maxParticles) return null;
      const p: MockParticle = { x, y, velocityX: 0, velocityY: 0, life: this.cfg.lifespan, lifeCurrent: this.cfg.lifespan, scaleX: 1, scaleY: 1 };
      this.particles.push(p);
      return p;
    }
    forEachAlive(cb: (p: MockParticle, i: number, arr: MockParticle[]) => void) {
      this.particles.forEach((p, i, arr) => cb(p, i, arr));
    }
    destroy() {}
  }

  class MockGraphics {
    depth = 0; alpha = 1;
    setDepth(d: number) { this.depth = d; return this; }
    setAlpha(a: number) { this.alpha = a; return this; }
    clear() { return this; }
    lineStyle() { return this; }
    fillStyle() { return this; }
    fillRect() { return this; }
    strokeRect() { return this; }
    fillCircle() { return this; }
    strokeCircle() { return this; }
    fillTriangle() { return this; }
    strokeTriangle() { return this; }
    fillRoundedRect() { return this; }
    strokeRoundedRect() { return this; }
    beginPath() { return this; }
    arc() { return this; }
    strokePath() { return this; }
    lineBetween() { return this; }
    createGeometryMask() { return { setInvertAlpha() { return this; }, destroy() {} }; }
    destroy() {}
  }

  class MockContainer {
    x = 0; y = 0;
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
    setDepth() { return this; }
    add() { return this; }
    setVisible() { return this; }
    setMask() { return this; }
    setInteractive() { return this; }
    on() { return this; }
    destroy() {}
    setAlpha() { return this; }
    setOrigin() { return this; }
    setName() { return this; }
  }

  class MockRectangle {
    setOrigin() { return this; }
    setDepth() { return this; }
    setSize() { return this; }
    setStrokeStyle() { return this; }
    destroy() {}
  }

  class MockText {
    x = 0; y = 0;
    setDepth() { return this; }
    setOrigin() { return this; }
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
    setVisible() { return this; }
    setInteractive() { return this; }
    on() { return this; }
    destroy() {}
    setScrollFactor() { return this; }
  }

  class MockZone {
    setOrigin() { return this; }
    setInteractive() { return this; }
    on() { return this; }
  }

  class MockEventEmitter {
    private listeners: Map<string, Array<(...args: unknown[]) => void>> = new Map();
    once(e: string, fn: (...args: unknown[]) => void) { this.on(e, fn); }
    on(e: string, fn: (...args: unknown[]) => void) {
      if (!this.listeners.has(e)) this.listeners.set(e, []);
      this.listeners.get(e)!.push(fn);
    }
    off(e: string, fn: (...args: unknown[]) => void) {
      const fns = this.listeners.get(e);
      if (fns) { const idx = fns.indexOf(fn); if (idx >= 0) fns.splice(idx, 1); }
    }
  }

  const MathMock = {
    Clamp: (v: number, min: number, max: number) => (v < min ? min : v > max ? max : v),
    FloatBetween: (min: number, max: number) => min + Math.random() * (max - min),
    Between: (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1)),
    DegToRad: (deg: number) => (deg * Math.PI) / 180,
  };

  class MockScene {
    add = {
      graphics: () => new MockGraphics(),
      particles: (_x: number, _y: number, _t: string, config: { maxParticles: number; lifespan: number }) =>
        new MockParticleEmitter(this, _x, _y, _t, config),
      container: () => new MockContainer(),
      rectangle: () => new MockRectangle(),
      text: () => new MockText(),
      zone: () => new MockZone(),
    };
    scale = { width: 800, height: 600, on: () => {} };
    time = {
      addEvent: () => ({ remove: () => {} }),
      delayedCall: () => ({ remove: () => {} }),
    };
    events = new MockEventEmitter();
    tweens = { add: () => {} };
    game = { loop: { actualFps: 60 } };
    cameras = { main: { setBackgroundColor() {}, resize() {} } };
    input = { on() {}, off() {}, keyboard: { on() {}, off() {} } };
  }

  return {
    createScene: () => new MockScene(),
    phaserModule: {
      Math: MathMock,
      GameObjects: {
        Graphics: MockGraphics,
        Rectangle: MockRectangle,
        Text: MockText,
        Container: MockContainer,
        Zone: MockZone,
        Particles: { ParticleEmitter: MockParticleEmitter },
      },
      Scene: MockScene,
      Scenes: { Events: { SHUTDOWN: 'shutdown' } },
      Cameras: { Scene2D: { Camera: class {} } },
      Time: { TimerEvent: class {} },
      Input: { Pointer: class { x = 0; y = 0; worldX = 0; worldY = 0; } },
      Structs: { Size: class { width = 0; height = 0; } },
      Geom: { Rectangle: class { static Contains: (..._args: unknown[]) => boolean = () => true; } },
      default: null as unknown,
    },
  };
});

vi.mock('phaser', () => mocks.phaserModule);

import { ParticleField } from '../simulation';

function makeNode(overrides: Partial<GameNode> = {}): GameNode {
  return {
    id: 'node-1',
    type: NodeType.Attractor,
    x: 400,
    y: 300,
    ownerId: 'test-user',
    createdAt: Date.now() - 10000,
    expiresAt: Date.now() + 60000,
    ...overrides,
  };
}

function makeFieldLayout(overrides: Partial<FieldLayout> = {}): FieldLayout {
  return {
    dayKey: '2025-01-01',
    seed: 42,
    templateId: 1,
    bounds: { x: 0, y: 0, w: 800, h: 600 },
    obstacles: [],
    hazards: [],
    sink: { x: 400, y: 500, r: 30 },
    spawnBand: { x: 0, y: 0, w: 800, h: 60 },
    ...overrides,
  };
}

describe('ParticleField', () => {
  const PARTICLE_COUNT = 30;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function newScene(): any {
    return mocks.createScene() as unknown as import('phaser').Scene;
  }

  describe('step() particle collection', () => {
    it('collects particles that reach the sink zone with an Attractor', () => {
      const field = new ParticleField(newScene(), PARTICLE_COUNT, 'particle_circle');
      const attractor = makeNode({ type: NodeType.Attractor, x: 400, y: 250 });
      let collected = 0;
      for (let i = 0; i < 600; i++) collected += field.step(16.667, [attractor]);
      expect(collected).toBeGreaterThan(0);
    });

    it('collects particles with Repeller and Attractor both present', () => {
      const field = new ParticleField(newScene(), PARTICLE_COUNT, 'particle_circle');
      const repeller = makeNode({ type: NodeType.Repeller, x: 600, y: 400 });
      const attractor = makeNode({ id: 'node-2', type: NodeType.Attractor, x: 200, y: 300 });
      let collected = 0;
      for (let i = 0; i < 600; i++) collected += field.step(16.667, [repeller, attractor]);
      expect(collected).toBeGreaterThan(0);
    });

    it('collects particles with Vortex nodes', () => {
      const field = new ParticleField(newScene(), PARTICLE_COUNT, 'particle_circle');
      const vortex = makeNode({ type: NodeType.Vortex, x: 400, y: 200 });
      let collected = 0;
      for (let i = 0; i < 600; i++) collected += field.step(16.667, [vortex]);
      expect(collected).toBeGreaterThan(0);
    });

    it('skips expired nodes during simulation', () => {
      const field = new ParticleField(newScene(), PARTICLE_COUNT, 'particle_circle');
      const expired = makeNode({ id: 'expired', expiresAt: 1 });
      const active = makeNode({ id: 'active', type: NodeType.Attractor, x: 400, y: 200, expiresAt: Date.now() + 60000 });

      let collectedExpired = 0;
      for (let i = 0; i < 300; i++) collectedExpired += field.step(16.667, [expired]);
      let collectedActive = 0;
      for (let i = 0; i < 300; i++) collectedActive += field.step(16.667, [active]);

      expect(collectedActive).toBeGreaterThan(0);
    });
  });

  describe('layout and culling', () => {
    function getInternals(field: ParticleField) {
      return field as unknown as { layoutVersion: number; drawnLayoutVersion: number };
    }

    it('setFieldLayout increments layoutVersion', () => {
      const field = new ParticleField(newScene(), PARTICLE_COUNT, 'particle_circle');
      field.setFieldLayout(makeFieldLayout());
      expect(getInternals(field).layoutVersion).toBe(0);
    });

    it('layout is drawn on first step() after setFieldLayout', () => {
      const field = new ParticleField(newScene(), PARTICLE_COUNT, 'particle_circle');
      const internals = getInternals(field);
      expect(internals.drawnLayoutVersion).toBe(-1);

      field.setFieldLayout(makeFieldLayout());
      field.step(16.667, []);
      expect(internals.drawnLayoutVersion).toBe(0);
    });

    it('redraws when layoutVersion changes', () => {
      const field = new ParticleField(newScene(), PARTICLE_COUNT, 'particle_circle');
      const internals = getInternals(field);

      field.setFieldLayout(makeFieldLayout({ seed: 42 }));
      field.step(16.667, []);
      expect(internals.drawnLayoutVersion).toBe(0);

      field.setFieldLayout(makeFieldLayout({ seed: 99 }));
      expect(internals.layoutVersion).toBe(1);
      expect(internals.drawnLayoutVersion).toBe(0);

      field.step(16.667, []);
      expect(internals.drawnLayoutVersion).toBe(1);
    });

    it('does not redraw on step() when layout unchanged', () => {
      const field = new ParticleField(newScene(), PARTICLE_COUNT, 'particle_circle');
      const internals = getInternals(field);

      field.setFieldLayout(makeFieldLayout());
      field.step(16.667, []);
      expect(internals.drawnLayoutVersion).toBe(0);

      field.step(16.667, []);
      expect(internals.drawnLayoutVersion).toBe(0);
    });

    it('setFieldLayout(null) does not change layoutVersion', () => {
      const field = new ParticleField(newScene(), PARTICLE_COUNT, 'particle_circle');
      const internals = getInternals(field);
      const prev = internals.layoutVersion;
      field.setFieldLayout(null);
      expect(internals.layoutVersion).toBe(prev);
    });
  });
});
