import { describe, it, expect } from 'vitest';
import {
  CONTRACT_VERSION,
  MAX_ACTIVE_NODES,
  NODE_LIFESPAN_MS,
  DAILY_RESET_HOUR_UTC,
  NodeType,
  DeviceTier,
  detectDeviceTier,
  createEmptySnapshot,
  type SnapshotSeed,
} from '../contract';

describe('Constants', () => {
  it('CONTRACT_VERSION equals resonance-field/v1', () => {
    expect(CONTRACT_VERSION).toBe('resonance-field/v1');
  });

  it('MAX_ACTIVE_NODES equals 3', () => {
    expect(MAX_ACTIVE_NODES).toBe(3);
  });

  it('NODE_LIFESPAN_MS equals 60000', () => {
    expect(NODE_LIFESPAN_MS).toBe(60_000);
  });

  it('DAILY_RESET_HOUR_UTC equals 0', () => {
    expect(DAILY_RESET_HOUR_UTC).toBe(0);
  });
});

describe('detectDeviceTier', () => {
  it('returns Phone when width <= 480', () => {
    expect(detectDeviceTier(0)).toBe(DeviceTier.Phone);
    expect(detectDeviceTier(240)).toBe(DeviceTier.Phone);
    expect(detectDeviceTier(480)).toBe(DeviceTier.Phone);
  });

  it('returns Tablet when 480 < width <= 1024', () => {
    expect(detectDeviceTier(481)).toBe(DeviceTier.Tablet);
    expect(detectDeviceTier(750)).toBe(DeviceTier.Tablet);
    expect(detectDeviceTier(1024)).toBe(DeviceTier.Tablet);
  });

  it('returns Desktop when width > 1024', () => {
    expect(detectDeviceTier(1025)).toBe(DeviceTier.Desktop);
    expect(detectDeviceTier(1920)).toBe(DeviceTier.Desktop);
  });
});

describe('createEmptySnapshot', () => {
  const baseSeed: SnapshotSeed = {
    postId: 'post-1',
    username: 'alice',
    subredditName: 'test-sub',
    now: 1_700_000_000_000, // fixed timestamp
  };

  it('returns well-formed snapshot with all required fields', () => {
    const snapshot = createEmptySnapshot(baseSeed);
    expect(snapshot.contractVersion).toBe(CONTRACT_VERSION);
    expect(snapshot.postId).toBe('post-1');
    expect(snapshot.username).toBe('alice');
    expect(snapshot.subredditName).toBe('test-sub');
    expect(snapshot.phase).toBe('booting');
    expect(snapshot.globalScore).toBe(0);
    expect(snapshot.nodes).toEqual([]);
    expect(snapshot.userActiveNodeIds).toEqual([]);
    expect(snapshot.userActiveNodeCount).toBe(0);
    expect(snapshot.userMaxActiveNodes).toBe(MAX_ACTIVE_NODES);
    expect(snapshot.selectedTool).toBe(NodeType.Attractor);
  });

  it('dailyResetAtUtc is next midnight UTC from given now', () => {
    const now = 1_700_035_200_000;
    const dayStart = now - (now % 86_400_000);
    const expectedReset = dayStart + 86_400_000;
    const snapshot = createEmptySnapshot({ ...baseSeed, now });
    expect(snapshot.dailyResetAtUtc).toBe(expectedReset);
  });

  it('dailyResetAtUtc works for arbitrary timestamps', () => {
    const now = 1_700_050_000_000;
    const dayStart = now - (now % 86_400_000);
    const expectedReset = dayStart + 86_400_000;
    const snapshot = createEmptySnapshot({ ...baseSeed, now });
    expect(snapshot.dailyResetAtUtc).toBe(expectedReset);
  });

  it('uses Date.now() when no now provided', () => {
    const snapshot = createEmptySnapshot({
      postId: 'post-2',
      username: 'bob',
      subredditName: null,
    });
    expect(snapshot.postId).toBe('post-2');
    expect(snapshot.username).toBe('bob');
    expect(snapshot.subredditName).toBeNull();
    expect(snapshot.dailyResetAtUtc).toBeGreaterThan(0);
  });

  it('passes through custom fieldLayout', () => {
    const fieldLayout = {
      dayKey: '2026-01-01',
      seed: 42,
      templateId: 0,
      bounds: { x: 0, y: 0, w: 800, h: 600 },
      obstacles: [],
      hazards: [],
      sink: { x: 400, y: 480, r: 50 },
      spawnBand: { x: 0, y: 0, w: 800, h: 80 },
    };
    const snapshot = createEmptySnapshot({ ...baseSeed, fieldLayout });
    expect(snapshot.fieldLayout).toBe(fieldLayout);
  });
});
