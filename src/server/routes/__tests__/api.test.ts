import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildInitialResponse: vi.fn(),
  deployNode: vi.fn(),
  submitThroughput: vi.fn(),
  resetDailyState: vi.fn(),
  getArchiveHistory: vi.fn(),
}));

vi.mock('../../core/resonance-field', () => ({
  buildInitialResponse: mocks.buildInitialResponse,
  deployNode: mocks.deployNode,
  submitThroughput: mocks.submitThroughput,
  resetDailyState: mocks.resetDailyState,
  getArchiveHistory: mocks.getArchiveHistory,
}));

const ctx = vi.hoisted(() => ({
  postId: 'test-post-id',
}));

vi.mock('@devvit/web/server', () => ({
  context: ctx,
}));

import { api } from '../api';
import { CONTRACT_VERSION, NodeType } from '../../../shared/api';

beforeEach(() => {
  vi.clearAllMocks();
  ctx.postId = 'test-post-id';
});

describe('GET /api/init', () => {
  it('returns 200 with GameInitResponse on success', async () => {
    mocks.buildInitialResponse.mockResolvedValue({
      type: 'snapshot',
      contractVersion: CONTRACT_VERSION,
      snapshot: { postId: 'test-post-id', globalScore: 0 },
    });

    const req = new Request('http://localhost/init');
    const res = await api.fetch(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.type).toBe('snapshot');
  });

  it('returns 400 when buildInitialResponse returns null', async () => {
    mocks.buildInitialResponse.mockResolvedValue(null);

    const req = new Request('http://localhost/init');
    const res = await api.fetch(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.type).toBe('error');
  });
});

describe('POST /api/node-deploy', () => {
  it('returns 200 with NodeDeployResponse on success', async () => {
    mocks.deployNode.mockResolvedValue({
      snapshot: { contractVersion: CONTRACT_VERSION },
      node: { id: 'n1', type: NodeType.Attractor, x: 400, y: 100, ownerId: 'u1', createdAt: 1, expiresAt: 60001 },
      removedNodeId: null,
    });

    const req = new Request('http://localhost/node-deploy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: NodeType.Attractor, x: 400, y: 100 }),
    });
    const res = await api.fetch(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.type).toBe('node_deployed');
    expect(body.removedNodeId).toBeNull();
  });

  it('returns 400 when deployNode returns null', async () => {
    mocks.deployNode.mockResolvedValue(null);

    const req = new Request('http://localhost/node-deploy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: NodeType.Attractor, x: 400, y: 100 }),
    });
    const res = await api.fetch(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when deployNode returns error', async () => {
    mocks.deployNode.mockResolvedValue({
      error: 'quota_exceeded',
      message: 'Quota exceeded',
    });

    const req = new Request('http://localhost/node-deploy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: NodeType.Attractor, x: 400, y: 100 }),
    });
    const res = await api.fetch(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.type).toBe('error');
    expect(body.message).toBe('Quota exceeded');
  });
});

describe('POST /api/throughput', () => {
  it('returns 200 with ThroughputResponse on success', async () => {
    mocks.submitThroughput.mockResolvedValue({
      type: 'throughput_accepted',
      contractVersion: CONTRACT_VERSION,
      snapshot: { globalScore: 5 },
      scoreDelta: 5,
    });

    const req = new Request('http://localhost/throughput', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ count: 5 }),
    });
    const res = await api.fetch(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.type).toBe('throughput_accepted');
    expect(body.scoreDelta).toBe(5);
  });

  it('returns 400 when submitThroughput returns null', async () => {
    mocks.submitThroughput.mockResolvedValue(null);

    const req = new Request('http://localhost/throughput', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ count: 5 }),
    });
    const res = await api.fetch(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when submitThroughput returns error', async () => {
    mocks.submitThroughput.mockResolvedValue({
      error: 'invalid_score',
      message: 'Score batches must be positive integers',
    });

    const req = new Request('http://localhost/throughput', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ count: 0 }),
    });
    const res = await api.fetch(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.type).toBe('error');
  });
});

describe('POST /api/reset', () => {
  it('returns 200 with ResetResponse on success', async () => {
    mocks.resetDailyState.mockResolvedValue({
      type: 'reset_complete',
      contractVersion: CONTRACT_VERSION,
      snapshot: { globalScore: 0 },
      archivedScore: 250,
    });

    const req = new Request('http://localhost/reset', { method: 'POST' });
    const res = await api.fetch(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.type).toBe('reset_complete');
    expect(body.archivedScore).toBe(250);
  });

  it('returns 400 when resetDailyState returns null', async () => {
    mocks.resetDailyState.mockResolvedValue(null);

    const req = new Request('http://localhost/reset', { method: 'POST' });
    const res = await api.fetch(req);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/history', () => {
  it('returns 200 with HistoryResponse on success', async () => {
    mocks.getArchiveHistory.mockResolvedValue({
      entries: [{ archivedAt: 1000, score: 100, nodeCount: 5, dayKey: 'd1', layoutSeed: 1 }],
    });

    const req = new Request('http://localhost/history');
    const res = await api.fetch(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.entries).toHaveLength(1);
  });

  it('returns 500 when getArchiveHistory returns null', async () => {
    mocks.getArchiveHistory.mockResolvedValue(null);

    const req = new Request('http://localhost/history');
    const res = await api.fetch(req);
    expect(res.status).toBe(500);
  });
});
