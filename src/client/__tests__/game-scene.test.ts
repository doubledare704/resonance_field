import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NodeType,
  createEmptySnapshot,
} from '../../shared/api';
import type { GameSnapshot } from '../../shared/api';

const bridgeMocks = vi.hoisted(() => ({
  submitThroughputRequest: vi.fn(),
  requestInitialSnapshot: vi.fn(),
  deployNodeRequest: vi.fn(),
  requestArchiveHistory: vi.fn(),
}));

vi.mock('../bridge', () => ({
  submitThroughputRequest: bridgeMocks.submitThroughputRequest,
  requestInitialSnapshot: bridgeMocks.requestInitialSnapshot,
  deployNodeRequest: bridgeMocks.deployNodeRequest,
  requestArchiveHistory: bridgeMocks.requestArchiveHistory,
}));

const phaserMocks = vi.hoisted(() => {
  class MockParticleEmitter {
    particles: Array<{
      x: number; y: number;
      velocityX: number; velocityY: number;
      life: number; lifeCurrent: number;
      scaleX: number; scaleY: number;
    }> = [];
    depth = 0;
    alpha = 1;
    private cfg: { maxParticles: number; lifespan: number };

    constructor(_s: unknown, _x: number, _y: number, _t: string, config: { maxParticles: number; lifespan: number }) {
      this.cfg = config;
    }
    setDepth(d: number) { this.depth = d; return this; }
    setAlpha(a: number) { this.alpha = a; return this; }
    emitParticleAt(_x: number, _y: number) {
      if (this.particles.length >= this.cfg.maxParticles) return null;
      const p = { x: _x, y: _y, velocityX: 0, velocityY: 0, life: this.cfg.lifespan, lifeCurrent: this.cfg.lifespan, scaleX: 1, scaleY: 1 };
      this.particles.push(p);
      return p;
    }
    forEachAlive(cb: (p: unknown) => void) {
      this.particles.forEach((p) => cb(p));
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
    x = 0; y = 0; children: unknown[] = [];
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
    setDepth() { return this; }
    setVisible() { return this; }
    add(child: unknown) { this.children.push(child); return this; }
    removeAll() { this.children = []; return this; }
    setMask() { return this; }
    setInteractive() { return this; }
    on() { return this; }
    setAlpha() { return this; }
    destroy() {}
  }

  class MockRectangle {
    setOrigin() { return this; }
    setDepth() { return this; }
    setSize() { return this; }
    setStrokeStyle() { return this; }
    setFillStyle() { return this; }
    destroy() {}
  }

  class MockText {
    x = 0; y = 0; visible = true; name = '';
    setOrigin() { return this; }
    setDepth() { return this; }
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
    setVisible(v: boolean) { this.visible = v; return this; }
    setText() { return this; }
    setColor() { return this; }
    setScrollFactor() { return this; }
    setName(n: string) { this.name = n; return this; }
    setInteractive() { return this; }
    on() { return this; }
    destroy() {}
    setPadding() { return this; }
    setBackgroundColor() { return this; }
  }

  class MockZone {
    setOrigin() { return this; }
    setInteractive() { return this; }
    on() { return this; }
  }

  const MathMock = {
    Clamp: (v: number, min: number, max: number) => (v < min ? min : v > max ? max : v),
    FloatBetween: (min: number, max: number) => min + Math.random() * (max - min),
    Between: (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1)),
    DegToRad: (deg: number) => (deg * Math.PI) / 180,
  };

  const GameObjects = {
    Graphics: MockGraphics,
    Rectangle: MockRectangle,
    Text: MockText,
    Container: MockContainer,
    Zone: MockZone,
    Particles: { ParticleEmitter: MockParticleEmitter },
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
      delayedCall: (_delay: number, cb?: () => void) => ({ remove: () => {}, callback: cb }),
    };
    events = {
      once: () => {},
      on: () => {},
      off: () => {},
      emit: () => {},
    };
    tweens = { add: () => {} };
    game = { loop: { actualFps: 60 } };
    cameras = { main: { setBackgroundColor() {}, resize() {} } };
    input = {
      on() {},
      off() {},
      keyboard: { on() {}, off() {} },
    };
  }

  return {
    phaserModule: {
      Math: MathMock,
      GameObjects,
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

vi.mock('phaser', () => phaserMocks.phaserModule);

import { Game } from '../scenes/Game';
import { ParticleField } from '../simulation';

function makeToolUi() {
  const base = {
    panel: { x: 0, y: 0, setPosition: () => {}, add: () => {} },
    badge: { setFillStyle: () => {}, setStrokeStyle: () => {} },
    title: { setColor: () => {} },
    detail: { setColor: () => {} },
    icon: { clear: () => {}, lineStyle: () => {}, fillStyle: () => {}, strokeCircle: () => {}, strokeTriangle: () => {}, fillTriangle: () => {}, beginPath: () => {}, arc: () => {}, strokePath: () => {} },
    selectHitArea: {} as { on?: (...args: unknown[]) => unknown },
  };
  return {
    [NodeType.Attractor]: { ...base, selectHitArea: {} },
    [NodeType.Repeller]: { ...base, selectHitArea: {} },
    [NodeType.Vortex]: { ...base, selectHitArea: {} },
  };
}

function makeSnapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  const base = createEmptySnapshot({
    postId: 'test-post',
    username: 'test-user',
    subredditName: 'test-sub',
    now: Date.now(),
  });
  return { ...base, phase: 'active', ...overrides };
}

function makeNode(overrides: Record<string, unknown> = {}) {
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

/* eslint-disable @typescript-eslint/no-explicit-any */
function setupGame() {
  const game = new Game() as any;
  game.simulation = null;
  game.snapshot = null;
  game.localPendingScore = 0;
  game.throughputRetryQueue = [];
  game.statusText = { setText: () => {} };
  game.connectivityIndicator = { visible: false, setVisible: () => {} };
  game.syncSpinner = { visible: false, setVisible: () => {}, setText: () => {}, setPosition: () => {} };
  game.scoreText = { setText: () => {} };
  game.timerText = { setText: () => {} };
  game.nodeQuotaText = { setText: () => {} };
  game.throughputTimer = null;
  game.toolUi = makeToolUi();
  game.rejectedTool = null;
  game.scale = { width: 800, height: 600, on: () => {} };
  game.events = { once: () => {}, on: () => {}, off: () => {}, emit: () => {} };

  game.priv_flushThroughput = (Game.prototype as any).flushThroughput as () => Promise<void>;
  game.priv_queueThroughput = (Game.prototype as any).queueThroughput as (count: number) => void;
  game.priv_pruneExpiredNodes = (Game.prototype as any).pruneExpiredNodes as () => void;
  game.priv_processThroughputRetries = (Game.prototype as any).processThroughputRetries as () => void;
  game.priv_processSingleRetry = (Game.prototype as any).processSingleRetry as (entry: { count: number; attempts: number }) => Promise<void>;
  game.priv_applyThroughputSuccess = (Game.prototype as any).applyThroughputSuccess as (data: unknown) => void;

  return game;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('Game throughput scoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('queueThroughput', () => {
    it('accumulates collected count into localPendingScore', () => {
      const game = setupGame();
      game.priv_queueThroughput(5);
      expect(game.localPendingScore).toBe(5);
      game.priv_queueThroughput(10);
      expect(game.localPendingScore).toBe(15);
    });
  });

  describe('Game.update() throughput accumulation', () => {
    it('calls queueThroughput when simulation returns collected > 0', () => {
      const game = setupGame();
      const mockSimulation = {
        step: vi.fn().mockReturnValue(7),
        destroy: vi.fn(),
        setSize: vi.fn(),
        setFieldLayout: vi.fn(),
      } as unknown as ParticleField;
      game.simulation = mockSimulation;
      game.snapshot = makeSnapshot({ nodes: [makeNode()] });

      game.update(0, 16.667);

      expect(game.localPendingScore).toBe(7);
      expect(mockSimulation.step).toHaveBeenCalledWith(16.667, expect.any(Array));
    });

    it('does not call queueThroughput when collected is 0', () => {
      const game = setupGame();
      const mockSimulation = {
        step: vi.fn().mockReturnValue(0),
        destroy: vi.fn(),
        setSize: vi.fn(),
        setFieldLayout: vi.fn(),
      } as unknown as ParticleField;
      game.simulation = mockSimulation;
      game.snapshot = makeSnapshot({ nodes: [] });

      game.update(0, 16.667);

      expect(game.localPendingScore).toBe(0);
    });

    it('accumulates over multiple update calls', () => {
      const game = setupGame();
      const mockSimulation = {
        step: vi.fn()
          .mockReturnValueOnce(3)
          .mockReturnValueOnce(5)
          .mockReturnValueOnce(2),
        destroy: vi.fn(),
        setSize: vi.fn(),
        setFieldLayout: vi.fn(),
      } as unknown as ParticleField;
      game.simulation = mockSimulation;
      game.snapshot = makeSnapshot({ nodes: [] });

      game.update(0, 16.667);
      game.update(16.667, 16.667);
      game.update(33.334, 16.667);

      expect(game.localPendingScore).toBe(10);
    });
  });
});

describe('Game batch flush', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits pending score and resets localPendingScore on success', async () => {
    const game = setupGame();
    game.snapshot = makeSnapshot();
    game.localPendingScore = 42;

    bridgeMocks.submitThroughputRequest.mockResolvedValueOnce({
      ok: true,
      data: {
        type: 'throughput_accepted',
        contractVersion: 'resonance-field/v1',
        scoreDelta: 42,
        snapshot: game.snapshot,
      },
    });

    await game.priv_flushThroughput();

    expect(game.localPendingScore).toBe(0);
  });

  it('queues retry when submitThroughputRequest fails', async () => {
    const game = setupGame();
    game.snapshot = makeSnapshot();
    game.localPendingScore = 42;

    bridgeMocks.submitThroughputRequest.mockResolvedValueOnce({
      ok: false,
      error: { type: 'error', contractVersion: 'resonance-field/v1', message: 'Network error' },
    });

    await game.priv_flushThroughput();

    expect(game.localPendingScore).toBe(0);
    expect(game.throughputRetryQueue.length).toBe(1);
    expect(game.throughputRetryQueue[0]!.count).toBe(42);
    expect(game.throughputRetryQueue[0]!.attempts).toBe(1);
  });

  it('does nothing when localPendingScore is 0', async () => {
    const game = setupGame();
    game.snapshot = makeSnapshot();
    game.localPendingScore = 0;

    await game.priv_flushThroughput();

    expect(bridgeMocks.submitThroughputRequest).not.toHaveBeenCalled();
  });

  it('does nothing when snapshot is null', async () => {
    const game = setupGame();
    game.snapshot = null;
    game.localPendingScore = 10;

    await game.priv_flushThroughput();

    expect(bridgeMocks.submitThroughputRequest).not.toHaveBeenCalled();
  });
});

describe('Game retry queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processes ready retry entry with exponential backoff on failure', async () => {
    const game = setupGame();
    game.snapshot = makeSnapshot();

    const now = Date.now();
    game.throughputRetryQueue = [
      { count: 10, attempts: 1, nextRetryAt: now - 1000 },
    ];

    const retryPromise = new Promise<void>((resolve) => {
      bridgeMocks.submitThroughputRequest.mockResolvedValueOnce({
        ok: false,
        error: { type: 'error', contractVersion: 'resonance-field/v1', message: 'Fail' },
      });
      resolve();
    });

    game.priv_processThroughputRetries();
    await retryPromise;
    await vi.waitFor(() => {
      expect(game.throughputRetryQueue.length).toBeGreaterThan(0);
    }, { timeout: 1000 });

    const retryEntry = game.throughputRetryQueue[0];
    expect(retryEntry).toBeDefined();
    expect(retryEntry!.attempts).toBe(2);
  });

  it('removes entry from retry queue on success', async () => {
    const game = setupGame();
    game.snapshot = makeSnapshot();

    const now = Date.now();
    game.throughputRetryQueue = [
      { count: 10, attempts: 1, nextRetryAt: now - 1000 },
    ];

    const retryPromise = new Promise<void>((resolve) => {
      bridgeMocks.submitThroughputRequest.mockResolvedValueOnce({
        ok: true,
        data: {
          type: 'throughput_accepted',
          contractVersion: 'resonance-field/v1',
          scoreDelta: 10,
          snapshot: game.snapshot,
        },
      });
      resolve();
    });

    game.priv_processThroughputRetries();
    await retryPromise;
    await vi.waitFor(() => {
      expect(game.throughputRetryQueue.length).toBe(0);
    }, { timeout: 1000 });
  });

  it('drops entry and returns score to pending after max attempts', async () => {
    const game = setupGame();
    game.snapshot = makeSnapshot();

    const now = Date.now();
    game.throughputRetryQueue = [
      { count: 10, attempts: 3, nextRetryAt: now - 1000 },
    ];

    const retryPromise = new Promise<void>((resolve) => {
      bridgeMocks.submitThroughputRequest.mockResolvedValueOnce({
        ok: false,
        error: { type: 'error', contractVersion: 'resonance-field/v1', message: 'Fail' },
      });
      resolve();
    });

    game.priv_processThroughputRetries();
    await retryPromise;
    await vi.waitFor(() => {
      expect(game.localPendingScore).toBe(10);
    }, { timeout: 1000 });

    expect(game.throughputRetryQueue.length).toBe(0);
  });

  it('does not process entries whose nextRetryAt is in the future', () => {
    const game = setupGame();
    game.snapshot = makeSnapshot();

    game.throughputRetryQueue = [
      { count: 10, attempts: 1, nextRetryAt: Date.now() + 60000 },
    ];

    game.priv_processThroughputRetries();

    expect(bridgeMocks.submitThroughputRequest).not.toHaveBeenCalled();
    expect(game.throughputRetryQueue.length).toBe(1);
  });

  it('processes only one ready entry per tick when multiple are ready', async () => {
    const game = setupGame();
    game.snapshot = makeSnapshot();

    const now = Date.now();
    game.throughputRetryQueue = [
      { count: 10, attempts: 1, nextRetryAt: now - 1000 },
      { count: 20, attempts: 1, nextRetryAt: now - 1000 },
    ];

    const retryPromise = new Promise<void>((resolve) => {
      bridgeMocks.submitThroughputRequest.mockResolvedValueOnce({
        ok: true,
        data: {
          type: 'throughput_accepted',
          contractVersion: 'resonance-field/v1',
          scoreDelta: 10,
          snapshot: game.snapshot!,
        },
      });
      resolve();
    });

    game.priv_processThroughputRetries();
    await retryPromise;
    await vi.waitFor(() => {
      expect(game.throughputRetryQueue.length).toBe(1);
    }, { timeout: 1000 });

    expect(game.throughputRetryQueue[0]!.count).toBe(20);
  });
});

describe('Game client-side expiry pruning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes nodes whose expiresAt is in the past', () => {
    const game = setupGame();
    const expiredNode = makeNode({ id: 'expired', expiresAt: Date.now() - 60000 });
    const activeNode = makeNode({ id: 'active', expiresAt: Date.now() + 60000 });
    game.snapshot = makeSnapshot({
      nodes: [expiredNode, activeNode],
      userActiveNodeIds: ['expired', 'active'],
      userActiveNodeCount: 2,
    });

    game.priv_pruneExpiredNodes();

    expect(game.snapshot!.nodes.length).toBe(1);
    expect(game.snapshot!.nodes[0]!.id).toBe('active');
    expect(game.snapshot!.userActiveNodeCount).toBe(1);
  });

  it('removes all nodes when all are expired', () => {
    const game = setupGame();
    const node1 = makeNode({ id: 'n1', expiresAt: 1 });
    const node2 = makeNode({ id: 'n2', expiresAt: 2 });
    game.snapshot = makeSnapshot({
      nodes: [node1, node2],
      userActiveNodeIds: ['n1', 'n2'],
      userActiveNodeCount: 2,
    });

    game.priv_pruneExpiredNodes();

    expect(game.snapshot!.nodes.length).toBe(0);
    expect(game.snapshot!.userActiveNodeCount).toBe(0);
  });

  it('does nothing when snapshot is null', () => {
    const game = setupGame();
    game.snapshot = null;

    expect(() => game.priv_pruneExpiredNodes()).not.toThrow();
  });

  it('preserves nodes at exact expiry boundary', () => {
    const game = setupGame();
    const now = Date.now();
    const node = makeNode({ id: 'boundary', expiresAt: now + 1 });
    game.snapshot = makeSnapshot({
      nodes: [node],
      userActiveNodeIds: ['boundary'],
      userActiveNodeCount: 1,
    });

    game.priv_pruneExpiredNodes();

    expect(game.snapshot!.nodes.length).toBe(1);
  });
});
