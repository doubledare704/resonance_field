export const CONTRACT_VERSION = 'resonance-field/v1';
export const MAX_ACTIVE_NODES = 3;
export const NODE_LIFESPAN_MS = 60_000;
export const DAILY_RESET_HOUR_UTC = 0;

export enum NodeType {
  Attractor = 'ATTRACTOR',
  Repeller = 'REPELLER',
  Vortex = 'VORTEX',
}

export type GamePhase = 'booting' | 'idle' | 'active' | 'resetting';

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
  RequestSync = 'REQUEST_SYNC',
  SelectTool = 'SELECT_TOOL',
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
};

export type GameState = {
  contractVersion: typeof CONTRACT_VERSION;
  postId: string;
  subredditName: string | null;
  phase: GamePhase;
  dailyResetAtUtc: number;
  globalScore: number;
  nodes: GameNode[];
};

export type RequestSyncMessage = {
  type: BridgeMessageType.RequestSync;
  data?: {
    postId?: string;
  };
};

export type SelectToolMessage = {
  type: BridgeMessageType.SelectTool;
  data: {
    tool: NodeType;
  };
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

export type ClientBridgeMessage =
  | RequestSyncMessage
  | SelectToolMessage
  | NodeDeployMessage
  | SubmitThroughputMessage;

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

export type BridgeMessage = ClientBridgeMessage | ServerBridgeMessage;

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
};

export const createEmptySnapshot = ({
  postId,
  username,
  subredditName,
  now = Date.now(),
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
  };
};
