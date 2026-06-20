import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  requestInitialSnapshot,
  deployNodeRequest,
  submitThroughputRequest,
  resetDailyStateRequest,
  requestArchiveHistory,
} from '../bridge';
import { NodeType } from '../../shared/api';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

function mockResponse(body: unknown, ok = true, status = 200) {
  mockFetch.mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
}

describe('requestInitialSnapshot', () => {
  it('returns ok: true on success', async () => {
    mockResponse({ type: 'snapshot', snapshot: {}, contractVersion: 'v1' });
    const result = await requestInitialSnapshot();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.type).toBe('snapshot');
    }
  });

  it('returns ok: false on HTTP error', async () => {
    mockResponse({ type: 'error', message: 'fail', contractVersion: 'v1' }, false, 400);
    const result = await requestInitialSnapshot();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe('error');
    }
  });

  it('calls /api/init endpoint', async () => {
    mockResponse({ type: 'snapshot', snapshot: {}, contractVersion: 'v1' });
    await requestInitialSnapshot();
    expect(mockFetch).toHaveBeenCalledWith('/api/init', expect.objectContaining({
      headers: expect.objectContaining({ 'content-type': 'application/json' }),
    }));
  });
});

describe('deployNodeRequest', () => {
  it('sends POST to /api/node-deploy with node data', async () => {
    mockResponse({ type: 'node_deployed', node: {}, snapshot: {}, removedNodeId: null, contractVersion: 'v1' });
    const result = await deployNodeRequest({ type: NodeType.Vortex, x: 300, y: 200 });
    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith('/api/node-deploy', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ type: NodeType.Vortex, x: 300, y: 200 }),
    }));
  });

  it('returns error on failure', async () => {
    mockResponse({ type: 'error', message: 'bad', contractVersion: 'v1' }, false, 400);
    const result = await deployNodeRequest({ type: NodeType.Attractor, x: 400, y: 100 });
    expect(result.ok).toBe(false);
  });
});

describe('submitThroughputRequest', () => {
  it('sends POST to /api/throughput with count', async () => {
    mockResponse({ type: 'throughput_accepted', snapshot: {}, scoreDelta: 5, contractVersion: 'v1' });
    const result = await submitThroughputRequest(5);
    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith('/api/throughput', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ count: 5 }),
    }));
  });
});

describe('resetDailyStateRequest', () => {
  it('sends POST to /api/reset', async () => {
    mockResponse({ type: 'reset_complete', snapshot: {}, archivedScore: 100, contractVersion: 'v1' });
    const result = await resetDailyStateRequest();
    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith('/api/reset', expect.objectContaining({
      method: 'POST',
    }));
  });
});

describe('requestArchiveHistory', () => {
  it('calls GET /api/history', async () => {
    mockResponse({ entries: [] });
    const result = await requestArchiveHistory();
    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith('/api/history', expect.objectContaining({
      headers: expect.objectContaining({ 'content-type': 'application/json' }),
    }));
  });
});
