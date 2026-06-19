import { randomUUID } from 'node:crypto';
import { context, redis, reddit } from '@devvit/web/server';
import {
  CONTRACT_VERSION,
  DAILY_RESET_HOUR_UTC,
  MAX_ACTIVE_NODES,
  NODE_LIFESPAN_MS,
  NodeDeployRejectionReason,
  NodeType,
} from '../../shared/api';
import type {
  GameNode,
  GameInitResponse,
  GameSnapshot,
  GameState,
  NodeDeployMessage,
  ResetResponse,
  SnapshotSeed,
  ThroughputResponse,
} from '../../shared/api';

const STATE_KEY_PREFIX = 'resonance:state:';
const HISTORY_KEY_PREFIX = 'resonance:history:';

type ArchiveEntry = {
  archivedAt: number;
  score: number;
  nodeCount: number;
};

type DeployResult = {
  snapshot: GameSnapshot;
  node: GameNode;
  removedNodeId: string | null;
};

type FreshStateResult = {
  state: GameState;
  archivedScore: number | null;
};

const isNodeType = (value: string): value is NodeType => {
  return (
    value === NodeType.Attractor ||
    value === NodeType.Repeller ||
    value === NodeType.Vortex
  );
};

const isFiniteNumber = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value);
};

const getPostId = (): string | null => {
  return context.postId ?? null;
};

const getStateKey = (postId: string) => `${STATE_KEY_PREFIX}${postId}`;

const getHistoryKey = (postId: string) => `${HISTORY_KEY_PREFIX}${postId}`;

const getCurrentUtcDayStart = (now: number) => {
  const day = 86_400_000;
  return now - (now % day);
};

const getNextDailyResetAt = (now: number) => {
  return getCurrentUtcDayStart(now) + 86_400_000;
};

const getEmptyState = (seed: SnapshotSeed): GameState => {
  const now = seed.now ?? Date.now();
  return {
    contractVersion: CONTRACT_VERSION,
    postId: seed.postId,
    subredditName: seed.subredditName,
    phase: 'idle',
    dailyResetAtUtc: getNextDailyResetAt(now),
    globalScore: 0,
    nodes: [],
  };
};

const toSnapshot = (state: GameState, username: string): GameSnapshot => {
  const userNodes = state.nodes.filter((node) => node.ownerId === username);

  return {
    contractVersion: state.contractVersion,
    postId: state.postId,
    subredditName: state.subredditName,
    username,
    phase: state.phase,
    dailyResetAtUtc: state.dailyResetAtUtc,
    globalScore: state.globalScore,
    nodes: [...state.nodes],
    userActiveNodeIds: userNodes.map((node) => node.id),
    userActiveNodeCount: userNodes.length,
    userMaxActiveNodes: MAX_ACTIVE_NODES,
    selectedTool: NodeType.Attractor,
  };
};

const parseState = (value: string | null | undefined, seed: SnapshotSeed): GameState => {
  if (!value) {
    return getEmptyState(seed);
  }

  try {
    const parsed = JSON.parse(value) as Partial<GameState>;
    if (
      parsed &&
      parsed.contractVersion === CONTRACT_VERSION &&
      typeof parsed.postId === 'string' &&
      Array.isArray(parsed.nodes)
    ) {
      return {
        contractVersion: CONTRACT_VERSION,
        postId: parsed.postId,
        subredditName:
          typeof parsed.subredditName === 'string' || parsed.subredditName === null
            ? parsed.subredditName
            : seed.subredditName ?? null,
        phase:
          parsed.phase === 'booting' ||
          parsed.phase === 'idle' ||
          parsed.phase === 'active' ||
          parsed.phase === 'resetting'
            ? parsed.phase
            : 'idle',
        dailyResetAtUtc: isFiniteNumber(parsed.dailyResetAtUtc)
          ? parsed.dailyResetAtUtc
          : getNextDailyResetAt(seed.now ?? Date.now()),
        globalScore: isFiniteNumber(parsed.globalScore) ? parsed.globalScore : 0,
        nodes: parsed.nodes.filter(
          (node): node is GameNode =>
            !!node &&
            typeof node.id === 'string' &&
            isNodeType(String(node.type)) &&
            isFiniteNumber(node.x) &&
            isFiniteNumber(node.y) &&
            typeof node.ownerId === 'string' &&
            isFiniteNumber(node.createdAt) &&
            isFiniteNumber(node.expiresAt)
        ),
      };
    }
  } catch (error) {
    console.error('Failed to parse resonance state', error);
  }

  return getEmptyState(seed);
};

const saveState = async (state: GameState) => {
  await redis.set(getStateKey(state.postId), JSON.stringify(state));
};

const archiveState = async (state: GameState, archivedAt: number) => {
  const historyKey = getHistoryKey(state.postId);
  const rawHistory = await redis.get(historyKey);
  const history = rawHistory ? (JSON.parse(rawHistory) as ArchiveEntry[]) : [];
  history.push({
    archivedAt,
    score: state.globalScore,
    nodeCount: state.nodes.length,
  });
  await redis.set(historyKey, JSON.stringify(history));
};

const pruneExpiredNodes = (state: GameState, now: number) => {
  const aliveNodes = state.nodes.filter((node) => node.expiresAt > now);
  const removedNodeIds = state.nodes
    .filter((node) => node.expiresAt <= now)
    .map((node) => node.id);

  if (aliveNodes.length !== state.nodes.length) {
    state.nodes = aliveNodes;
  }

  return removedNodeIds;
};

const refreshStateForNow = async (seed: SnapshotSeed): Promise<FreshStateResult> => {
  const now = seed.now ?? Date.now();
  const rawState = await redis.get(getStateKey(seed.postId));
  const state = parseState(rawState, seed);

  let archivedScore: number | null = null;

  if (now >= state.dailyResetAtUtc) {
    archivedScore = state.globalScore;
    await archiveState(state, now);
    state.phase = 'resetting';
    state.globalScore = 0;
    state.nodes = [];
    state.dailyResetAtUtc = getNextDailyResetAt(now);
  } else {
    pruneExpiredNodes(state, now);
  }

  state.phase = state.nodes.length > 0 ? 'active' : 'idle';
  await saveState(state);

  return { archivedScore, state };
};

export const getRequestSeed = async (): Promise<SnapshotSeed | null> => {
  const postId = getPostId();
  if (!postId) {
    return null;
  }

  const [username, subredditName] = await Promise.all([
    reddit.getCurrentUsername(),
    Promise.resolve(context.subredditName ?? null),
  ]);

  return {
    postId,
    username: username ?? 'anonymous',
    subredditName,
  };
};

export const loadSnapshot = async (): Promise<GameSnapshot | null> => {
  const seed = await getRequestSeed();
  if (!seed) {
    return null;
  }

  const { state } = await refreshStateForNow(seed);
  return toSnapshot(state, seed.username);
};

export const deployNode = async (
  input: NodeDeployMessage['data']
): Promise<DeployResult | { error: NodeDeployRejectionReason; message: string } | null> => {
  const seed = await getRequestSeed();
  if (!seed) {
    return null;
  }

  const now = Date.now();
  const { state } = await refreshStateForNow({ ...seed, now });

  if (!isNodeType(input.type)) {
    return {
      error: NodeDeployRejectionReason.InvalidType,
      message: `Unsupported node type: ${input.type}`,
    };
  }

  if (!isFiniteNumber(input.x) || !isFiniteNumber(input.y)) {
    return {
      error: NodeDeployRejectionReason.InvalidPosition,
      message: 'Node position must be finite numbers',
    };
  }

  const ownerNodes = state.nodes.filter((node) => node.ownerId === seed.username);
  let removedNodeId: string | null = null;

  if (ownerNodes.length >= MAX_ACTIVE_NODES) {
    const oldestNode = [...ownerNodes].sort((a, b) => a.createdAt - b.createdAt)[0];
    if (oldestNode) {
      state.nodes = state.nodes.filter((node) => node.id !== oldestNode.id);
      removedNodeId = oldestNode.id;
    }
  }

  const node: GameNode = {
    id: `node_${randomUUID()}`,
    type: input.type,
    x: input.x,
    y: input.y,
    ownerId: seed.username,
    createdAt: now,
    expiresAt: now + NODE_LIFESPAN_MS,
  };

  state.nodes.push(node);
  state.phase = 'active';
  await saveState(state);

  return {
    snapshot: toSnapshot(state, seed.username),
    node,
    removedNodeId,
  };
};

export const submitThroughput = async (
  count: number
): Promise<
  ThroughputResponse | { error: NodeDeployRejectionReason | 'invalid_score'; message: string } | null
> => {
  const seed = await getRequestSeed();
  if (!seed) {
    return null;
  }

  if (!Number.isInteger(count) || count <= 0) {
    return {
      error: 'invalid_score',
      message: 'Score batches must be positive integers',
    };
  }

  const { state } = await refreshStateForNow(seed);
  state.globalScore += count;
  state.phase = 'active';
  await saveState(state);

  return {
    contractVersion: CONTRACT_VERSION,
    snapshot: toSnapshot(state, seed.username),
    scoreDelta: count,
    type: 'throughput_accepted',
  };
};

export const resetDailyState = async (): Promise<ResetResponse | null> => {
  const seed = await getRequestSeed();
  if (!seed) {
    return null;
  }

  const now = Date.now();
  const { state, archivedScore } = await refreshStateForNow({ ...seed, now });
  return {
    archivedScore: archivedScore ?? 0,
    contractVersion: CONTRACT_VERSION,
    snapshot: toSnapshot(state, seed.username),
    type: 'reset_complete',
  };
};

export const buildInitialResponse = async (): Promise<GameInitResponse | null> => {
  const snapshot = await loadSnapshot();
  if (!snapshot) {
    return null;
  }

  return {
    contractVersion: CONTRACT_VERSION,
    snapshot,
    type: 'snapshot' as const,
  };
};

export const apiContracts = {
  contractVersion: CONTRACT_VERSION,
  dailyResetHourUtc: DAILY_RESET_HOUR_UTC,
  maxActiveNodes: MAX_ACTIVE_NODES,
  nodeLifespanMs: NODE_LIFESPAN_MS,
};
