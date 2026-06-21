import { GamePhase, ResponseType } from '../../../shared/api';
import type { GameInitResponse, GameSnapshot, GameState, SnapshotSeed } from '../../../shared/api';
import { generateDailyField } from '../field-generator';
import { appendHistory, loadRawState, saveState } from './persistence';
import { getRequestSeed } from './persistence';
import { parseState, pruneExpiredNodes, toSnapshot } from './helpers';
import { getCurrentUtcDayStart, getNextDailyResetAt } from './time';

type FreshStateResult = {
  state: GameState;
  archivedScore: number | null;
};

export const refreshStateForNow = async (seed: SnapshotSeed): Promise<FreshStateResult> => {
  const now = seed.now ?? Date.now();
  const rawState = await loadRawState(seed.postId);
  const state = parseState(rawState, seed);

  let archivedScore: number | null = null;

  if (now >= state.dailyResetAtUtc) {
    archivedScore = state.globalScore;
    await appendHistory(state, now);
    state.globalScore = 0;
    state.nodes = [];
    state.dailyResetAtUtc = getNextDailyResetAt(now);
    state.fieldLayout = generateDailyField(state.postId, getCurrentUtcDayStart(now));
  } else {
    pruneExpiredNodes(state, now);
  }

  state.phase = state.nodes.length > 0 ? GamePhase.Active : GamePhase.Idle;
  await saveState(state);

  return { archivedScore, state };
};

export const buildSnapshot = async (
  seed: SnapshotSeed,
  modifier?: (state: GameState) => void | Promise<void>
): Promise<{ snapshot: GameSnapshot; archivedScore: number | null; state: GameState }> => {
  const { state, archivedScore } = await refreshStateForNow(seed);
  if (modifier) {
    await modifier(state);
    await saveState(state);
  }
  const snapshot = toSnapshot(state, seed.username, archivedScore);
  return { snapshot, archivedScore, state };
};

export const loadSnapshot = async (): Promise<GameSnapshot | null> => {
  const seed = await getRequestSeed();
  if (!seed) {
    return null;
  }

  const { snapshot } = await buildSnapshot(seed);
  return snapshot;
};

export const buildInitialResponse = async (): Promise<GameInitResponse | null> => {
  const snapshot = await loadSnapshot();
  if (!snapshot) {
    return null;
  }

  return {
    contractVersion: snapshot.contractVersion,
    snapshot,
    type: ResponseType.Snapshot,
  };
};
