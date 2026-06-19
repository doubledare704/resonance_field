export const CONTRACT_VERSION = 'resonance-field/v1';
export const MAX_ACTIVE_NODES = 3;
export const NODE_LIFESPAN_MS = 60_000;
export const DAILY_RESET_HOUR_UTC = 0;

export type NodeType = 'ATTRACTOR' | 'REPELLER' | 'VORTEX';

export type GamePhase = 'booting' | 'idle' | 'active' | 'resetting';

export type NodeRemovalReason = 'expired' | 'quota' | 'manual' | 'reset';

export type NodeDeployRejectionReason =
  | 'quota_exceeded'
  | 'invalid_type'
  | 'invalid_position'
  | 'sync_required';

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

export type RequestSyncMessage = {
  type: 'REQUEST_SYNC';
  data?: {
    postId?: string;
  };
};

export type SelectToolMessage = {
  type: 'SELECT_TOOL';
  data: {
    tool: NodeType;
  };
};

export type NodeDeployMessage = {
  type: 'NODE_DEPLOY';
  data: {
    type: NodeType;
    x: number;
    y: number;
  };
};

export type SubmitThroughputMessage = {
  type: 'SUBMIT_THROUGHPUT';
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
  type: 'INITIAL_SNAPSHOT';
  data: GameSnapshot;
};

export type NodeAddedMessage = {
  type: 'NODE_ADDED';
  data: {
    node: GameNode;
  };
};

export type NodeRemovedMessage = {
  type: 'NODE_REMOVED';
  data: {
    nodeId: string;
    reason: NodeRemovalReason;
  };
};

export type GlobalScoreUpdatedMessage = {
  type: 'GLOBAL_SCORE_UPDATED';
  data: {
    score: number;
    delta: number;
    reason: 'batch' | 'reset';
  };
};

export type NodeDeployRejectedMessage = {
  type: 'NODE_DEPLOY_REJECTED';
  data: {
    reason: NodeDeployRejectionReason;
    message: string;
    requested: NodeDeployMessage['data'];
  };
};

export type SyncErrorMessage = {
  type: 'SYNC_ERROR';
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
    selectedTool: 'ATTRACTOR',
  };
};

