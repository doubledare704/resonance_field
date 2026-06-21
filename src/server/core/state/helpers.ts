import {
  CONTRACT_VERSION,
  GamePhase,
  MAX_ACTIVE_NODES,
  NodeType,
} from '../../../shared/api';
import type { GameNode, GameSnapshot, GameState, SnapshotSeed } from '../../../shared/api';
import { generateDailyField } from '../field-generator';
import { getNextDailyResetAt } from './time';

export const isNodeType = (value: string): value is NodeType => {
  return value === NodeType.Attractor || value === NodeType.Repeller || value === NodeType.Vortex;
};

export const isFiniteNumber = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value);
};

export const isGamePhase = (value: unknown): value is GamePhase =>
  typeof value === 'string' && Object.values(GamePhase).includes(value as GamePhase);

export const parseSelectedTools = (raw: unknown): Record<string, NodeType> => {
  if (raw && typeof raw === 'object') {
    const entries = Object.entries(raw as Record<string, unknown>);
    const result: Record<string, NodeType> = {};
    for (const [username, value] of entries) {
      if (typeof value === 'string' && isNodeType(value)) {
        result[username] = value;
      }
    }
    return result;
  }
  return {};
};

const getCurrentUtcDayStart = (now: number) => {
  const day = 86_400_000;
  return now - (now % day);
};

export const getEmptyState = (seed: SnapshotSeed): GameState => {
  const now = seed.now ?? Date.now();
  const fieldLayout = seed.fieldLayout ?? generateDailyField(seed.postId, getCurrentUtcDayStart(now));
  return {
    contractVersion: CONTRACT_VERSION,
    postId: seed.postId,
    subredditName: seed.subredditName,
    phase: GamePhase.Idle,
    dailyResetAtUtc: getNextDailyResetAt(now),
    globalScore: 0,
    nodes: [],
    selectedTools: {},
    fieldLayout,
  };
};

export const toSnapshot = (
  state: GameState,
  username: string,
  archivedScore?: number | null
): GameSnapshot => {
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
    selectedTool: state.selectedTools[username] ?? NodeType.Attractor,
    fieldLayout: state.fieldLayout,
    lastArchivedScore: archivedScore ?? undefined,
  };
};

export const parseState = (value: string | null | undefined, seed: SnapshotSeed): GameState => {
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
      const now = seed.now ?? Date.now();
      let fieldLayout = parsed.fieldLayout;
      if (!fieldLayout) {
        fieldLayout = generateDailyField(parsed.postId, getCurrentUtcDayStart(now));
      }

      return {
        contractVersion: CONTRACT_VERSION,
        postId: parsed.postId,
        subredditName:
          typeof parsed.subredditName === 'string' || parsed.subredditName === null
            ? parsed.subredditName
            : seed.subredditName ?? null,
        phase: isGamePhase(parsed.phase) ? parsed.phase : GamePhase.Idle,
        dailyResetAtUtc: isFiniteNumber(parsed.dailyResetAtUtc)
          ? parsed.dailyResetAtUtc
          : getNextDailyResetAt(now),
        globalScore: isFiniteNumber(parsed.globalScore) ? parsed.globalScore : 0,
        selectedTools: parseSelectedTools(parsed.selectedTools),
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
        fieldLayout,
      };
    }
  } catch (error) {
    console.error('Failed to parse resonance state', error);
  }

  return getEmptyState(seed);
};

export const pruneExpiredNodes = (state: GameState, now: number) => {
  const aliveNodes = state.nodes.filter((node) => node.expiresAt > now);
  const removedNodeIds = state.nodes.filter((node) => node.expiresAt <= now).map((node) => node.id);

  if (aliveNodes.length !== state.nodes.length) {
    state.nodes = aliveNodes;
  }

  return removedNodeIds;
};
