import { Scene, GameObjects } from 'phaser';
import * as Phaser from 'phaser';
import {
  deployNodeRequest,
  requestInitialSnapshot,
  submitThroughputRequest,
} from '../bridge';
import type {
  GameSnapshot,
  GlobalScoreUpdatedMessage,
  InitialSnapshotMessage,
  NodeAddedMessage,
  NodeDeployRejectedMessage,
  NodeDeployResponse,
  NodeRemovedMessage,
  NodeType,
  ServerBridgeMessage,
} from '../../shared/api';

type ToolCard = {
  key: NodeType;
  label: string;
  accent: number;
  description: string;
};

type ToolUi = {
  panel: Phaser.GameObjects.Container;
  badge: Phaser.GameObjects.Rectangle;
  title: GameObjects.Text;
  detail: GameObjects.Text;
  icon: Phaser.GameObjects.Graphics;
  selectHitArea: Phaser.GameObjects.Zone;
};

const TOOL_CARDS: ToolCard[] = [
  {
    accent: 0x00f0ff,
    description: 'Pull fluid into narrow channels',
    key: 'ATTRACTOR',
    label: 'Gravity Well',
  },
  {
    accent: 0xff0055,
    description: 'Push streams away from obstacles',
    key: 'REPELLER',
    label: 'Deflection Prism',
  },
  {
    accent: 0xffaa00,
    description: 'Spin particles into orbit',
    key: 'VORTEX',
    label: 'Vortex Helix',
  },
];

const UI_TEXT = {
  defaultStatus: 'Waiting for contract snapshot...',
  deployFailed: 'Node deployment rejected',
  deploySelected: (tool: NodeType) => `Selected ${tool}`,
  initialSnapshot: (username: string, subredditName: string | null) =>
    `Snapshot ready for ${username} in ${subredditName ?? 'unknown'}`,
  resetTimerPrefix: 'RESET IN',
  scorePrefix: 'Score',
  toolPrefix: 'TOOLS',
  snapshotFailed: 'Snapshot load failed. Waiting for bridge sync...',
  subtitle: 'A cooperative fluid field tuned by the subreddit',
} as const;

const UI_LAYOUT = {
  atmosphere: {
    attractorRadiusRatio: 0.22,
    helixRadiusRatio: 0.2,
    repelRadiusRatio: 0.18,
  },
  dock: {
    cardHeight: 118,
    cardWidth: 168,
    iconCenterY: -8,
    panelYFromBottom: 104,
    railHeight: 108,
    railInsetBottom: 132,
    railInsetInner: 122,
    spacing: 200,
  },
  frame: {
    outerInset: 18,
    innerInset: 28,
  },
  layout: {
    leftMargin: 32,
    rightMetricsWidth: 240,
    subtitleY: 72,
    statusY: 106,
  },
} as const;

const BRIDGE_MESSAGE_TYPE = {
  globalScoreUpdated: 'GLOBAL_SCORE_UPDATED',
  initialSnapshot: 'INITIAL_SNAPSHOT',
  nodeAdded: 'NODE_ADDED',
  nodeDeployRejected: 'NODE_DEPLOY_REJECTED',
  nodeRemoved: 'NODE_REMOVED',
  syncError: 'SYNC_ERROR',
} as const;

const DEPLOY_REJECTION_REASON = {
  invalidPosition: 'invalid_position',
  invalidType: 'invalid_type',
  quotaExceeded: 'quota_exceeded',
  syncRequired: 'sync_required',
} as const;

const NODE_REMOVAL_REASON = {
  quota: 'quota',
} as const;

const SCORE_UPDATE_REASON = {
  batch: 'batch',
  reset: 'reset',
} as const;

export class Game extends Scene {
  camera: Phaser.Cameras.Scene2D.Camera;
  background: GameObjects.Rectangle;
  atmosphere: Phaser.GameObjects.Graphics;
  grid: Phaser.GameObjects.Graphics;
  titleText: GameObjects.Text;
  subtitleText: GameObjects.Text;
  statusText: GameObjects.Text;
  scoreText: GameObjects.Text;
  timerText: GameObjects.Text;
  nodeQuotaText: GameObjects.Text;
  playfieldFrame: Phaser.GameObjects.Graphics;
  dockRail: Phaser.GameObjects.Graphics;
  dockContainer!: Phaser.GameObjects.Container;
  toolUi!: Record<NodeType, ToolUi>;
  snapshot: GameSnapshot | null = null;
  localPendingScore = 0;
  private throughputTimer?: Phaser.Time.TimerEvent;
  private rejectionResetTimer: Phaser.Time.TimerEvent | null = null;
  private selectedTool: NodeType = 'ATTRACTOR';
  private rejectedTool: NodeType | null = null;
  private readonly handleToolKeyOne = () => this.selectTool('ATTRACTOR');
  private readonly handleToolKeyTwo = () => this.selectTool('REPELLER');
  private readonly handleToolKeyThree = () => this.selectTool('VORTEX');

  constructor() {
    super('Game');
  }

  create() {
    this.camera = this.cameras.main;
    this.camera.setBackgroundColor('#0d0e15');

    this.background = this.add.rectangle(0, 0, 1, 1, 0x0d0e15).setOrigin(0);
    this.atmosphere = this.add.graphics();
    this.grid = this.add.graphics();
    this.playfieldFrame = this.add.graphics();
    this.dockRail = this.add.graphics();

    this.titleText = this.add.text(0, 0, 'Resonance Field', {
      fontFamily: 'Arial Black',
      fontSize: '40px',
      color: '#e7ffff',
      stroke: '#00151a',
      strokeThickness: 8,
    });
    this.subtitleText = this.add.text(0, 0, UI_TEXT.subtitle, {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#8feeff',
    });
    this.statusText = this.add.text(0, 0, UI_TEXT.defaultStatus, {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#c7f9ff',
    });
    this.scoreText = this.add.text(0, 0, `${UI_TEXT.scorePrefix} 0`, {
      fontFamily: 'monospace',
      fontSize: '22px',
      color: '#ffaa00',
    });
    this.timerText = this.add.text(0, 0, `${UI_TEXT.resetTimerPrefix} 00:00:00`, {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ffffff',
    });
    this.nodeQuotaText = this.add.text(0, 0, `${UI_TEXT.toolPrefix} 0 / 3`, {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ff5b86',
    });

    this.dockContainer = this.add.container(0, 0);
    this.toolUi = this.createToolDock();

    this.refreshLayout();
    this.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
      this.refreshLayout(gameSize.width, gameSize.height);
    });

    window.addEventListener('message', this.handleBridgeMessage);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown);
    this.input.on('pointerdown', this.handlePointerDown);
    this.input.keyboard?.on('keydown-ONE', this.handleToolKeyOne);
    this.input.keyboard?.on('keydown-TWO', this.handleToolKeyTwo);
    this.input.keyboard?.on('keydown-THREE', this.handleToolKeyThree);
    this.throughputTimer = this.time.addEvent({
      callback: this.flushThroughput,
      delay: 10_000,
      loop: true,
    });

    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'REQUEST_SYNC' }, '*');
    }

    void this.loadInitialSnapshot();
  }

  private createToolDock(): Record<NodeType, ToolUi> {
    const output = {} as Record<NodeType, ToolUi>;
    const { cardHeight, cardWidth, spacing } = UI_LAYOUT.dock;

    TOOL_CARDS.forEach((card, index) => {
      const x = (index - 1) * spacing;
      const panel = this.add.container(x, 0);
      const badge = this.add.rectangle(0, 0, cardWidth, cardHeight, 0x101420, 0.92);
      const title = this.add.text(-72, -36, card.label, {
        fontFamily: 'Arial Black',
        fontSize: '18px',
        color: '#f6ffff',
      });
      const detail = this.add.text(-72, -4, card.description, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#9cb7c4',
        wordWrap: { width: 148 },
      });
      const icon = this.add.graphics();
      const selectHitArea = this.add.zone(0, 0, cardWidth, cardHeight).setOrigin(0.5).setInteractive({
        useHandCursor: true,
      });

      selectHitArea.on('pointerdown', () => {
        this.selectTool(card.key);
      });

      panel.add([badge, icon, title, detail, selectHitArea]);
      this.dockContainer.add(panel);
      output[card.key] = { badge, detail, icon, panel, selectHitArea, title };
    });

    return output;
  }

  private handleShutdown = () => {
    this.throughputTimer?.remove(false);
    this.rejectionResetTimer?.remove(false);
    this.rejectionResetTimer = null;
    window.removeEventListener('message', this.handleBridgeMessage);
    this.input.off('pointerdown', this.handlePointerDown);
    this.input.keyboard?.off('keydown-ONE', this.handleToolKeyOne);
    this.input.keyboard?.off('keydown-TWO', this.handleToolKeyTwo);
    this.input.keyboard?.off('keydown-THREE', this.handleToolKeyThree);
  };

  private handleBridgeMessage = (event: MessageEvent) => {
    const message = event.data as ServerBridgeMessage | undefined;
    if (!message || typeof message.type !== 'string') {
      return;
    }

    this.applyServerMessage(message);
  };

  private applyServerMessage(message: ServerBridgeMessage) {
    switch (message.type) {
      case BRIDGE_MESSAGE_TYPE.initialSnapshot:
        this.applySnapshot(message);
        break;
      case BRIDGE_MESSAGE_TYPE.nodeAdded:
        this.mergeNode(message);
        break;
      case BRIDGE_MESSAGE_TYPE.nodeRemoved:
        this.removeNode(message);
        break;
      case BRIDGE_MESSAGE_TYPE.globalScoreUpdated:
        this.updateScore(message);
        break;
      case BRIDGE_MESSAGE_TYPE.nodeDeployRejected:
        this.handleDeployRejected(message);
        break;
      case BRIDGE_MESSAGE_TYPE.syncError:
        this.statusText.setText(message.data.message);
        break;
      default:
        break;
    }
  }

  private handlePointerDown = async (pointer: Phaser.Input.Pointer) => {
    if (!this.snapshot) {
      return;
    }

    const result = await deployNodeRequest({
      type: this.selectedTool,
      x: pointer.worldX,
      y: pointer.worldY,
    });

    if (!result.ok) {
      this.applyServerMessage({
        data: {
          message: result.error.message,
          reason: deriveDeployRejectionReason(result.error.message),
          requested: {
            type: this.selectedTool,
            x: pointer.worldX,
            y: pointer.worldY,
          },
        },
        type: BRIDGE_MESSAGE_TYPE.nodeDeployRejected,
      });
      return;
    }

    this.handleDeploySuccess(result.data);
  };

  private handleDeploySuccess(result: NodeDeployResponse) {
    if (result.removedNodeId) {
      this.applyServerMessage({
        data: {
          nodeId: result.removedNodeId,
          reason: NODE_REMOVAL_REASON.quota,
        },
        type: BRIDGE_MESSAGE_TYPE.nodeRemoved,
      });
    }

    this.applyServerMessage({
      data: {
        node: result.node,
      },
      type: BRIDGE_MESSAGE_TYPE.nodeAdded,
    });

    this.applySnapshot({
      type: BRIDGE_MESSAGE_TYPE.initialSnapshot,
      data: result.snapshot,
    });
  }

  private async flushThroughput() {
    if (!this.snapshot || this.localPendingScore <= 0) {
      return;
    }

    const scoreBatch = this.localPendingScore;
    this.localPendingScore = 0;

    const result = await submitThroughputRequest(scoreBatch);
    if (!result.ok) {
      this.applyServerMessage({
        data: {
          message: result.error.message,
        },
        type: BRIDGE_MESSAGE_TYPE.syncError,
      });
      return;
    }

    this.applyServerMessage({
      data: {
        delta: result.data.scoreDelta,
        reason: SCORE_UPDATE_REASON.batch,
        score: result.data.snapshot.globalScore,
      },
      type: BRIDGE_MESSAGE_TYPE.globalScoreUpdated,
    });

    this.applySnapshot({
      type: BRIDGE_MESSAGE_TYPE.initialSnapshot,
      data: result.data.snapshot,
    });
  }

  queueThroughput(count: number) {
    this.localPendingScore += count;
  }

  private async loadInitialSnapshot() {
    try {
      const response = await requestInitialSnapshot();
      if (!response.ok) {
        this.applyServerMessage({
          data: {
            message: response.error.message,
          },
          type: BRIDGE_MESSAGE_TYPE.syncError,
        });
        return;
      }

      this.applySnapshot({
        type: BRIDGE_MESSAGE_TYPE.initialSnapshot,
        data: response.data.snapshot,
      });
    } catch (error) {
      console.error('Failed to fetch initial snapshot:', error);
      this.statusText.setText(UI_TEXT.snapshotFailed);
    }
  }

  private applySnapshot(message: InitialSnapshotMessage) {
    this.snapshot = { ...message.data, nodes: [...message.data.nodes] };
    this.selectedTool = this.snapshot.selectedTool;
    this.statusText.setText(UI_TEXT.initialSnapshot(this.snapshot.username, this.snapshot.subredditName));
    this.renderSnapshot();
  }

  private mergeNode(message: NodeAddedMessage) {
    if (!this.snapshot) {
      return;
    }

    const existing = this.snapshot.nodes.find((node) => node.id === message.data.node.id);
    if (!existing) {
      this.snapshot.nodes = [...this.snapshot.nodes, message.data.node];
    }

    this.renderSnapshot();
  }

  private removeNode(message: NodeRemovedMessage) {
    if (!this.snapshot) {
      return;
    }

    this.snapshot.nodes = this.snapshot.nodes.filter((node) => node.id !== message.data.nodeId);
    this.renderSnapshot();
  }

  private updateScore(message: GlobalScoreUpdatedMessage) {
    if (!this.snapshot) {
      return;
    }

    this.snapshot.globalScore = message.data.score;
    this.renderSnapshot();
  }

  private renderSnapshot() {
    if (!this.snapshot) {
      return;
    }

    this.scoreText.setText(`Score ${this.snapshot.globalScore}`);
    this.nodeQuotaText.setText(
      `${UI_TEXT.toolPrefix} ${this.snapshot.nodes.length} / ${this.snapshot.userMaxActiveNodes}`
    );
    this.timerText.setText(`${UI_TEXT.resetTimerPrefix} ${formatCountdown(this.snapshot.dailyResetAtUtc)}`);
    this.updateToolDock();
  }

  private selectTool(tool: NodeType) {
    this.selectedTool = tool;
    if (this.snapshot) {
      this.snapshot.selectedTool = tool;
    }
    this.rejectionResetTimer?.remove(false);
    this.rejectionResetTimer = null;
    this.statusText.setText(UI_TEXT.deploySelected(tool));
    this.updateToolDock();
  }

  private updateToolDock() {
    const activeTool = this.snapshot?.selectedTool ?? this.selectedTool;

    TOOL_CARDS.forEach((card, index) => {
      const ui = this.toolUi[card.key];
      const isActive = card.key === activeTool;
      const isRejected = card.key === this.rejectedTool;
      const x = (index - 1) * UI_LAYOUT.dock.spacing;

      ui.panel.setPosition(this.scale.width / 2 + x, this.scale.height - UI_LAYOUT.dock.panelYFromBottom);
      ui.badge.setFillStyle(isRejected ? 0xff0055 : card.accent, isActive ? 0.2 : 0.12);
      ui.badge.setStrokeStyle(isRejected ? 3 : isActive ? 3 : 1, isRejected ? 0xff0055 : card.accent, isRejected || isActive ? 1 : 0.4);
      ui.title.setColor(isActive ? '#ffffff' : '#d8e1e8');
      ui.detail.setColor(isActive ? '#f7fbff' : '#9cb7c4');

      ui.icon.clear();
      ui.icon.lineStyle(isRejected ? 4 : isActive ? 4 : 2, isRejected ? 0xff0055 : card.accent, 1);
      ui.icon.fillStyle(isRejected ? 0xff0055 : card.accent, isActive ? 0.22 : 0.1);

      if (card.key === 'ATTRACTOR') {
        ui.icon.strokeCircle(0, UI_LAYOUT.dock.iconCenterY, isActive ? 18 : 16);
        ui.icon.strokeCircle(0, UI_LAYOUT.dock.iconCenterY, isActive ? 28 : 26);
        ui.icon.strokeCircle(0, UI_LAYOUT.dock.iconCenterY, isActive ? 38 : 36);
      } else if (card.key === 'REPELLER') {
        ui.icon.strokeTriangle(-22, 16, 0, -20, 22, 16);
        ui.icon.fillTriangle(-22, 16, 0, -20, 22, 16);
      } else {
        ui.icon.beginPath();
        ui.icon.arc(0, -4, isActive ? 25 : 21, Phaser.Math.DegToRad(30), Phaser.Math.DegToRad(330), false);
        ui.icon.strokePath();
      }
    });
  }

  private handleDeployRejected(message: NodeDeployRejectedMessage) {
    this.rejectedTool = message.data.requested.type;
    this.statusText.setText(`${UI_TEXT.deployFailed}: ${message.data.message}`);
    this.updateToolDock();

    this.rejectionResetTimer?.remove(false);
    this.rejectionResetTimer = this.time.delayedCall(900, () => {
      this.rejectedTool = null;
      this.rejectionResetTimer = null;
      this.updateToolDock();
    });
  }

  private refreshLayout(width = this.scale.width, height = this.scale.height) {
    this.cameras.resize(width, height);
    this.background.setSize(width, height);

    this.drawAtmosphere(width, height);
    this.drawGrid(width, height);
    this.drawFrame(width, height);
    this.drawDockRail(width, height);

    this.titleText.setPosition(32, 26);
    this.subtitleText.setPosition(34, 72);
    this.statusText.setPosition(34, 106);
    this.scoreText.setPosition(width - 240, 28);
    this.timerText.setPosition(width - 240, 58);
    this.nodeQuotaText.setPosition(width - 240, 88);

    this.updateToolDock();
  }

  private drawAtmosphere(width: number, height: number) {
    this.atmosphere.clear();
    this.atmosphere.fillStyle(0x00f0ff, 0.08);
    this.atmosphere.fillCircle(width * 0.18, height * 0.22, Math.min(width, height) * UI_LAYOUT.atmosphere.attractorRadiusRatio);
    this.atmosphere.fillStyle(0xff0055, 0.08);
    this.atmosphere.fillCircle(width * 0.82, height * 0.18, Math.min(width, height) * UI_LAYOUT.atmosphere.repelRadiusRatio);
    this.atmosphere.fillStyle(0xffaa00, 0.08);
    this.atmosphere.fillCircle(width * 0.56, height * 0.82, Math.min(width, height) * UI_LAYOUT.atmosphere.helixRadiusRatio);
  }

  private drawGrid(width: number, height: number) {
    this.grid.clear();
    this.grid.lineStyle(1, 0x1a2a36, 0.4);
    const step = 64;

    for (let x = 0; x <= width; x += step) {
      this.grid.lineBetween(x, 0, x, height);
    }

    for (let y = 0; y <= height; y += step) {
      this.grid.lineBetween(0, y, width, y);
    }
  }

  private drawFrame(width: number, height: number) {
    this.playfieldFrame.clear();
    this.playfieldFrame.lineStyle(2, 0x00f0ff, 0.45);
    this.playfieldFrame.strokeRoundedRect(
      UI_LAYOUT.frame.outerInset,
      UI_LAYOUT.frame.outerInset,
      width - UI_LAYOUT.frame.outerInset * 2,
      height - UI_LAYOUT.dock.railInsetBottom - UI_LAYOUT.frame.outerInset,
      24
    );
    this.playfieldFrame.lineStyle(1, 0xff0055, 0.28);
    this.playfieldFrame.strokeRoundedRect(
      UI_LAYOUT.frame.innerInset,
      UI_LAYOUT.frame.innerInset,
      width - UI_LAYOUT.frame.innerInset * 2,
      height - UI_LAYOUT.dock.railInsetInner - UI_LAYOUT.frame.innerInset,
      18
    );
  }

  private drawDockRail(width: number, height: number) {
    this.dockRail.clear();
    this.dockRail.fillStyle(0x0b1019, 0.88);
    this.dockRail.fillRoundedRect(24, height - UI_LAYOUT.dock.railInsetBottom, width - 48, UI_LAYOUT.dock.railHeight, 22);
    this.dockRail.lineStyle(1, 0x00f0ff, 0.5);
    this.dockRail.strokeRoundedRect(24, height - UI_LAYOUT.dock.railInsetBottom, width - 48, UI_LAYOUT.dock.railHeight, 22);
    this.dockRail.lineStyle(1, 0xff0055, 0.18);
    this.dockRail.strokeRoundedRect(34, height - UI_LAYOUT.dock.railInsetInner, width - 68, 88, 18);
  }
}

const deriveDeployRejectionReason = (message: string) => {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('position')) {
    return DEPLOY_REJECTION_REASON.invalidPosition;
  }

  if (lowerMessage.includes('type')) {
    return DEPLOY_REJECTION_REASON.invalidType;
  }

  if (lowerMessage.includes('quota')) {
    return DEPLOY_REJECTION_REASON.quotaExceeded;
  }

  return DEPLOY_REJECTION_REASON.syncRequired;
};

const formatCountdown = (targetUtcMs: number) => {
  const remaining = Math.max(0, targetUtcMs - Date.now());
  const totalSeconds = Math.floor(remaining / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};
