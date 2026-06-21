import { Hono, type Context } from 'hono';
import { context, realtime } from '@devvit/web/server';
import {
  ApiRoute,
  CONTRACT_VERSION,
  RealtimeEventType,
  ResponseType,
} from '../../shared/api';
import type {
  ErrorResponse,
  GameInitResponse,
  HistoryResponse,
  NodeDeployMessage,
  NodeDeployResponse,
  RealtimeEvent,
  ResetResponse,
  SubmitThroughputMessage,
  ThroughputResponse,
  ToolSelectMessage,
  ToolSelectResponse,
} from '../../shared/api';
import {
  buildInitialResponse,
  deployNode,
  getArchiveHistory,
  resetDailyState,
  selectTool,
  submitThroughput,
} from '../core/resonance-field';

const realtimeChannel = (postId: string) => `resonance_field_${postId}`;

const createErrorResponse = (message: string): ErrorResponse => ({
  contractVersion: CONTRACT_VERSION,
  message,
  type: ResponseType.Error,
});

const getPostId = () => context.postId ?? null;

const requirePostId = (c: Context) => {
  const postId = getPostId();
  if (!postId) {
    return {
      error: c.json<ErrorResponse>(createErrorResponse('postId is required but missing from context'), 400),
      postId: null,
    };
  }
  return { error: null, postId };
};

export const api = new Hono();

api.get(ApiRoute.Init, async (c) => {
  const { error, postId } = requirePostId(c);
  if (error) return error;

  try {
    const response = await buildInitialResponse();
    if (!response) {
      throw new Error('Failed to build initial response');
    }

    return c.json<GameInitResponse>(response);
  } catch (err) {
    console.error(`API Init Error for post ${postId}:`, err);
    const errorMessage = err instanceof Error ? `Initialization failed: ${err.message}` : 'Unknown error during initialization';
    return c.json<ErrorResponse>(createErrorResponse(errorMessage), 400);
  }
});

api.post(ApiRoute.NodeDeploy, async (c) => {
  try {
    const input = await c.req.json<NodeDeployMessage['data']>();
    const result = await deployNode(input);

    if (!result) {
      return c.json<ErrorResponse>(createErrorResponse('postId is required but missing from context'), 400);
    }

    if ('error' in result) {
      return c.json<ErrorResponse>(createErrorResponse(result.message), 400);
    }

    const postId = getPostId();
    if (postId) {
      const addedEvent: RealtimeEvent = {
        type: RealtimeEventType.NodeAdded,
        node: result.node,
      };
      void realtime.send(realtimeChannel(postId), addedEvent);

      if (result.removedNodeId) {
        const removedEvent: RealtimeEvent = {
          type: RealtimeEventType.NodeRemoved,
          nodeId: result.removedNodeId,
        };
        void realtime.send(realtimeChannel(postId), removedEvent);
      }
    }

    return c.json<NodeDeployResponse>(
      {
        contractVersion: result.snapshot.contractVersion,
        node: result.node,
        removedNodeId: result.removedNodeId,
        snapshot: result.snapshot,
        type: ResponseType.NodeDeployed,
      },
      200
    );
  } catch (err) {
    console.error('API node deploy error:', err);
    return c.json<ErrorResponse>(createErrorResponse('Node deployment failed'), 400);
  }
});

api.post(ApiRoute.Throughput, async (c) => {
  try {
    const input = await c.req.json<SubmitThroughputMessage['data']>();
    const result = await submitThroughput(input.count);

    if (!result) {
      return c.json<ErrorResponse>(createErrorResponse('postId is required but missing from context'), 400);
    }

    if ('error' in result) {
      return c.json<ErrorResponse>(createErrorResponse(result.message), 400);
    }

    const postId = getPostId();
    if (postId) {
      const scoreEvent: RealtimeEvent = {
        type: RealtimeEventType.ScoreUpdated,
        score: result.snapshot.globalScore,
        delta: result.scoreDelta,
      };
      void realtime.send(realtimeChannel(postId), scoreEvent);
    }

    return c.json<ThroughputResponse>(result, 200);
  } catch (err) {
    console.error('API throughput error:', err);
    return c.json<ErrorResponse>(createErrorResponse('Throughput submission failed'), 400);
  }
});

api.post(ApiRoute.ToolSelect, async (c) => {
  try {
    const input = await c.req.json<ToolSelectMessage['data']>();
    const result = await selectTool(input.tool);

    if (!result) {
      return c.json<ErrorResponse>(createErrorResponse('postId is required but missing from context'), 400);
    }

    if ('error' in result) {
      return c.json<ErrorResponse>(createErrorResponse(result.message), 400);
    }

    return c.json<ToolSelectResponse>(
      {
        contractVersion: result.snapshot.contractVersion,
        snapshot: result.snapshot,
        type: ResponseType.ToolSelected,
      },
      200
    );
  } catch (err) {
    console.error('API tool select error:', err);
    return c.json<ErrorResponse>(createErrorResponse('Tool selection failed'), 400);
  }
});

api.post(ApiRoute.Reset, async (c) => {
  try {
    const result = await resetDailyState();
    if (!result) {
      return c.json<ErrorResponse>(createErrorResponse('postId is required but missing from context'), 400);
    }

    return c.json<ResetResponse>(result, 200);
  } catch (err) {
    console.error('API reset error:', err);
    return c.json<ErrorResponse>(createErrorResponse('Reset failed'), 400);
  }
});

api.get(ApiRoute.History, async (c) => {
  const { error, postId } = requirePostId(c);
  if (error) return error;

  try {
    const result = await getArchiveHistory();
    if (!result) {
      return c.json<ErrorResponse>(createErrorResponse('Failed to retrieve archive history'), 500);
    }

    return c.json<HistoryResponse>(result);
  } catch (err) {
    console.error(`API History Error for post ${postId}:`, err);
    return c.json<ErrorResponse>(createErrorResponse('History retrieval failed'), 500);
  }
});
