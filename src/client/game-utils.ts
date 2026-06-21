import { NodeDeployRejectionReason, RealtimeEventType } from '../shared/api';
import type { RealtimeEvent } from '../shared/api';

export const deriveDeployRejectionReason = (message: string): NodeDeployRejectionReason => {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('position')) {
    return NodeDeployRejectionReason.InvalidPosition;
  }

  if (lowerMessage.includes('type')) {
    return NodeDeployRejectionReason.InvalidType;
  }

  if (lowerMessage.includes('quota')) {
    return NodeDeployRejectionReason.QuotaExceeded;
  }

  return NodeDeployRejectionReason.SyncRequired;
};

const hasProperty = <K extends string>(obj: object, key: K): obj is Record<K, unknown> =>
  key in obj;

export const isRealtimeEvent = (data: unknown): data is RealtimeEvent => {
  if (!data || typeof data !== 'object') {
    return false;
  }
  if (!hasProperty(data, 'type') || typeof data.type !== 'string') {
    return false;
  }

  if (data.type === RealtimeEventType.NodeAdded) {
    return hasProperty(data, 'node') && typeof data.node === 'object' && data.node !== null;
  }
  if (data.type === RealtimeEventType.NodeRemoved) {
    return hasProperty(data, 'nodeId') && typeof data.nodeId === 'string';
  }
  if (data.type === RealtimeEventType.ScoreUpdated) {
    return (
      hasProperty(data, 'score') &&
      typeof data.score === 'number' &&
      hasProperty(data, 'delta') &&
      typeof data.delta === 'number'
    );
  }
  return false;
};

export const formatCountdown = (targetUtcMs: number) => {
  const remaining = Math.max(0, targetUtcMs - Date.now());
  const totalSeconds = Math.floor(remaining / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

export const formatDayKey = (dayKey: string) => {
  const date = new Date(dayKey);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const formatRelativeTime = (elapsedMs: number) => {
  if (elapsedMs < 2000) return '(just now)';
  const seconds = Math.floor(elapsedMs / 1000);
  if (seconds < 60) return `(${seconds}s ago)`;
  const minutes = Math.floor(seconds / 60);
  return `(${minutes}m ago)`;
};
