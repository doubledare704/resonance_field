import { Hono } from 'hono';
import { context } from '@devvit/web/server';
import {
  buildInitialResponse,
  deployNode,
  resetDailyState,
  submitThroughput,
} from '../core/resonance-field';
import type {
  ErrorResponse,
  GameInitResponse,
  NodeDeployMessage,
  NodeDeployResponse,
  ResetResponse,
  SubmitThroughputMessage,
  ThroughputResponse,
} from '../../shared/api';

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
    const response = await buildInitialResponse();
    if (!response) {
      throw new Error('Failed to build initial response');
    }

    return c.json<GameInitResponse>(response);
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

api.post('/node-deploy', async (c) => {
  try {
    const input = await c.req.json<NodeDeployMessage['data']>();
    const result = await deployNode(input);

    if (!result) {
      return c.json<ErrorResponse>(
        {
          contractVersion: 'resonance-field/v1',
          message: 'postId is required but missing from context',
          type: 'error',
        },
        400
      );
    }

    if ('error' in result) {
      return c.json<ErrorResponse>(
        {
          contractVersion: 'resonance-field/v1',
          message: result.message,
          type: 'error',
        },
        400
      );
    }

    return c.json<NodeDeployResponse>(
      {
        contractVersion: result.snapshot.contractVersion,
        node: result.node,
        removedNodeId: result.removedNodeId,
        snapshot: result.snapshot,
        type: 'node_deployed',
      },
      200
    );
  } catch (error) {
    console.error('API node deploy error:', error);
    return c.json<ErrorResponse>(
      {
        contractVersion: 'resonance-field/v1',
        message: 'Node deployment failed',
        type: 'error',
      },
      400
    );
  }
});

api.post('/throughput', async (c) => {
  try {
    const input = await c.req.json<SubmitThroughputMessage['data']>();
    const result = await submitThroughput(input.count);

    if (!result) {
      return c.json<ErrorResponse>(
        {
          contractVersion: 'resonance-field/v1',
          message: 'postId is required but missing from context',
          type: 'error',
        },
        400
      );
    }

    if ('error' in result) {
      return c.json<ErrorResponse>(
        {
          contractVersion: 'resonance-field/v1',
          message: result.message,
          type: 'error',
        },
        400
      );
    }

    return c.json<ThroughputResponse>(result, 200);
  } catch (error) {
    console.error('API throughput error:', error);
    return c.json<ErrorResponse>(
      {
        contractVersion: 'resonance-field/v1',
        message: 'Throughput submission failed',
        type: 'error',
      },
      400
    );
  }
});

api.post('/reset', async (c) => {
  try {
    const result = await resetDailyState();
    if (!result) {
      return c.json<ErrorResponse>(
        {
          contractVersion: 'resonance-field/v1',
          message: 'postId is required but missing from context',
          type: 'error',
        },
        400
      );
    }

    return c.json<ResetResponse>(result, 200);
  } catch (error) {
    console.error('API reset error:', error);
    return c.json<ErrorResponse>(
      {
        contractVersion: 'resonance-field/v1',
        message: 'Reset failed',
        type: 'error',
      },
      400
    );
  }
});
