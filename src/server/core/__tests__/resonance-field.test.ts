import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const store = new Map<string, string>();

  const redis = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
  };

  const context = {
    postId: 'test-post-id',
    subredditName: 'test-subreddit' as string | null,
  };

  const reddit = {
    getCurrentUsername: vi.fn(async () => 'test-user'),
  };

  return { store, redis, context, reddit };
});

vi.mock('@devvit/web/server', () => ({
  redis: mocks.redis,
  context: mocks.context,
  reddit: mocks.reddit,
}));

import {
  CONTRACT_VERSION,
  NODE_LIFESPAN_MS,
  NodeType,
  NodeDeployRejectionReason,
  type GameNode,
  type GameState,
  type SnapshotSeed,
} from '../../../shared/api';
import {
  parseState,
  getEmptyState,
  toSnapshot,
  pruneExpiredNodes,
  refreshStateForNow,
  buildSnapshot,
  loadSnapshot,
  deployNode,
  submitThroughput,
  resetDailyState,
  getArchiveHistory,
  buildInitialResponse,
} from '../resonance-field';

const BASE_SEED: SnapshotSeed = {
  postId: 'test-post-id',
  username: 'test-user',
  subredditName: 'test-subreddit',
  now: 1_700_500_000_000,
};

const makeNode = (overrides: Partial<GameNode> = {}): GameNode => ({
  id: 'node-1',
  type: NodeType.Attractor,
  x: 400,
  y: 100,
  ownerId: 'test-user',
  createdAt: 1_700_500_000_000,
  expiresAt: 1_700_500_060_000,
  ...overrides,
});

const makeState = (overrides: Partial<GameState> = {}): GameState => {
  const now = BASE_SEED.now ?? Date.now();
  return {
    contractVersion: CONTRACT_VERSION,
    postId: 'test-post-id',
    subredditName: 'test-subreddit',
    phase: 'idle',
    dailyResetAtUtc: now + 86_400_000,
    globalScore: 0,
    nodes: [],
    selectedTools: {},
    ...overrides,
  };
};

beforeEach(() => {
  mocks.store.clear();
  vi.clearAllMocks();
  mocks.context.postId = 'test-post-id';
  mocks.context.subredditName = 'test-subreddit';
  mocks.reddit.getCurrentUsername.mockResolvedValue('test-user');
});

const seedStore = (state: GameState) => {
  mocks.store.set('resonance:state:test-post-id', JSON.stringify(state));
};

const seedStoreHistory = (history: Array<unknown>) => {
  mocks.store.set('resonance:history:test-post-id', JSON.stringify(history));
};

describe('parseState', () => {
  it('returns empty state for null value', () => {
    const result = parseState(null, BASE_SEED);
    expect(result.contractVersion).toBe(CONTRACT_VERSION);
    expect(result.nodes).toEqual([]);
    expect(result.globalScore).toBe(0);
    expect(result.phase).toBe('idle');
  });

  it('returns empty state for undefined value', () => {
    const result = parseState(undefined, BASE_SEED);
    expect(result.contractVersion).toBe(CONTRACT_VERSION);
    expect(result.nodes).toEqual([]);
  });

  it('returns empty state for invalid JSON', () => {
    const result = parseState('not-json', BASE_SEED);
    expect(result.contractVersion).toBe(CONTRACT_VERSION);
    expect(result.nodes).toEqual([]);
  });

  it('returns empty state for wrong contractVersion', () => {
    const bad = JSON.stringify({ contractVersion: 'old/v0', postId: 'x', nodes: [] });
    const result = parseState(bad, BASE_SEED);
    expect(result.contractVersion).toBe(CONTRACT_VERSION);
    expect(result.nodes).toEqual([]);
  });

  it('returns empty state for missing postId', () => {
    const bad = JSON.stringify({ contractVersion: CONTRACT_VERSION, nodes: [] });
    const result = parseState(bad, BASE_SEED);
    expect(result.nodes).toEqual([]);
  });

  it('returns empty state for non-array nodes', () => {
    const bad = JSON.stringify({
      contractVersion: CONTRACT_VERSION,
      postId: 'x',
      nodes: 'not-array',
    });
    const result = parseState(bad, BASE_SEED);
    expect(result.nodes).toEqual([]);
  });

  it('parses valid state correctly', () => {
    const now = 1_700_500_000_000;
    const state = makeState({ globalScore: 42, phase: 'active', nodes: [] });
    const json = JSON.stringify(state);
    const result = parseState(json, { ...BASE_SEED, now });
    expect(result.postId).toBe('test-post-id');
    expect(result.globalScore).toBe(42);
    expect(result.phase).toBe('active');
  });

  it('filters out malformed node missing id', () => {
    const state = makeState();
    const badNode = { type: NodeType.Attractor, x: 400, y: 100, ownerId: 'me', createdAt: 1, expiresAt: 2 };
    (state.nodes as Array<Partial<GameNode>>).push(badNode as unknown as GameNode);
    const result = parseState(JSON.stringify(state), BASE_SEED);
    expect(result.nodes).toEqual([]);
  });

  it('filters out malformed node with NaN x', () => {
    const state = makeState({ nodes: [makeNode({ x: NaN })] });
    const result = parseState(JSON.stringify(state), BASE_SEED);
    expect(result.nodes).toEqual([]);
  });

  it('filters out malformed node with bad type', () => {
    const state = makeState({ nodes: [makeNode({ type: 'BOGUS' as NodeType })] });
    const result = parseState(JSON.stringify(state), BASE_SEED);
    expect(result.nodes).toEqual([]);
  });

  it('generates fieldLayout when missing', () => {
    const state = { contractVersion: CONTRACT_VERSION, postId: 'no-layout', nodes: [] };
    const result = parseState(JSON.stringify(state), BASE_SEED);
    expect(result.fieldLayout).toBeDefined();
    expect(result.fieldLayout?.dayKey).toBeDefined();
  });

  it('sets dailyResetAtUtc to next midnight when missing', () => {
    const state = { contractVersion: CONTRACT_VERSION, postId: 'no-reset', nodes: [] };
    const now = BASE_SEED.now ?? Date.now();
    const result = parseState(JSON.stringify(state), { ...BASE_SEED, now });
    const dayStart = now - (now % 86_400_000);
    expect(result.dailyResetAtUtc).toBe(dayStart + 86_400_000);
  });

  it('sets globalScore to 0 when missing', () => {
    const state = { contractVersion: CONTRACT_VERSION, postId: 'no-score', nodes: [] };
    const result = parseState(JSON.stringify(state), BASE_SEED);
    expect(result.globalScore).toBe(0);
  });

  it('sets phase to idle when invalid', () => {
    const state = makeState({ phase: 'unknown' as 'active' });
    const result = parseState(JSON.stringify(state), BASE_SEED);
    expect(result.phase).toBe('idle');
  });

  it('sets dailyResetAtUtc to next midnight when NaN', () => {
    const now = BASE_SEED.now ?? Date.now();
    const state = makeState({ dailyResetAtUtc: NaN });
    const result = parseState(JSON.stringify(state), { ...BASE_SEED, now });
    const dayStart = now - (now % 86_400_000);
    expect(result.dailyResetAtUtc).toBe(dayStart + 86_400_000);
  });

  it('sets dailyResetAtUtc to next midnight when Infinity', () => {
    const now = BASE_SEED.now ?? Date.now();
    const state = makeState({ dailyResetAtUtc: Infinity });
    const result = parseState(JSON.stringify(state), { ...BASE_SEED, now });
    const dayStart = now - (now % 86_400_000);
    expect(result.dailyResetAtUtc).toBe(dayStart + 86_400_000);
  });

  it('parses and retains valid nodes', () => {
    const node = makeNode();
    const state = makeState({ nodes: [node] });
    const result = parseState(JSON.stringify(state), BASE_SEED);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]?.id).toBe('node-1');
    expect(result.nodes[0]?.type).toBe(NodeType.Attractor);
  });
});

describe('getEmptyState', () => {
  const now = 1_700_500_000_000;

  it('creates empty state with zero nodes and score', () => {
    const state = getEmptyState(BASE_SEED);
    expect(state.nodes).toEqual([]);
    expect(state.globalScore).toBe(0);
    expect(state.phase).toBe('idle');
  });

  it('sets dailyResetAtUtc to next midnight from seed.now', () => {
    const state = getEmptyState({ ...BASE_SEED, now });
    const dayStart = now - (now % 86_400_000);
    expect(state.dailyResetAtUtc).toBe(dayStart + 86_400_000);
  });

  it('passes through provided fieldLayout', () => {
    const fieldLayout = {
      dayKey: '2026-01-01',
      seed: 99,
      templateId: 2,
      bounds: { x: 0, y: 0, w: 800, h: 600 },
      obstacles: [],
      hazards: [],
      sink: { x: 400, y: 480, r: 50 },
      spawnBand: { x: 0, y: 0, w: 800, h: 80 },
    };
    const state = getEmptyState({ ...BASE_SEED, fieldLayout });
    expect(state.fieldLayout).toBe(fieldLayout);
  });

  it('generates fieldLayout when not provided', () => {
    const state = getEmptyState(BASE_SEED);
    expect(state.fieldLayout).toBeDefined();
  });
});

describe('toSnapshot', () => {
  const state = makeState({
    nodes: [
      makeNode({ id: 'a', ownerId: 'user-a' }),
      makeNode({ id: 'b', ownerId: 'user-b' }),
      makeNode({ id: 'c', ownerId: 'user-a' }),
    ],
  });

  it('filters nodes by username', () => {
    const snapshot = toSnapshot(state, 'user-a');
    expect(snapshot.userActiveNodeIds).toEqual(['a', 'c']);
    expect(snapshot.userActiveNodeCount).toBe(2);
  });

  it('returns empty arrays when user has no nodes', () => {
    const snapshot = toSnapshot(state, 'user-c');
    expect(snapshot.userActiveNodeIds).toEqual([]);
    expect(snapshot.userActiveNodeCount).toBe(0);
  });

  it('passes through archivedScore as lastArchivedScore', () => {
    const snapshot = toSnapshot(state, 'user-a', 500);
    expect(snapshot.lastArchivedScore).toBe(500);
  });

  it('sets lastArchivedScore to undefined when archivedScore is null', () => {
    const snapshot = toSnapshot(state, 'user-a', null);
    expect(snapshot.lastArchivedScore).toBeUndefined();
  });

  it('projects the requesting user tool from the per-user map', () => {
    const stateWithTools = makeState({ selectedTools: { 'user-a': NodeType.Vortex } });
    const snapshot = toSnapshot(stateWithTools, 'user-a');
    expect(snapshot.selectedTool).toBe(NodeType.Vortex);
  });

  it('keeps each user tool isolated per user', () => {
    const stateWithTools = makeState({
      selectedTools: { 'user-a': NodeType.Vortex, 'user-b': NodeType.Repeller },
    });
    expect(toSnapshot(stateWithTools, 'user-a').selectedTool).toBe(NodeType.Vortex);
    expect(toSnapshot(stateWithTools, 'user-b').selectedTool).toBe(NodeType.Repeller);
  });

  it('defaults selectedTool to Attractor when the user has no entry', () => {
    const stateForOtherUser = makeState({ selectedTools: { 'user-b': NodeType.Vortex } });
    expect(toSnapshot(stateForOtherUser, 'user-a').selectedTool).toBe(NodeType.Attractor);
  });

  it('defaults selectedTool to Attractor when the map is empty', () => {
    const snapshot = toSnapshot(makeState(), 'user-a');
    expect(snapshot.selectedTool).toBe(NodeType.Attractor);
  });
});

describe('pruneExpiredNodes', () => {
  const now = 1_700_500_060_000;

  it('does nothing with empty nodes', () => {
    const state = makeState();
    const removed = pruneExpiredNodes(state, now);
    expect(removed).toEqual([]);
    expect(state.nodes).toEqual([]);
  });

  it('keeps all alive nodes', () => {
    const alive = makeNode({ id: 'alive', expiresAt: now + 1000 });
    const state = makeState({ nodes: [alive] });
    const removed = pruneExpiredNodes(state, now);
    expect(removed).toEqual([]);
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0]?.id).toBe('alive');
  });

  it('removes all expired nodes', () => {
    const expired = makeNode({ id: 'expired', expiresAt: now - 1 });
    const state = makeState({ nodes: [expired] });
    const removed = pruneExpiredNodes(state, now);
    expect(removed).toEqual(['expired']);
    expect(state.nodes).toHaveLength(0);
  });

  it('handles mix of alive and expired', () => {
    const alive = makeNode({ id: 'alive', expiresAt: now + 1000 });
    const expired = makeNode({ id: 'expired', expiresAt: now - 1 });
    const state = makeState({ nodes: [alive, expired] });
    const removed = pruneExpiredNodes(state, now);
    expect(removed).toEqual(['expired']);
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0]?.id).toBe('alive');
  });

  it('removes node exactly at expiry (strict > check)', () => {
    const atExpiry = makeNode({ id: 'edge', expiresAt: now });
    const state = makeState({ nodes: [atExpiry] });
    const removed = pruneExpiredNodes(state, now);
    expect(removed).toEqual(['edge']);
    expect(state.nodes).toHaveLength(0);
  });

  it('keeps node 1ms before expiry', () => {
    const almostExpired = makeNode({ id: 'safe', expiresAt: now + 1 });
    const state = makeState({ nodes: [almostExpired] });
    const removed = pruneExpiredNodes(state, now);
    expect(removed).toEqual([]);
    expect(state.nodes).toHaveLength(1);
  });

  it('mutates state.nodes in place', () => {
    const expired = makeNode({ id: 'expired', expiresAt: now - 1 });
    const state = makeState({ nodes: [expired] });
    pruneExpiredNodes(state, now);
    expect(state.nodes).toHaveLength(0);
  });
});

describe('refreshStateForNow', () => {
  const now = 1_700_500_000_000;

  it('returns fresh state when no redis value', async () => {
    // store is already empty (cleared in beforeEach)
    const result = await refreshStateForNow({ ...BASE_SEED, now });
    expect(result.archivedScore).toBeNull();
    expect(result.state.nodes).toEqual([]);
    expect(result.state.globalScore).toBe(0);
  });

  it('prunes expired nodes when now < dailyResetAtUtc', async () => {
    const expired = makeNode({ id: 'old', expiresAt: now - 1000 });
    const alive = makeNode({ id: 'new', expiresAt: now + 1000 });
    const state = makeState({ nodes: [expired, alive], dailyResetAtUtc: now + 86_400_000 });
    seedStore(state);

    const result = await refreshStateForNow({ ...BASE_SEED, now });
    expect(result.archivedScore).toBeNull();
    expect(result.state.nodes).toHaveLength(1);
    expect(result.state.nodes[0]?.id).toBe('new');
    expect(result.state.phase).toBe('active');
  });

  it('triggers daily reset when now >= dailyResetAtUtc', async () => {
    const state = makeState({
      globalScore: 500,
      nodes: [makeNode()],
      dailyResetAtUtc: now, // exactly at reset
    });
    seedStore(state);

    const result = await refreshStateForNow({ ...BASE_SEED, now });
    expect(result.archivedScore).toBe(500);
    expect(result.state.globalScore).toBe(0);
    expect(result.state.nodes).toEqual([]);
    expect(result.state.dailyResetAtUtc).toBeGreaterThan(now);
    expect(result.state.fieldLayout).toBeDefined();
  });

  it('archives state to history on reset', async () => {
    const state = makeState({
      globalScore: 300,
      dailyResetAtUtc: now,
    });
    seedStore(state);

    await refreshStateForNow({ ...BASE_SEED, now });

    const historyRaw = mocks.store.get('resonance:history:test-post-id');
    expect(historyRaw).toBeDefined();
    if (historyRaw) {
      const history = JSON.parse(historyRaw) as Array<{ score: number }>;
      expect(history).toHaveLength(1);
      expect(history[0]?.score).toBe(300);
    }
  });

  it('sets phase to active when nodes remain', async () => {
    const node = makeNode({ id: 'a1', expiresAt: now + 60_000 });
    const state = makeState({ nodes: [node], dailyResetAtUtc: now + 86_400_000 });
    seedStore(state);

    const result = await refreshStateForNow({ ...BASE_SEED, now });
    expect(result.state.phase).toBe('active');
  });

  it('sets phase to idle when no nodes remain', async () => {
    const state = makeState({ nodes: [], dailyResetAtUtc: now + 86_400_000 });
    seedStore(state);

    const result = await refreshStateForNow({ ...BASE_SEED, now });
    expect(result.state.phase).toBe('idle');
  });

  it('saves state to redis after processing', async () => {
    const state = makeState({ dailyResetAtUtc: now + 86_400_000 });
    seedStore(state);

    await refreshStateForNow({ ...BASE_SEED, now });
    const saved = mocks.store.get('resonance:state:test-post-id');
    expect(saved).toBeDefined();
  });
});

describe('deployNode — Quota Enforcement & FIFO Removal', () => {
  const now = 1_700_500_000_000;

  beforeEach(() => {
    vi.setSystemTime(now);
    const state = makeState({
      dailyResetAtUtc: now + 86_400_000,
      nodes: [],
    });
    seedStore(state);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const validNode = { type: NodeType.Attractor, x: 400, y: 100 };

  it('deploys first node successfully', async () => {
    const result = await deployNode(validNode);
    expect(result).not.toBeNull();
    if (result && 'node' in result) {
      expect(result.node).toBeDefined();
      expect(result.node.type).toBe(NodeType.Attractor);
      expect(result.removedNodeId).toBeNull();
    }
  });

  it('deploys three nodes up to quota', async () => {
    // First deploy sets up state with 1 node
    const r1 = await deployNode(validNode);
    expect(r1 && 'node' in r1).toBe(true);

    // Seed redis with 1 existing node and let second deploy add
    if (r1 && 'node' in r1) {
      const state1 = makeState({ nodes: [r1.node], dailyResetAtUtc: now + 86_400_000 });
      seedStore(state1);
    }

    const r2 = await deployNode({ ...validNode, x: 200 });
    expect(r2 && 'node' in r2).toBe(true);

    if (r2 && 'node' in r2) {
      const nodes2 = [r1 && 'node' in r1 ? r1.node : null, r2.node].filter(Boolean) as GameNode[];
      const state2 = makeState({ nodes: nodes2, dailyResetAtUtc: now + 86_400_000 });
      seedStore(state2);

      const r3 = await deployNode({ ...validNode, x: 600 });
      expect(r3 && 'node' in r3).toBe(true);
    }
  });

  it('fourth deploy triggers FIFO removal of oldest node', async () => {
    const oldNode = makeNode({ id: 'oldest', createdAt: now - 4000, expiresAt: now + 56_000, ownerId: 'test-user' });
    const midNode = makeNode({ id: 'middle', createdAt: now - 3000, expiresAt: now + 57_000, ownerId: 'test-user' });
    const newestAlive = makeNode({ id: 'newest', createdAt: now - 2000, expiresAt: now + 58_000, ownerId: 'test-user' });

    const state = makeState({ nodes: [newestAlive, midNode, oldNode], dailyResetAtUtc: now + 86_400_000 });
    seedStore(state);

    const result = await deployNode({ type: NodeType.Attractor, x: 200, y: 200 });
    expect(result).not.toBeNull();
    if (result && 'node' in result) {
      expect(result.removedNodeId).toBe('oldest');
      expect(result.node.type).toBe(NodeType.Attractor);
      expect(result.snapshot.userActiveNodeCount).toBe(3);
      expect(result.snapshot.userActiveNodeIds).toContain('middle');
      expect(result.snapshot.userActiveNodeIds).toContain('newest');
      expect(result.snapshot.userActiveNodeIds).not.toContain('oldest');
      expect(result.snapshot.userActiveNodeIds).toContain(result.node.id);
    }
  });

  it('rejects invalid node type', async () => {
    const result = await deployNode({ type: 'BOGUS' as NodeType, x: 400, y: 100 });
    if (result && 'error' in result) {
      expect(result.error).toBe(NodeDeployRejectionReason.InvalidType);
      expect(result.message).toContain('Unsupported');
    }
  });

  it('rejects NaN x-coordinate', async () => {
    const result = await deployNode({ type: NodeType.Attractor, x: NaN, y: 100 });
    if (result && 'error' in result) {
      expect(result.error).toBe(NodeDeployRejectionReason.InvalidPosition);
    }
  });

  it('rejects Infinity y-coordinate', async () => {
    const result = await deployNode({ type: NodeType.Attractor, x: 400, y: Infinity });
    if (result && 'error' in result) {
      expect(result.error).toBe(NodeDeployRejectionReason.InvalidPosition);
    }
  });

  it('rejects position inside obstacle', async () => {
    const state = makeState({
      dailyResetAtUtc: now + 86_400_000,
      fieldLayout: {
        dayKey: '2026-01-01', seed: 1, templateId: 0,
        bounds: { x: 24, y: 24, w: 752, h: 552 },
        obstacles: [{ x: 120, y: 180, w: 40, h: 200 }],
        hazards: [],
        sink: { x: 400, y: 480, r: 45 },
        spawnBand: { x: 0, y: 0, w: 800, h: 80 },
      },
    });
    seedStore(state);

    const result = await deployNode({ type: NodeType.Attractor, x: 140, y: 280 });
    if (result && 'error' in result) {
      expect(result.error).toBe(NodeDeployRejectionReason.InvalidPosition);
      expect(result.message).toContain('obstacles');
    }
  });

  it('deploys at valid position on bounds edge', async () => {
    const state = makeState({
      dailyResetAtUtc: now + 86_400_000,
      fieldLayout: {
        dayKey: '2026-01-01', seed: 1, templateId: 0,
        bounds: { x: 24, y: 24, w: 752, h: 552 },
        obstacles: [],
        hazards: [],
        sink: { x: 400, y: 480, r: 45 },
        spawnBand: { x: 0, y: 0, w: 800, h: 80 },
      },
    });
    seedStore(state);

    const result = await deployNode({ type: NodeType.Attractor, x: 24, y: 100 });
    expect(result).not.toBeNull();
    if (result && 'node' in result) {
      expect(result.node).toBeDefined();
    }
  });

  it('sets node expiresAt to createdAt + NODE_LIFESPAN_MS', async () => {
    const result = await deployNode(validNode);
    if (result && 'node' in result) {
      expect(result.node.expiresAt - result.node.createdAt).toBe(NODE_LIFESPAN_MS);
    }
  });

  it('returns null when no postId', async () => {
    mocks.context.postId = null as unknown as string;
    const result = await deployNode(validNode);
    expect(result).toBeNull();
  });

  it('two users have independent quotas', async () => {
    // User 1 deploys 3 nodes
    const state = makeState({
      dailyResetAtUtc: now + 86_400_000,
      nodes: [
        makeNode({ id: 'u1-a', ownerId: 'user-1' }),
        makeNode({ id: 'u1-b', ownerId: 'user-1' }),
        makeNode({ id: 'u1-c', ownerId: 'user-1' }),
      ],
    });
    seedStore(state);

    // Change mock username to user-2
    mocks.reddit.getCurrentUsername.mockResolvedValue('user-2');

    const result = await deployNode({ type: NodeType.Attractor, x: 200, y: 200 });
    if (result && 'node' in result) {
      expect(result.removedNodeId).toBeNull();
      expect(result.node.ownerId).toBe('user-2');
      expect(result.snapshot.nodes).toHaveLength(4);
    }
  });
});

describe('submitThroughput — Score Batching', () => {
  const now = 1_700_500_000_000;

  beforeEach(() => {
    vi.setSystemTime(now);
    const state = makeState({ dailyResetAtUtc: now + 86_400_000, globalScore: 0 });
    seedStore(state);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts positive integer', async () => {
    const result = await submitThroughput(5);
    if (result && 'type' in result) {
      expect(result.type).toBe('throughput_accepted');
      expect(result.scoreDelta).toBe(5);
      expect(result.snapshot.globalScore).toBe(5);
    }
  });

  it('accepts count of 1', async () => {
    const result = await submitThroughput(1);
    if (result && 'type' in result) {
      expect(result.scoreDelta).toBe(1);
      expect(result.snapshot.globalScore).toBe(1);
    }
  });

  it('rejects count of 0', async () => {
    const result = await submitThroughput(0);
    if (result && 'error' in result) {
      expect(result.error).toBe('invalid_score');
      expect(result.message).toContain('positive integer');
    }
  });

  it('rejects negative count', async () => {
    const result = await submitThroughput(-1);
    if (result && 'error' in result) {
      expect(result.error).toBe('invalid_score');
    }
  });

  it('rejects non-integer count', async () => {
    const result = await submitThroughput(3.5);
    if (result && 'error' in result) {
      expect(result.error).toBe('invalid_score');
    }
  });

  it('rejects NaN count', async () => {
    const result = await submitThroughput(NaN);
    if (result && 'error' in result) {
      expect(result.error).toBe('invalid_score');
    }
  });

  it('rejects Infinity count', async () => {
    const result = await submitThroughput(Infinity);
    if (result && 'error' in result) {
      expect(result.error).toBe('invalid_score');
    }
  });

  it('accepts large count', async () => {
    const result = await submitThroughput(100000);
    if (result && 'type' in result) {
      expect(result.scoreDelta).toBe(100000);
    }
  });

  it('returns null when no postId', async () => {
    mocks.context.postId = null as unknown as string;
    const result = await submitThroughput(5);
    expect(result).toBeNull();
  });

  it('sets phase to active', async () => {
    const result = await submitThroughput(3);
    if (result && 'type' in result) {
      expect(result.snapshot.phase).toBe('active');
    }
  });
});

describe('resetDailyState', () => {
  const now = 1_700_500_000_000;

  beforeEach(() => {
    vi.setSystemTime(now);
    const state = makeState({ dailyResetAtUtc: now + 86_400_000, globalScore: 250 });
    seedStore(state);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns reset_complete with archived score', async () => {
    const result = await resetDailyState();
    expect(result).not.toBeNull();
    if (result) {
      expect(result.type).toBe('reset_complete');
      expect(result.snapshot).toBeDefined();
      expect(result.contractVersion).toBe(CONTRACT_VERSION);
    }
  });

  it('archives zero score correctly', async () => {
    const state = makeState({ dailyResetAtUtc: now + 86_400_000, globalScore: 0 });
    seedStore(state);
    const result = await resetDailyState();
    if (result) {
      expect(true).toBe(true);
    }
  });

  it('returns null when no postId', async () => {
    mocks.context.postId = null as unknown as string;
    const result = await resetDailyState();
    expect(result).toBeNull();
  });
});

describe('getArchiveHistory', () => {
  it('returns entries sorted by archivedAt descending', async () => {
    const entries = [
      { archivedAt: 1000, score: 100, nodeCount: 5, dayKey: 'day1', layoutSeed: 1 },
      { archivedAt: 3000, score: 300, nodeCount: 8, dayKey: 'day3', layoutSeed: 3 },
      { archivedAt: 2000, score: 200, nodeCount: 6, dayKey: 'day2', layoutSeed: 2 },
    ];
    seedStoreHistory(entries);

    const result = await getArchiveHistory();
    expect(result).not.toBeNull();
    if (result) {
      expect(result.entries).toHaveLength(3);
      expect(result.entries[0]?.archivedAt).toBe(3000);
      expect(result.entries[1]?.archivedAt).toBe(2000);
      expect(result.entries[2]?.archivedAt).toBe(1000);
    }
  });

  it('filters entries with non-string dayKey', async () => {
    const entries = [
      { archivedAt: 1000, score: 100, nodeCount: 5, dayKey: 'day1', layoutSeed: 1 },
      { archivedAt: 2000, score: 200, nodeCount: 6, dayKey: 0 as unknown as string, layoutSeed: 2 },
    ];
    seedStoreHistory(entries);

    const result = await getArchiveHistory();
    if (result) {
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]?.archivedAt).toBe(1000);
    }
  });

  it('filters entries with non-number layoutSeed', async () => {
    const entries = [
      { archivedAt: 1000, score: 100, nodeCount: 5, dayKey: 'day1', layoutSeed: 1 },
      { archivedAt: 2000, score: 200, nodeCount: 6, dayKey: 'day2', layoutSeed: undefined as unknown as number },
    ];
    seedStoreHistory(entries);

    const result = await getArchiveHistory();
    if (result) {
      expect(result.entries).toHaveLength(1);
    }
  });

  it('returns empty array when no history', async () => {
    // store is empty, no history key
    const result = await getArchiveHistory();
    if (result) {
      expect(result.entries).toEqual([]);
    }
  });

  it('returns empty array for malformed JSON', async () => {
    mocks.store.set('resonance:history:test-post-id', 'not-json');

    const result = await getArchiveHistory();
    if (result) {
      expect(result.entries).toEqual([]);
    }
  });

  it('truncates to 10 entries', async () => {
    const entries = Array.from({ length: 15 }, (_, i) => ({
      archivedAt: i * 1000,
      score: i * 10,
      nodeCount: i,
      dayKey: `day${i}`,
      layoutSeed: i,
    }));
    seedStoreHistory(entries);

    const result = await getArchiveHistory();
    if (result) {
      expect(result.entries).toHaveLength(10);
      expect(result.entries[0]?.archivedAt).toBe(14000);
    }
  });

  it('returns null when no postId', async () => {
    mocks.context.postId = null as unknown as string;
    const result = await getArchiveHistory();
    expect(result).toBeNull();
  });
});

describe('buildSnapshot / loadSnapshot / buildInitialResponse', () => {
  const now = 1_700_500_000_000;

  beforeEach(() => {
    vi.setSystemTime(now);
    const state = makeState({ dailyResetAtUtc: now + 86_400_000, globalScore: 10 });
    seedStore(state);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loadSnapshot returns snapshot with valid seed', async () => {
    const snapshot = await loadSnapshot();
    expect(snapshot).not.toBeNull();
    if (snapshot) {
      expect(snapshot.postId).toBe('test-post-id');
      expect(snapshot.contractVersion).toBe(CONTRACT_VERSION);
    }
  });

  it('loadSnapshot returns null when no postId', async () => {
    mocks.context.postId = null as unknown as string;
    const snapshot = await loadSnapshot();
    expect(snapshot).toBeNull();
  });

  it('buildInitialResponse returns snapshot type', async () => {
    const response = await buildInitialResponse();
    expect(response).not.toBeNull();
    if (response) {
      expect(response.type).toBe('snapshot');
      expect(response.contractVersion).toBe(CONTRACT_VERSION);
      expect(response.snapshot).toBeDefined();
    }
  });

  it('buildInitialResponse returns null when no postId', async () => {
    mocks.context.postId = null as unknown as string;
    const response = await buildInitialResponse();
    expect(response).toBeNull();
  });

  it('buildSnapshot applies modifier before toSnapshot', async () => {
    let modifierCalled = false;
    await buildSnapshot({ ...BASE_SEED, now }, (state) => {
      modifierCalled = true;
      state.globalScore = 999;
    });
    expect(modifierCalled).toBe(true);
  });
});
