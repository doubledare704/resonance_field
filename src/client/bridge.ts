import { connectRealtime } from '@devvit/web/client';
import { ApiRoute } from '../shared/api';
import type {
  ErrorResponse,
  GameInitResponse,
  HistoryResponse,
  NodeDeployMessage,
  NodeDeployResponse,
  ResetResponse,
  SubmitThroughputMessage,
  ThroughputResponse,
  ToolSelectMessage,
  ToolSelectResponse,
} from '../shared/api';

type ApiSuccess<T> = {
  ok: true;
  data: T;
};

type ApiFailure = {
  ok: false;
  error: ErrorResponse;
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

const requestJson = async <T>(
  path: string,
  init?: RequestInit
): Promise<ApiResult<T>> => {
  const response = await fetch(path, {
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const payload = (await response.json()) as T | ErrorResponse;

  if (!response.ok) {
    return {
      error: payload as ErrorResponse,
      ok: false,
    };
  }

  return {
    data: payload as T,
    ok: true,
  };
};

export const requestInitialSnapshot = async (): Promise<ApiResult<GameInitResponse>> => {
  return requestJson<GameInitResponse>(`/api${ApiRoute.Init}`);
};

export const deployNodeRequest = async (
  node: NodeDeployMessage['data']
): Promise<ApiResult<NodeDeployResponse>> => {
  return requestJson<NodeDeployResponse>(`/api${ApiRoute.NodeDeploy}`, {
    body: JSON.stringify(node),
    method: 'POST',
  });
};

export const submitThroughputRequest = async (
  count: SubmitThroughputMessage['data']['count']
): Promise<ApiResult<ThroughputResponse>> => {
  return requestJson<ThroughputResponse>(`/api${ApiRoute.Throughput}`, {
    body: JSON.stringify({ count }),
    method: 'POST',
  });
};

export const resetDailyStateRequest = async (): Promise<ApiResult<ResetResponse>> => {
  return requestJson<ResetResponse>(`/api${ApiRoute.Reset}`, {
    method: 'POST',
  });
};

export const requestArchiveHistory = async (): Promise<ApiResult<HistoryResponse>> => {
  return requestJson<HistoryResponse>(`/api${ApiRoute.History}`);
};

export const selectToolRequest = async (
  tool: ToolSelectMessage['data']['tool']
): Promise<ApiResult<ToolSelectResponse>> => {
  return requestJson<ToolSelectResponse>(`/api${ApiRoute.ToolSelect}`, {
    body: JSON.stringify({ tool }),
    method: 'POST',
  });
};


export type GameBridge = {
  deployNodeRequest: typeof deployNodeRequest;
  requestArchiveHistory: typeof requestArchiveHistory;
  requestInitialSnapshot: typeof requestInitialSnapshot;
  selectToolRequest: typeof selectToolRequest;
  submitThroughputRequest: typeof submitThroughputRequest;
  connectRealtime: typeof connectRealtime;
};

export const gameBridge: GameBridge = {
  connectRealtime,
  deployNodeRequest,
  requestArchiveHistory,
  requestInitialSnapshot,
  selectToolRequest,
  submitThroughputRequest,
};
