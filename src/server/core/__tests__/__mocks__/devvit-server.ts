import { vi } from 'vitest';

export type DevvitMocks = ReturnType<typeof createDevvitMocks>;

export const createDevvitMocks = () => {
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

  const resetStore = () => {
    store.clear();
    context.postId = 'test-post-id';
    context.subredditName = 'test-subreddit';
    reddit.getCurrentUsername.mockResolvedValue('test-user');
    redis.get.mockClear();
    redis.set.mockClear();
    reddit.getCurrentUsername.mockClear();
  };

  return { store, redis, context, reddit, resetStore };
};
