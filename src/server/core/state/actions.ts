import { randomUUID } from 'node:crypto';
import {
  GamePhase,
  MAX_ACTIVE_NODES,
  NODE_LIFESPAN_MS,
  NodeDeployRejectionReason,
  NodeType,
  ResponseType,
} from '../../../shared/api';
import type {
  GameNode,
  GameSnapshot,
  HistoryResponse,
  NodeDeployMessage,
  ResetResponse,
  ThroughputResponse,
} from '../../../shared/api';
import { isValidDeployPosition } from '../field-validation';
import { isFiniteNumber, isNodeType, toSnapshot } from './helpers';
import { getRequestSeed, loadHistory, saveState } from './persistence';
import { buildSnapshot, refreshStateForNow } from './snapshot';

type DeployResult = {
  snapshot: GameSnapshot;
  node: GameNode;
  removedNodeId: string | null;
};

export const deployNode = async (
  input: NodeDeployMessage['data']
): Promise<DeployResult | { error: NodeDeployRejectionReason; message: string } | null> => {
  const seed = await getRequestSeed();
  if (!seed) {
    return null;
  }

  const now = Date.now();
  const { state, archivedScore } = await refreshStateForNow({ ...seed, now });

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

  if (state.fieldLayout && !isValidDeployPosition(state.fieldLayout, input.x, input.y)) {
    return {
      error: NodeDeployRejectionReason.InvalidPosition,
      message: 'Cannot deploy node inside obstacles, hazards, or sink',
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
  state.phase = GamePhase.Active;
  await saveState(state);

  return {
    snapshot: toSnapshot(state, seed.username, archivedScore),
    node,
    removedNodeId,
  };
};

export const submitThroughput = async (
  count: number
): Promise<ThroughputResponse | { error: 'invalid_score'; message: string } | null> => {
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

  const { snapshot } = await buildSnapshot(seed, (state) => {
    state.globalScore += count;
    state.phase = GamePhase.Active;
  });

  return {
    contractVersion: snapshot.contractVersion,
    snapshot,
    scoreDelta: count,
    type: ResponseType.ThroughputAccepted,
  };
};

export const selectTool = async (
  tool: NodeType
): Promise<{ snapshot: GameSnapshot } | { error: 'invalid_tool'; message: string } | null> => {
  const seed = await getRequestSeed();
  if (!seed) {
    return null;
  }

  if (!isNodeType(tool)) {
    return {
      error: 'invalid_tool',
      message: `Invalid tool type: ${tool}`,
    };
  }

  const { state, archivedScore } = await refreshStateForNow(seed);
  state.selectedTools[seed.username] = tool;
  await saveState(state);
  const snapshot = toSnapshot(state, seed.username, archivedScore);

  return { snapshot };
};

export const resetDailyState = async (): Promise<ResetResponse | null> => {
  const seed = await getRequestSeed();
  if (!seed) {
    return null;
  }

  const now = Date.now();
  const { snapshot, archivedScore } = await buildSnapshot({ ...seed, now });
  return {
    archivedScore: archivedScore ?? 0,
    contractVersion: snapshot.contractVersion,
    snapshot,
    type: ResponseType.ResetComplete,
  };
};

export const getArchiveHistory = async (): Promise<HistoryResponse | null> => {
  const seed = await getRequestSeed();
  if (!seed) {
    return null;
  }

  const history = await loadHistory(seed.postId);

  const sorted = history
    .filter((entry) => typeof entry.dayKey === 'string' && typeof entry.layoutSeed === 'number')
    .sort((a, b) => b.archivedAt - a.archivedAt)
    .slice(0, 10);

  return { entries: sorted };
};
