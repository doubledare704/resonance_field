import { context, redis, reddit } from '@devvit/web/server';
import { RedisKeyPrefix } from '../../../shared/api';
import type { ArchiveEntry, GameState } from '../../../shared/api';

const getPostId = (): string | null => context.postId ?? null;

export const getStateKey = (postId: string) => `${RedisKeyPrefix.State}${postId}`;

export const getHistoryKey = (postId: string) => `${RedisKeyPrefix.History}${postId}`;

export const loadRawState = async (postId: string): Promise<string | null> => {
  const value = await redis.get(getStateKey(postId));
  return value ?? null;
};

export const saveState = async (state: GameState) => {
  await redis.set(getStateKey(state.postId), JSON.stringify(state));
};

export const loadHistory = async (postId: string): Promise<ArchiveEntry[]> => {
  const rawHistory = await redis.get(getHistoryKey(postId));
  if (!rawHistory) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawHistory);
    if (Array.isArray(parsed)) {
      return parsed as ArchiveEntry[];
    }
  } catch {
    return [];
  }

  return [];
};

export const appendHistory = async (state: GameState, archivedAt: number) => {
  const history = await loadHistory(state.postId);
  history.push({
    archivedAt,
    score: state.globalScore,
    nodeCount: state.nodes.length,
    dayKey: state.fieldLayout?.dayKey ?? '',
    layoutSeed: state.fieldLayout?.seed ?? 0,
  });
  await redis.set(getHistoryKey(state.postId), JSON.stringify(history));
};

export const getRequestContext = async (): Promise<{
  postId: string | null;
  username: string;
  subredditName: string | null;
}> => {
  const [postId, username, subredditName] = await Promise.all([
    Promise.resolve(getPostId()),
    reddit.getCurrentUsername(),
    Promise.resolve(context.subredditName ?? null),
  ]);

  return {
    postId,
    subredditName,
    username: username ?? 'anonymous',
  };
};

export const getRequestSeed = async () => {
  const { postId, subredditName, username } = await getRequestContext();
  if (!postId) {
    return null;
  }

  return {
    postId,
    subredditName,
    username,
  };
};
