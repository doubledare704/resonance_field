import type { FieldCircle, FieldLayout, FieldRect } from './field-layout';

export const CONTRACT_VERSION = 'resonance-field/v1';
export const MAX_ACTIVE_NODES = 3;
export const NODE_LIFESPAN_MS = 60_000;
export const DAILY_RESET_HOUR_UTC = 0;

export type { FieldCircle, FieldLayout, FieldRect };

export enum NodeType {
  Attractor = 'ATTRACTOR',
  Repeller = 'REPELLER',
  Vortex = 'VORTEX',
}

export enum GamePhase {
  Booting = 'booting',
  Idle = 'idle',
  Active = 'active',
}

export enum NodeRemovalReason {
  Expired = 'expired',
  Quota = 'quota',
  Manual = 'manual',
  Reset = 'reset',
}

export enum NodeDeployRejectionReason {
  QuotaExceeded = 'quota_exceeded',
  InvalidType = 'invalid_type',
  InvalidPosition = 'invalid_position',
  SyncRequired = 'sync_required',
}

export enum BridgeMessageType {
  NodeDeploy = 'NODE_DEPLOY',
  SubmitThroughput = 'SUBMIT_THROUGHPUT',
  ToolSelect = 'TOOL_SELECT',
  InitialSnapshot = 'INITIAL_SNAPSHOT',
  NodeAdded = 'NODE_ADDED',
  NodeRemoved = 'NODE_REMOVED',
  GlobalScoreUpdated = 'GLOBAL_SCORE_UPDATED',
  NodeDeployRejected = 'NODE_DEPLOY_REJECTED',
  SyncError = 'SYNC_ERROR',
}

export enum ScoreUpdateReason {
  Batch = 'batch',
  Reset = 'reset',
}

export enum ResponseType {
  Snapshot = 'snapshot',
  NodeDeployed = 'node_deployed',
  ThroughputAccepted = 'throughput_accepted',
  ToolSelected = 'tool_selected',
  ResetComplete = 'reset_complete',
  Error = 'error',
}

export enum RealtimeEventType {
  NodeAdded = 'node_added',
  NodeRemoved = 'node_removed',
  ScoreUpdated = 'score_updated',
}

export enum ApiRoute {
  Init = '/init',
  NodeDeploy = '/node-deploy',
  Throughput = '/throughput',
  ToolSelect = '/tool-select',
  Reset = '/reset',
  History = '/history',
}

export enum RedisKeyPrefix {
  State = 'resonance:state:',
  History = 'resonance:history:',
}

export type GameNode = {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  ownerId: string;
  createdAt: number;
  expiresAt: number;
};

export type GameSnapshot = {
  contractVersion: typeof CONTRACT_VERSION;
  postId: string;
  subredditName: string | null;
  username: string;
  phase: GamePhase;
  dailyResetAtUtc: number;
  globalScore: number;
  nodes: GameNode[];
  userActiveNodeIds: string[];
  userActiveNodeCount: number;
  userMaxActiveNodes: typeof MAX_ACTIVE_NODES;
  selectedTool: NodeType;
  fieldLayout?: FieldLayout | undefined;
  lastArchivedScore?: number | undefined;
};

export type GameState = {
  contractVersion: typeof CONTRACT_VERSION;
  postId: string;
  subredditName: string | null;
  phase: GamePhase;
  dailyResetAtUtc: number;
  globalScore: number;
  nodes: GameNode[];
  // Tool selection is a per-user preference, not a shared post-level value.
  // Storing it as a map keyed by username keeps one viewer's choice from
  // overwriting another's for the same cooperative post.
  selectedTools: Record<string, NodeType>;
  fieldLayout?: FieldLayout | undefined;
};

export type NodeDeployMessage = {
  type: BridgeMessageType.NodeDeploy;
  data: {
    type: NodeType;
    x: number;
    y: number;
  };
};

export type SubmitThroughputMessage = {
  type: BridgeMessageType.SubmitThroughput;
  data: {
    count: number;
  };
};

export type ToolSelectMessage = {
  type: BridgeMessageType.ToolSelect;
  data: {
    tool: NodeType;
  };
};

export type InitialSnapshotMessage = {
  type: BridgeMessageType.InitialSnapshot;
  data: GameSnapshot;
};

export type NodeAddedMessage = {
  type: BridgeMessageType.NodeAdded;
  data: {
    node: GameNode;
  };
};

export type NodeRemovedMessage = {
  type: BridgeMessageType.NodeRemoved;
  data: {
    nodeId: string;
    reason: NodeRemovalReason;
  };
};

export type GlobalScoreUpdatedMessage = {
  type: BridgeMessageType.GlobalScoreUpdated;
  data: {
    score: number;
    delta: number;
    reason: ScoreUpdateReason;
  };
};

export type NodeDeployRejectedMessage = {
  type: BridgeMessageType.NodeDeployRejected;
  data: {
    reason: NodeDeployRejectionReason;
    message: string;
    requested: NodeDeployMessage['data'];
  };
};

export type SyncErrorMessage = {
  type: BridgeMessageType.SyncError;
  data: {
    message: string;
  };
};

export type ServerBridgeMessage =
  | InitialSnapshotMessage
  | NodeAddedMessage
  | NodeRemovedMessage
  | GlobalScoreUpdatedMessage
  | NodeDeployRejectedMessage
  | SyncErrorMessage;

export type GameInitResponse = {
  type: ResponseType.Snapshot;
  contractVersion: typeof CONTRACT_VERSION;
  snapshot: GameSnapshot;
};

export type NodeDeployResponse = {
  type: ResponseType.NodeDeployed;
  contractVersion: typeof CONTRACT_VERSION;
  snapshot: GameSnapshot;
  node: GameNode;
  removedNodeId: string | null;
};

export type ThroughputResponse = {
  type: ResponseType.ThroughputAccepted;
  contractVersion: typeof CONTRACT_VERSION;
  snapshot: GameSnapshot;
  scoreDelta: number;
};

export type ToolSelectResponse = {
  type: ResponseType.ToolSelected;
  contractVersion: typeof CONTRACT_VERSION;
  snapshot: GameSnapshot;
};

export type ArchiveEntry = {
  archivedAt: number;
  score: number;
  nodeCount: number;
  dayKey: string;
  layoutSeed: number;
};

export type HistoryResponse = {
  entries: ArchiveEntry[];
};

export type ResetResponse = {
  type: ResponseType.ResetComplete;
  contractVersion: typeof CONTRACT_VERSION;
  snapshot: GameSnapshot;
  archivedScore: number;
};

export type ErrorResponse = {
  type: ResponseType.Error;
  contractVersion: typeof CONTRACT_VERSION;
  message: string;
};

/** Compact payloads sent over the Devvit realtime channel (kept under 200 bytes). */
export type RealtimeEvent =
  | { type: RealtimeEventType.NodeAdded; node: GameNode }
  | { type: RealtimeEventType.NodeRemoved; nodeId: string }
  | { type: RealtimeEventType.ScoreUpdated; score: number; delta: number };



export type SnapshotSeed = {
  postId: string;
  username: string;
  subredditName: string | null;
  now?: number;
  fieldLayout?: FieldLayout;
};

export const createEmptySnapshot = ({
  postId,
  username,
  subredditName,
  now = Date.now(),
  fieldLayout,
}: SnapshotSeed): GameSnapshot => {
  return {
    contractVersion: CONTRACT_VERSION,
    postId,
    subredditName,
    username,
    phase: GamePhase.Booting,
    dailyResetAtUtc: now - (now % 86_400_000) + 86_400_000,
    globalScore: 0,
    nodes: [],
    userActiveNodeIds: [],
    userActiveNodeCount: 0,
    userMaxActiveNodes: MAX_ACTIVE_NODES,
    selectedTool: NodeType.Attractor,
    fieldLayout,
  };
};
