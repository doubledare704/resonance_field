export const CONTRACT_VERSION = 'resonance-field/v1';
export const MAX_ACTIVE_NODES = 3;
export const NODE_LIFESPAN_MS = 60_000;
export const DAILY_RESET_HOUR_UTC = 0;

export type FieldRect = { x: number; y: number; w: number; h: number };
export type FieldCircle = { x: number; y: number; r: number };

export type FieldLayout = {
  dayKey: string;
  seed: number;
  templateId: number;
  bounds: FieldRect;
  obstacles: FieldRect[];
  hazards: FieldCircle[];
  sink: FieldCircle;
  spawnBand: FieldRect;
};

export enum NodeType {
  Attractor = 'ATTRACTOR',
  Repeller = 'REPELLER',
  Vortex = 'VORTEX',
}

export enum DeviceTier {
  Phone = 'phone',
  Tablet = 'tablet',
  Desktop = 'desktop',
}

const TIER_BREAKPOINTS = {
  phoneMax: 480,
  tabletMax: 1024,
} as const;

export const detectDeviceTier = (canvasWidth: number): DeviceTier => {
  if (canvasWidth <= TIER_BREAKPOINTS.phoneMax) return DeviceTier.Phone;
  if (canvasWidth <= TIER_BREAKPOINTS.tabletMax) return DeviceTier.Tablet;
  return DeviceTier.Desktop;
};

export type GamePhase = 'booting' | 'idle' | 'active';

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
  type: 'snapshot';
  contractVersion: typeof CONTRACT_VERSION;
  snapshot: GameSnapshot;
};

export type NodeDeployResponse = {
  type: 'node_deployed';
  contractVersion: typeof CONTRACT_VERSION;
  snapshot: GameSnapshot;
  node: GameNode;
  removedNodeId: string | null;
};

export type ThroughputResponse = {
  type: 'throughput_accepted';
  contractVersion: typeof CONTRACT_VERSION;
  snapshot: GameSnapshot;
  scoreDelta: number;
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
  type: 'reset_complete';
  contractVersion: typeof CONTRACT_VERSION;
  snapshot: GameSnapshot;
  archivedScore: number;
};

export type ErrorResponse = {
  type: 'error';
  contractVersion: typeof CONTRACT_VERSION;
  message: string;
};

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
    phase: 'booting',
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
