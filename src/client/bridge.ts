import type {
  ErrorResponse,
  GameInitResponse,
  NodeDeployMessage,
  NodeDeployResponse,
  ResetResponse,
  SubmitThroughputMessage,
  ThroughputResponse,
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
  return requestJson<GameInitResponse>('/api/init');
};

export const deployNodeRequest = async (
  node: NodeDeployMessage['data']
): Promise<ApiResult<NodeDeployResponse>> => {
  return requestJson<NodeDeployResponse>('/api/node-deploy', {
    body: JSON.stringify(node),
    method: 'POST',
  });
};

export const submitThroughputRequest = async (
  count: SubmitThroughputMessage['data']['count']
): Promise<ApiResult<ThroughputResponse>> => {
  return requestJson<ThroughputResponse>('/api/throughput', {
    body: JSON.stringify({ count }),
    method: 'POST',
  });
};

export const resetDailyStateRequest = async (): Promise<ApiResult<ResetResponse>> => {
  return requestJson<ResetResponse>('/api/reset', {
    method: 'POST',
  });
};

