import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import { createEmptySnapshot } from '../../shared/api';
import type { ErrorResponse, GameInitResponse } from '../../shared/api';

export const api = new Hono();

api.get('/init', async (c) => {
  const { postId } = context;

  if (!postId) {
    console.error('API Init Error: postId not found in devvit context');
    return c.json<ErrorResponse>(
      {
        contractVersion: 'resonance-field/v1',
        message: 'postId is required but missing from context',
        type: 'error',
      },
      400
    );
  }

  try {
    const [username, subredditName, storedScore] = await Promise.all([
      reddit.getCurrentUsername(),
      Promise.resolve(context.subredditName ?? null),
      redis.get('resonance:global_score'),
    ]);

    const snapshot = createEmptySnapshot({
      postId: postId,
      username: username ?? 'anonymous',
      subredditName,
    });

    if (storedScore) {
      snapshot.globalScore = Number.parseInt(storedScore, 10) || 0;
    }

    return c.json<GameInitResponse>({
      contractVersion: snapshot.contractVersion,
      snapshot,
      type: 'snapshot',
    });
  } catch (error) {
    console.error(`API Init Error for post ${postId}:`, error);
    let errorMessage = 'Unknown error during initialization';
    if (error instanceof Error) {
      errorMessage = `Initialization failed: ${error.message}`;
    }
    return c.json<ErrorResponse>(
      { contractVersion: 'resonance-field/v1', message: errorMessage, type: 'error' },
      400
    );
  }
});
