import { Scene, GameObjects } from 'phaser';
import * as Phaser from 'phaser';
import {
  deployNodeRequest,
  requestArchiveHistory,
  requestInitialSnapshot,
  submitThroughputRequest,
} from '../bridge';
import { ParticleField } from '../simulation';
import {
  BridgeMessageType,
  NodeDeployRejectionReason,
  NodeRemovalReason,
  NodeType,
  ScoreUpdateReason,
} from '../../shared/api';
import { LOGICAL_FIELD_HEIGHT, LOGICAL_FIELD_WIDTH } from '../../shared/field-layout';
import type {
  ArchiveEntry,
  GameSnapshot,
  GlobalScoreUpdatedMessage,
  InitialSnapshotMessage,
  NodeAddedMessage,
  NodeDeployRejectedMessage,
  NodeDeployResponse,
  NodeRemovedMessage,
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
    key: NodeType.Attractor,
    label: 'Gravity Well',
  },
  {
    accent: 0xff0055,
    description: 'Push streams away from obstacles',
    key: NodeType.Repeller,
    label: 'Deflection Prism',
  },
  {
    accent: 0xffaa00,
    description: 'Spin particles into orbit',
    key: NodeType.Vortex,
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
    activeIconArcEndDeg: 330,
    activeIconArcRadius: 25,
    activeIconArcStartDeg: 30,
    activeIconCircleRadii: [18, 28, 38],
    cardDetailWidth: 148,
    cardHeight: 118,
    cardWidth: 168,
    cardTitleOffsetX: -72,
    cardTitleOffsetY: -36,
    cardDetailOffsetX: -72,
    cardDetailOffsetY: -4,
    iconCenterY: -8,
    iconInactiveArcRadius: 21,
    iconInactiveCircleRadii: [16, 26, 36],
    iconTriangleBottomY: 16,
    iconTriangleTopY: -20,
    iconTriangleLeftX: -22,
    iconTriangleRightX: 22,
    panelYFromBottom: 104,
    railHeight: 108,
    railInsetBottom: 132,
    railInsetInner: 122,
    spacing: 200,
    toolRejectedFillAlpha: 0.22,
    toolSelectedBorderWidth: 3,
    toolSelectedFillAlpha: 0.1,
    toolSelectedStrokeWidth: 3,
  },
  frame: {
    innerCornerRadius: 18,
    outerInset: 18,
    outerCornerRadius: 24,
    innerInset: 28,
  },
  layout: {
    leftMargin: 32,
    rightMetricsWidth: 240,
    scoreY: 28,
    timerY: 58,
    quotaY: 88,
    subtitleY: 72,
    statusY: 106,
    titleY: 26,
  },
  dockRail: {
    backgroundAlpha: 0.88,
    backgroundInset: 24,
    innerBackgroundHeight: 88,
    innerBorderCornerRadius: 18,
    innerBorderInset: 34,
    innerBorderWidthInset: 68,
    strokeAlpha: 0.5,
    innerStrokeAlpha: 0.18,
  },
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
  simulation!: ParticleField;
  snapshot: GameSnapshot | null = null;
  localPendingScore = 0;
  private throughputTimer?: Phaser.Time.TimerEvent;
  private rejectionResetTimer: Phaser.Time.TimerEvent | null = null;
  private selectedTool: NodeType = NodeType.Attractor;
  private rejectedTool: NodeType | null = null;
  private readonly handleToolKeyOne = () => this.selectTool(NodeType.Attractor);
  private readonly handleToolKeyTwo = () => this.selectTool(NodeType.Repeller);
  private readonly handleToolKeyThree = () => this.selectTool(NodeType.Vortex);
  private readonly handleArchiveToggle = () => this.toggleArchive();
  private readonly handleArchiveEscape = () => {
    if (this.isArchiveOpen) {
      this.closeArchive();
    }
  };

  archiveButton: GameObjects.Text | null = null;
  archivePanel: Phaser.GameObjects.Container | null = null;
  archivePanelBg: Phaser.GameObjects.Rectangle | null = null;
  archiveEntryContainer: Phaser.GameObjects.Container | null = null;
  archiveScrollY = 0;
  archiveEntries: ArchiveEntry[] = [];
  archiveCache: ArchiveEntry[] | null = null;
  isArchiveOpen = false;
  isLoadingArchive = false;

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

    this.archiveButton = this.add.text(0, 0, 'ARCHIVE', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#00f0ff',
      backgroundColor: '#101420',
      padding: { x: 8, y: 4 },
    }).setInteractive({ useHandCursor: true }).setOrigin(0.5, 0);
    this.archiveButton.on('pointerdown', () => this.toggleArchive());

    this.simulation = new ParticleField(this, this.scale.width, this.scale.height);
    this.dockContainer = this.add.container(0, 0);
    this.toolUi = this.createToolDock();
    this.createArchivePanel();

    this.background.setDepth(0);
    this.atmosphere.setDepth(1);
    this.grid.setDepth(1);
    this.playfieldFrame.setDepth(6);
    this.dockRail.setDepth(7);
    this.dockContainer.setDepth(8);
    this.titleText.setDepth(9);
    this.subtitleText.setDepth(9);
    this.statusText.setDepth(9);
    this.scoreText.setDepth(9);
    this.timerText.setDepth(9);
    this.nodeQuotaText.setDepth(9);
    if (this.archiveButton) {
      this.archiveButton.setDepth(9);
    }
    if (this.archivePanel) {
      this.archivePanel.setDepth(10);
    }

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
    this.input.keyboard?.on('keydown-H', this.handleArchiveToggle);
    this.input.keyboard?.on('keydown-ESC', this.handleArchiveEscape);
    this.throughputTimer = this.time.addEvent({
      callback: this.flushThroughput,
      delay: 10_000,
      loop: true,
    });

    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: BridgeMessageType.RequestSync }, '*');
    }

    void this.loadInitialSnapshot();
  }

  private createToolDock(): Record<NodeType, ToolUi> {
    const { spacing } = UI_LAYOUT.dock;
    const attractorCard = this.createToolDockCard(TOOL_CARDS[0]!, -spacing);
    const repellerCard = this.createToolDockCard(TOOL_CARDS[1]!, 0);
    const vortexCard = this.createToolDockCard(TOOL_CARDS[2]!, spacing);

    return {
      [NodeType.Attractor]: attractorCard,
      [NodeType.Repeller]: repellerCard,
      [NodeType.Vortex]: vortexCard,
    };
  }

  private createToolDockCard(card: ToolCard, x: number): ToolUi {
    const { cardDetailOffsetX, cardDetailOffsetY, cardDetailWidth, cardHeight, cardTitleOffsetX, cardTitleOffsetY, cardWidth } =
      UI_LAYOUT.dock;
    const panel = this.add.container(x, 0);
    const badge = this.add.rectangle(0, 0, cardWidth, cardHeight, 0x101420, 0.92);
    const title = this.add.text(cardTitleOffsetX, cardTitleOffsetY, card.label, {
      fontFamily: 'Arial Black',
      fontSize: '18px',
      color: '#f6ffff',
    });
    const detail = this.add.text(cardDetailOffsetX, cardDetailOffsetY, card.description, {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#9cb7c4',
      wordWrap: { width: cardDetailWidth },
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
    return { badge, detail, icon, panel, selectHitArea, title };
  }

  private handleShutdown = () => {
    this.throughputTimer?.remove(false);
    this.rejectionResetTimer?.remove(false);
    this.rejectionResetTimer = null;
    this.simulation.destroy();
    window.removeEventListener('message', this.handleBridgeMessage);
    this.input.off('pointerdown', this.handlePointerDown);
    this.input.keyboard?.off('keydown-ONE', this.handleToolKeyOne);
    this.input.keyboard?.off('keydown-TWO', this.handleToolKeyTwo);
    this.input.keyboard?.off('keydown-THREE', this.handleToolKeyThree);
    this.input.keyboard?.off('keydown-H', this.handleArchiveToggle);
    this.input.keyboard?.off('keydown-ESC', this.handleArchiveEscape);
    this.destroyArchivePanel();
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
      case BridgeMessageType.InitialSnapshot:
        this.applySnapshot(message);
        break;
      case BridgeMessageType.NodeAdded:
        this.mergeNode(message);
        break;
      case BridgeMessageType.NodeRemoved:
        this.removeNode(message);
        break;
      case BridgeMessageType.GlobalScoreUpdated:
        this.updateScore(message);
        break;
      case BridgeMessageType.NodeDeployRejected:
        this.handleDeployRejected(message);
        break;
      case BridgeMessageType.SyncError:
        this.statusText.setText(message.data.message);
        break;
      default:
        break;
    }
  }

  private handlePointerDown = async (pointer: Phaser.Input.Pointer) => {
    if (this.isArchiveOpen) {
      if (!this.archivePanel || !this.archivePanelBg) return;
      const panelX = this.scale.width / 2;
      const panelY = this.scale.height / 2;
      const halfW = 200;
      const halfH = 150;
      if (pointer.x < panelX - halfW || pointer.x > panelX + halfW ||
          pointer.y < panelY - halfH || pointer.y > panelY + halfH) {
        this.closeArchive();
        return;
      }
    }

    if (!this.snapshot) {
      return;
    }

    const logicalX = (pointer.worldX / this.scale.width) * LOGICAL_FIELD_WIDTH;
    const logicalY = (pointer.worldY / this.scale.height) * LOGICAL_FIELD_HEIGHT;

    const result = await deployNodeRequest({
      type: this.selectedTool,
      x: logicalX,
      y: logicalY,
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
        type: BridgeMessageType.NodeDeployRejected,
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
          reason: NodeRemovalReason.Quota,
        },
        type: BridgeMessageType.NodeRemoved,
      });
    }

    this.applyServerMessage({
      data: {
        node: result.node,
      },
      type: BridgeMessageType.NodeAdded,
    });

    this.applySnapshot({
      type: BridgeMessageType.InitialSnapshot,
      data: result.snapshot,
    });
  }

  override update(_time: number, delta: number) {
    if (!this.simulation) {
      return;
    }

    this.pruneExpiredNodes();
    const collected = this.simulation.step(delta, this.snapshot?.nodes ?? []);
    if (collected > 0) {
      this.queueThroughput(collected);
    }

    if (this.snapshot) {
      this.timerText.setText(
        `${UI_TEXT.resetTimerPrefix} ${formatCountdown(this.snapshot.dailyResetAtUtc)}`
      );
    }
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
        type: BridgeMessageType.SyncError,
      });
      return;
    }

    this.applyServerMessage({
      data: {
        delta: result.data.scoreDelta,
        reason: ScoreUpdateReason.Batch,
        score: result.data.snapshot.globalScore,
      },
      type: BridgeMessageType.GlobalScoreUpdated,
    });

    this.applySnapshot({
      type: BridgeMessageType.InitialSnapshot,
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
          type: BridgeMessageType.SyncError,
        });
        return;
      }

      this.applySnapshot({
        type: BridgeMessageType.InitialSnapshot,
        data: response.data.snapshot,
      });
    } catch (error) {
      console.error('Failed to fetch initial snapshot:', error);
      this.statusText.setText(UI_TEXT.snapshotFailed);
    }
  }

  private applySnapshot(message: InitialSnapshotMessage) {
    const prevLayout = this.snapshot?.fieldLayout;
    this.snapshot = { ...message.data, nodes: [...message.data.nodes] };
    this.selectedTool = this.snapshot.selectedTool;

    if (this.snapshot.fieldLayout && (!prevLayout || prevLayout.dayKey !== this.snapshot.fieldLayout.dayKey)) {
      this.simulation.setFieldLayout(this.snapshot.fieldLayout);
    }

    this.reconcileSnapshotDerivedFields();
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

    this.reconcileSnapshotDerivedFields();
    this.renderSnapshot();
  }

  private removeNode(message: NodeRemovedMessage) {
    if (!this.snapshot) {
      return;
    }

    this.snapshot.nodes = this.snapshot.nodes.filter((node) => node.id !== message.data.nodeId);
    this.reconcileSnapshotDerivedFields();
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
      `${UI_TEXT.toolPrefix} ${this.snapshot.userActiveNodeCount} / ${this.snapshot.userMaxActiveNodes}`
    );
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
    const {
      activeIconArcEndDeg,
      activeIconArcRadius,
      activeIconArcStartDeg,
      activeIconCircleRadii,
      iconCenterY,
      iconInactiveArcRadius,
      iconInactiveCircleRadii,
      iconTriangleBottomY,
      iconTriangleLeftX,
      iconTriangleRightX,
      iconTriangleTopY,
      panelYFromBottom,
      toolRejectedFillAlpha,
      toolSelectedBorderWidth,
      toolSelectedFillAlpha,
      toolSelectedStrokeWidth,
    } = UI_LAYOUT.dock;

    TOOL_CARDS.forEach((card, index) => {
      const ui = this.toolUi[card.key];
      const isActive = card.key === activeTool;
      const isRejected = card.key === this.rejectedTool;
      const x = (index - 1) * UI_LAYOUT.dock.spacing;

      ui.panel.setPosition(this.scale.width / 2 + x, this.scale.height - panelYFromBottom);
      ui.badge.setFillStyle(
        isRejected ? 0xff0055 : card.accent,
        isRejected ? toolRejectedFillAlpha : isActive ? toolSelectedFillAlpha : 0.12
      );
      ui.badge.setStrokeStyle(
        isRejected ? 4 : isActive ? toolSelectedBorderWidth : 1,
        isRejected ? 0xff0055 : card.accent,
        isRejected || isActive ? 1 : 0.4
      );
      ui.title.setColor(isActive ? '#ffffff' : '#d8e1e8');
      ui.detail.setColor(isActive ? '#f7fbff' : '#9cb7c4');

      ui.icon.clear();
      ui.icon.lineStyle(
        isRejected ? 4 : isActive ? toolSelectedStrokeWidth : 2,
        isRejected ? 0xff0055 : card.accent,
        1
      );
      ui.icon.fillStyle(isRejected ? 0xff0055 : card.accent, isActive ? toolSelectedFillAlpha : 0.1);

      if (card.key === NodeType.Attractor) {
        const radii = isActive ? activeIconCircleRadii : iconInactiveCircleRadii;
        ui.icon.strokeCircle(0, iconCenterY, radii[0]);
        ui.icon.strokeCircle(0, iconCenterY, radii[1]);
        ui.icon.strokeCircle(0, iconCenterY, radii[2]);
      } else if (card.key === NodeType.Repeller) {
        ui.icon.strokeTriangle(
          iconTriangleLeftX,
          iconTriangleBottomY,
          0,
          iconTriangleTopY,
          iconTriangleRightX,
          iconTriangleBottomY
        );
        ui.icon.fillTriangle(
          iconTriangleLeftX,
          iconTriangleBottomY,
          0,
          iconTriangleTopY,
          iconTriangleRightX,
          iconTriangleBottomY
        );
      } else {
        ui.icon.beginPath();
        ui.icon.arc(
          0,
          -4,
          isActive ? activeIconArcRadius : iconInactiveArcRadius,
          Phaser.Math.DegToRad(activeIconArcStartDeg),
          Phaser.Math.DegToRad(activeIconArcEndDeg),
          false
        );
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
    this.simulation.setSize(width, height);

    this.drawAtmosphere(width, height);
    this.drawGrid(width, height);
    this.drawFrame(width, height);
    this.drawDockRail(width, height);

    this.titleText.setPosition(UI_LAYOUT.layout.leftMargin, UI_LAYOUT.layout.titleY);
    this.subtitleText.setPosition(UI_LAYOUT.layout.leftMargin + 2, UI_LAYOUT.layout.subtitleY);
    this.statusText.setPosition(UI_LAYOUT.layout.leftMargin + 2, UI_LAYOUT.layout.statusY);
    this.scoreText.setPosition(width - UI_LAYOUT.layout.rightMetricsWidth, UI_LAYOUT.layout.scoreY);
    this.timerText.setPosition(width - UI_LAYOUT.layout.rightMetricsWidth, UI_LAYOUT.layout.timerY);
    this.nodeQuotaText.setPosition(width - UI_LAYOUT.layout.rightMetricsWidth, UI_LAYOUT.layout.quotaY);
    if (this.archiveButton) {
      this.archiveButton.setPosition(width - UI_LAYOUT.layout.rightMetricsWidth + 120, UI_LAYOUT.layout.quotaY + 2);
    }

    if (this.isArchiveOpen && this.archivePanel) {
      this.positionArchivePanel(width, height);
    }

    this.updateToolDock();
  }

  private drawAtmosphere(width: number, height: number) {
    this.atmosphere.clear();
    this.atmosphere.fillStyle(0x00f0ff, 0.08);
    this.atmosphere.fillCircle(
      width * 0.18,
      height * 0.22,
      Math.min(width, height) * UI_LAYOUT.atmosphere.attractorRadiusRatio
    );
    this.atmosphere.fillStyle(0xff0055, 0.08);
    this.atmosphere.fillCircle(
      width * 0.82,
      height * 0.18,
      Math.min(width, height) * UI_LAYOUT.atmosphere.repelRadiusRatio
    );
    this.atmosphere.fillStyle(0xffaa00, 0.08);
    this.atmosphere.fillCircle(
      width * 0.56,
      height * 0.82,
      Math.min(width, height) * UI_LAYOUT.atmosphere.helixRadiusRatio
    );
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
      UI_LAYOUT.frame.outerCornerRadius
    );
    this.playfieldFrame.lineStyle(1, 0xff0055, 0.28);
    this.playfieldFrame.strokeRoundedRect(
      UI_LAYOUT.frame.innerInset,
      UI_LAYOUT.frame.innerInset,
      width - UI_LAYOUT.frame.innerInset * 2,
      height - UI_LAYOUT.dock.railInsetInner - UI_LAYOUT.frame.innerInset,
      UI_LAYOUT.frame.innerCornerRadius
    );
  }

  private drawDockRail(width: number, height: number) {
    this.dockRail.clear();
    this.dockRail.fillStyle(0x0b1019, UI_LAYOUT.dockRail.backgroundAlpha);
    this.dockRail.fillRoundedRect(
      UI_LAYOUT.dockRail.backgroundInset,
      height - UI_LAYOUT.dock.railInsetBottom,
      width - UI_LAYOUT.dockRail.backgroundInset * 2,
      UI_LAYOUT.dock.railHeight,
      UI_LAYOUT.dock.railHeight / 4
    );
    this.dockRail.lineStyle(1, 0x00f0ff, UI_LAYOUT.dockRail.strokeAlpha);
    this.dockRail.strokeRoundedRect(
      UI_LAYOUT.dockRail.backgroundInset,
      height - UI_LAYOUT.dock.railInsetBottom,
      width - UI_LAYOUT.dockRail.backgroundInset * 2,
      UI_LAYOUT.dock.railHeight,
      UI_LAYOUT.dock.railHeight / 4
    );
    this.dockRail.lineStyle(1, 0xff0055, 0.18);
    this.dockRail.strokeRoundedRect(
      UI_LAYOUT.dockRail.innerBorderInset,
      height - UI_LAYOUT.dock.railInsetInner,
      width - UI_LAYOUT.dockRail.innerBorderWidthInset,
      UI_LAYOUT.dockRail.innerBackgroundHeight,
      UI_LAYOUT.dockRail.innerBorderCornerRadius
    );
  }

  private pruneExpiredNodes() {
    if (!this.snapshot) {
      return;
    }

    const now = Date.now();
    const before = this.snapshot.nodes.length;
    this.snapshot.nodes = this.snapshot.nodes.filter((node) => node.expiresAt > now);

    if (this.snapshot.nodes.length !== before) {
      this.reconcileSnapshotDerivedFields();
      this.renderSnapshot();
    }
  }

  private reconcileSnapshotDerivedFields() {
    if (!this.snapshot) {
      return;
    }

    const userNodes = this.snapshot.nodes.filter((node) => node.ownerId === this.snapshot?.username);
    this.snapshot.userActiveNodeIds = userNodes.map((node) => node.id);
    this.snapshot.userActiveNodeCount = userNodes.length;
  }

  private createArchivePanel() {
    const panelWidth = 400;
    const panelHeight = 300;
    const entryHeight = 28;
    const headerHeight = 36;
    const contentHeight = panelHeight - headerHeight;

    this.archivePanel = this.add.container(0, 0);
    this.archivePanel.setDepth(10);
    this.archivePanel.setVisible(false);

    const bg = this.add.rectangle(0, 0, panelWidth, panelHeight, 0x0d0e15, 0.92);
    bg.setStrokeStyle(2, 0x00f0ff);
    this.archivePanel.add(bg);

    const title = this.add.text(0, -panelHeight / 2 + 12, 'ARCHIVE', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#00f0ff',
    }).setOrigin(0.5, 0);
    this.archivePanel.add(title);

    const headerLine = this.add.graphics();
    headerLine.lineStyle(1, 0x00f0ff, 0.3);
    headerLine.lineBetween(-panelWidth / 2 + 12, -panelHeight / 2 + 30, panelWidth / 2 - 12, -panelHeight / 2 + 30);
    this.archivePanel.add(headerLine);

    const columnHeaders = this.add.text(0, -panelHeight / 2 + 32, 'Date          Score        Nodes       Seed', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#5a7a8a',
    }).setOrigin(0.5, 0);
    this.archivePanel.add(columnHeaders);

    this.archiveEntryContainer = this.add.container(0, 0);
    this.archivePanel.add(this.archiveEntryContainer);

    const clipX = -panelWidth / 2 + 2;
    const clipY = -panelHeight / 2 + headerHeight;
    const clipW = panelWidth - 4;
    const clipH = contentHeight;

    const maskGraphics = this.add.graphics();
    maskGraphics.fillStyle(0xffffff);
    maskGraphics.fillRect(clipX, clipY, clipW, clipH);
    maskGraphics.setVisible(false);
    const geometryMask = maskGraphics.createGeometryMask();
    this.archiveEntryContainer.setMask(geometryMask);

    const emptyText = this.add.text(0, 0, 'No archived days yet', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#5a7a8a',
    }).setOrigin(0.5);
    emptyText.setName('archiveEmpty');
    this.archiveEntryContainer.add(emptyText);

    const dragState = { isDragging: false, startY: 0, startScrollY: 0 };

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!dragState.isDragging || !this.archiveEntryContainer) return;
      const dy = pointer.y - dragState.startY;
      const totalH = this.archiveEntries.length * entryHeight;
      const maxScroll = Math.max(0, totalH - contentHeight);
      this.archiveScrollY = Phaser.Math.Clamp(dragState.startScrollY + dy, -maxScroll, 0);
      this.archiveEntryContainer.setY(this.archiveScrollY);
    });

    this.input.on('pointerup', () => {
      dragState.isDragging = false;
    });

    this.input.on('pointerout', () => {
      dragState.isDragging = false;
    });

    this.archiveEntryContainer.setInteractive(new Phaser.Geom.Rectangle(
      -panelWidth / 2,
      clipY,
      panelWidth,
      clipH
    ), Phaser.Geom.Rectangle.Contains);

    this.archiveEntryContainer.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.archiveEntryContainer) return;
      const totalH = this.archiveEntries.length * entryHeight;
      if (totalH > contentHeight) {
        dragState.isDragging = true;
        dragState.startY = pointer.y;
        dragState.startScrollY = this.archiveScrollY;
      }
    });

    this.archivePanelBg = bg;
  }

  private destroyArchivePanel() {
    this.archivePanel?.destroy();
    this.archivePanel = null;
    this.archivePanelBg = null;
    this.archiveEntryContainer = null;
  }

  private positionArchivePanel(width: number, height: number) {
    if (!this.archivePanel) return;
    this.archivePanel.setPosition(width / 2, height / 2);
  }

  private toggleArchive() {
    if (this.isArchiveOpen) {
      this.closeArchive();
    } else {
      this.openArchive();
    }
  }

  private openArchive() {
    this.isArchiveOpen = true;
    if (this.archivePanel) {
      this.archivePanel.setVisible(true);
    }
    this.positionArchivePanel(this.scale.width, this.scale.height);

    if (this.archiveCache) {
      this.renderArchiveEntries(this.archiveCache);
    } else if (!this.isLoadingArchive) {
      void this.fetchArchive();
    }
  }

  private closeArchive() {
    this.isArchiveOpen = false;
    if (this.archivePanel) {
      this.archivePanel.setVisible(false);
    }
  }

  private async fetchArchive() {
    if (this.isLoadingArchive) return;
    this.isLoadingArchive = true;

    try {
      const result = await requestArchiveHistory();
      if (!result.ok) {
        console.error('Failed to fetch archive history:', result.error.message);
        this.renderArchiveEntries([]);
        return;
      }

      this.archiveCache = result.data.entries;
      this.renderArchiveEntries(result.data.entries);
    } catch (error) {
      console.error('Archive fetch error:', error);
      this.renderArchiveEntries([]);
    } finally {
      this.isLoadingArchive = false;
    }
  }

  private renderArchiveEntries(entries: ArchiveEntry[]) {
    if (!this.archiveEntryContainer) return;

    this.archiveEntries = entries;
    this.archiveScrollY = 0;
    this.archiveEntryContainer.setY(0);

    this.archiveEntryContainer.removeAll(true);

    const entryHeight = 28;

    if (entries.length === 0) {
      const emptyText = this.add.text(0, 0, 'No archived days yet', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#5a7a8a',
      }).setOrigin(0.5);
      emptyText.setName('archiveEmpty');
      this.archiveEntryContainer.add(emptyText);
      return;
    }

    const bestScore = Math.max(...entries.map((e) => e.score));

    entries.forEach((entry, index) => {
      const isBest = entry.score === bestScore && entries.length > 1;
      const rowBg = this.add.rectangle(
        0,
        index * entryHeight,
        396,
        entryHeight - 2,
        isBest ? 0x1a1a00 : index % 2 === 0 ? 0x101420 : 0x0d0e15,
        0.6
      );
      if (isBest) {
        rowBg.setStrokeStyle(1, 0xffd700, 0.8);
      }
      this.archiveEntryContainer!.add(rowBg);

      const dateStr = formatDayKey(entry.dayKey);
      const scoreColor = isBest ? '#ffd700' : '#ffaa00';
      const rowText = this.add.text(-180, index * entryHeight, dateStr, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#9cb7c4',
      }).setOrigin(0, 0.5);
      this.archiveEntryContainer!.add(rowText);

      const scoreText = this.add.text(-70, index * entryHeight, String(entry.score), {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: scoreColor,
      }).setOrigin(0, 0.5);
      this.archiveEntryContainer!.add(scoreText);

      const nodesText = this.add.text(40, index * entryHeight, String(entry.nodeCount), {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#9cb7c4',
      }).setOrigin(0, 0.5);
      this.archiveEntryContainer!.add(nodesText);

      const seedText = this.add.text(120, index * entryHeight, String(entry.layoutSeed), {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#5a7a8a',
      }).setOrigin(0, 0.5);
      this.archiveEntryContainer!.add(seedText);
    });
  }
}

const deriveDeployRejectionReason = (message: string) => {
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

const formatCountdown = (targetUtcMs: number) => {
  const remaining = Math.max(0, targetUtcMs - Date.now());
  const totalSeconds = Math.floor(remaining / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

const formatDayKey = (dayKey: string) => {
  const date = new Date(dayKey);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
