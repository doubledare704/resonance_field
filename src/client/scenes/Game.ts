import { Scene, GameObjects } from 'phaser';
import * as Phaser from 'phaser';
import {
  deployNodeRequest,
  requestArchiveHistory,
  requestInitialSnapshot,
  selectToolRequest,
  submitThroughputRequest,
} from '../bridge';
import { connectRealtime } from '@devvit/web/client';
import { ParticleField } from '../simulation';
import {
  BridgeMessageType,
  NodeDeployRejectionReason,
  NodeRemovalReason,
  NodeType,
  ScoreUpdateReason,
} from '../../shared/api';
import {
  LOGICAL_FIELD_HEIGHT,
  LOGICAL_FIELD_WIDTH,
  canonicalToLogical,
} from '../../shared/field-layout';
import type {
  ArchiveEntry,
  GameSnapshot,
  GlobalScoreUpdatedMessage,
  InitialSnapshotMessage,
  NodeAddedMessage,
  NodeDeployRejectedMessage,
  NodeDeployResponse,
  NodeRemovedMessage,
  RealtimeEvent,
  ServerBridgeMessage,
  ThroughputResponse,
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

type DockTier = 'mobile' | 'desktop' | 'fullscreen';

type DockLayout = {
  tier: DockTier;
  dockHeight: number;
  cardW: number;
  cardH: number;
  spacing: number;
  iconScale: number;
  iconCenterY: number;
  titleCenterY: number;
  detailCenterY: number;
  titleFontSize: string;
  detailFontSize: string;
  titleVisible: boolean;
  detailVisible: boolean;
};

const POLL_INTERVAL_MS = 30_000; // Relaxed — realtime channel handles live sync
const CONNECTIVITY_FAILURE_THRESHOLD = 3;

const TOOL_CARDS: ToolCard[] = [
  {
    accent: 0x00f0ff,
    description: 'Pull fluid into narrow channels',
    key: NodeType.Attractor,
    label: 'Gravity Well [1]',
  },
  {
    accent: 0xff0055,
    description: 'Push streams away from obstacles',
    key: NodeType.Repeller,
    label: 'Deflection Prism [2]',
  },
  {
    accent: 0xffaa00,
    description: 'Spin particles into orbit',
    key: NodeType.Vortex,
    label: 'Vortex Helix [3]',
  },
];


type ThroughputRetryEntry = {
  count: number;
  attempts: number;
  nextRetryAt: number;
};

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
  offline: 'OFFLINE',
  reconnecting: 'RECONNECTING\u2026',
  syncStalled: 'SYNC STALLED',
  retrying: '\u23F3',
  pending: '\u231B',
} as const;

const MAX_BACKOFF_ATTEMPTS = 3;

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
  private uiScale = 1;
  private playfieldScale = 1;
  private hudHeight = 0;
  private dockHeight = 0;
  private throughputTimer?: Phaser.Time.TimerEvent;
  private pollTimer?: Phaser.Time.TimerEvent;
  private rejectionResetTimer: Phaser.Time.TimerEvent | null = null;
  private selectedTool: NodeType = NodeType.Attractor;
  private rejectedTool: NodeType | null = null;
  private throughputRetryQueue: ThroughputRetryEntry[] = [];
  private deployQueue: Array<{ type: NodeType; x: number; y: number }> = [];
  private deployInFlight = false;
  private currentDeployItem: { type: NodeType; x: number; y: number } | null = null;
  private isOnline = navigator.onLine;
  private consecutiveNetworkFailures = 0;
  private connectivityIndicator!: GameObjects.Text;
  private syncSpinner!: GameObjects.Text;
  private pendingDeployIndicator!: GameObjects.Text;
  private statusTimestamp = 0;
  private fpsText: GameObjects.Text | null = null;
  private realtimeConnection: { disconnect: () => Promise<void> } | null = null;

  private readonly handleToolKeyOne = () => this.selectTool(NodeType.Attractor);
  private readonly handleToolKeyTwo = () => this.selectTool(NodeType.Repeller);
  private readonly handleToolKeyThree = () => this.selectTool(NodeType.Vortex);
  private readonly handleArchiveToggle = () => this.toggleArchive();
  private readonly handleArchiveEscape = () => {
    if (this.isArchiveOpen) {
      this.closeArchive();
    }
  };
  private readonly handleOnline = () => {
    this.isOnline = true;
    this.onConnectivityRestored();
  };
  private readonly handleOffline = () => {
    this.isOnline = false;
    this.onConnectivityLost();
  };
  private resizeHandler: ((gameSize: Phaser.Structs.Size) => void) | null = null;

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

    this.scoreText.setOrigin(1, 0);
    this.timerText.setOrigin(1, 0);
    this.nodeQuotaText.setOrigin(1, 0);

    this.archiveButton = this.add.text(0, 0, 'ARCHIVE [H]', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#00f0ff',
      backgroundColor: '#101420',
      padding: { x: 8, y: 4 },
    }).setInteractive({ useHandCursor: true }).setOrigin(1, 0);
    this.archiveButton.on('pointerdown', () => this.toggleArchive());

    this.connectivityIndicator = this.add.text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#ff0055',
    }).setVisible(false);
    this.syncSpinner = this.add.text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#ffaa00',
    }).setVisible(false);
    this.pendingDeployIndicator = this.add.text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#00f0ff',
    }).setVisible(false);

    this.simulation = new ParticleField(
      this,
      180,
      'particle_circle',
    );
    this.dockContainer = this.add.container(0, 0);
    this.toolUi = this.createToolDock();
    this.createArchivePanel();
    this.createfpsText();

    this.refreshLayout(this.scale.width, this.scale.height);

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
    this.connectivityIndicator.setDepth(9);
    this.syncSpinner.setDepth(9);
    this.pendingDeployIndicator.setDepth(9);
    if (this.archiveButton) {
      this.archiveButton.setDepth(9);
    }
    if (this.archivePanel) {
      this.archivePanel.setDepth(10);
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown);
    this.input.on('pointerdown', this.handlePointerDown);
    this.input.keyboard?.on('keydown-ONE', this.handleToolKeyOne);
    this.input.keyboard?.on('keydown-TWO', this.handleToolKeyTwo);
    this.input.keyboard?.on('keydown-THREE', this.handleToolKeyThree);
    this.input.keyboard?.on('keydown-H', this.handleArchiveToggle);
    this.input.keyboard?.on('keydown-ESC', this.handleArchiveEscape);
    this.throughputTimer = this.time.addEvent({
      callback: this.flushThroughput,
      callbackScope: this,
      delay: 10_000,
      loop: true,
    });
    this.pollTimer = this.time.addEvent({
      callback: this.pollServerState,
      callbackScope: this,
      delay: POLL_INTERVAL_MS,
      loop: true,
    });

    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);

    this.resizeHandler = (gameSize: Phaser.Structs.Size) => {
      this.refreshLayout(gameSize.width, gameSize.height);
    };
    this.scale.on('resize', this.resizeHandler);

    void this.loadInitialSnapshot();
  }

  private refreshLayout(width: number, height: number): void {
    if (!this.simulation || !this.background) {
      return;
    }

    this.cameras.resize(width, height);

    this.background.setSize(width, height);

    // Raw scale factor based on the 800x600 logical layout target.
    const rawScale = Math.min(width / LOGICAL_FIELD_WIDTH, height / LOGICAL_FIELD_HEIGHT);
    // Clamp the UI scale so text and buttons remain readable on small mobile
    // screens without becoming overwhelming on large desktop displays.
    this.uiScale = Math.min(Math.max(rawScale, 0.6), 1.6);

    // Reserve fixed-height HUD and dock areas that scale with the UI. The dock
    // uses a tiered layout (mobile/desktop/fullscreen) so its height grows to
    // accommodate tool names and descriptions on larger screens.
    this.hudHeight = Math.round(72 * this.uiScale);
    this.dockHeight = this.getDockLayout(width, height).dockHeight;

    const availableHeight = Math.max(200, height - this.hudHeight - this.dockHeight);
    this.playfieldScale = Math.min(width / LOGICAL_FIELD_WIDTH, availableHeight / LOGICAL_FIELD_HEIGHT);

    const leftX = Math.round(16 * this.uiScale);
    const topY = Math.round(16 * this.uiScale);
    const rightX = width - Math.round(16 * this.uiScale);

    this.titleText.setPosition(leftX, topY);
    this.titleText.setFontSize(this.uiFontSize(28));
    this.subtitleText.setPosition(leftX, this.titleText.y + this.titleText.height + Math.round(4 * this.uiScale));
    this.subtitleText.setFontSize(this.uiFontSize(12));
    this.statusText.setPosition(leftX, this.subtitleText.y + this.subtitleText.height + Math.round(4 * this.uiScale));
    this.statusText.setFontSize(this.uiFontSize(14));

    this.scoreText.setPosition(rightX, topY);
    this.scoreText.setFontSize(this.uiFontSize(22));
    this.timerText.setPosition(rightX, this.scoreText.y + this.scoreText.height + Math.round(4 * this.uiScale));
    this.timerText.setFontSize(this.uiFontSize(16));
    this.nodeQuotaText.setPosition(rightX, this.timerText.y + this.timerText.height + Math.round(4 * this.uiScale));
    this.nodeQuotaText.setFontSize(this.uiFontSize(14));

    this.connectivityIndicator.setPosition(leftX, topY);
    this.connectivityIndicator.setFontSize(this.uiFontSize(10));
    this.syncSpinner.setFontSize(this.uiFontSize(14));
    if (this.fpsText) {
      this.fpsText.setPosition(leftX, topY + Math.round(12 * this.uiScale));
      this.fpsText.setFontSize(this.uiFontSize(10));
    }

    if (this.archiveButton) {
      this.archiveButton.setPosition(rightX, this.nodeQuotaText.y + this.nodeQuotaText.height + Math.round(8 * this.uiScale));
      this.archiveButton.setFontSize(this.uiFontSize(12));
    }
    this.positionArchivePanel();

    // Center the 800x600 logical playfield in the remaining area between the
    // HUD and the dock, preserving its aspect ratio.
    const playfieldW = Math.round(LOGICAL_FIELD_WIDTH * this.playfieldScale);
    const playfieldH = Math.round(LOGICAL_FIELD_HEIGHT * this.playfieldScale);
    const playfieldX = Math.round((width - playfieldW) / 2);
    const playfieldY = Math.round(this.hudHeight + (availableHeight - playfieldH) / 2);

    this.simulation.setViewport(playfieldX, playfieldY, playfieldW, playfieldH);

    this.drawAtmosphere(width, height);
    this.drawGrid(width, height);
    this.drawFrame();
    this.drawDockRail(width, height);
    this.updateToolDock();
  }

  private uiFontSize(base: number): string {
    const size = Math.round(Math.max(10, base * this.uiScale));
    return `${size}px`;
  }

  private getDockTier(width: number, height: number): DockTier {
    if (width < 640 || height < 520) {
      return 'mobile';
    }
    if (width >= 1280 && height >= 800) {
      return 'fullscreen';
    }
    return 'desktop';
  }

  private getDockLayout(width: number, height: number): DockLayout {
    const sf = this.uiScale;
    const tier = this.getDockTier(width, height);

    const dockHeightBase = tier === 'mobile' ? 140 : tier === 'desktop' ? 150 : 190;
    const dockHeight = Math.round(dockHeightBase * sf);
    const cardMargin = Math.round(16 * sf);
    const cardH = Math.max(Math.round(64 * sf), dockHeight - cardMargin * 2);

    let cardW: number;
    let spacing: number;
    if (tier === 'mobile') {
      cardW = cardH;
      spacing = cardW + Math.round(12 * sf);
    } else if (tier === 'desktop') {
      cardW = Math.round(120 * sf);
      spacing = cardW + Math.round(24 * sf);
    } else {
      cardW = Math.round(150 * sf);
      spacing = cardW + Math.round(40 * sf);
    }

    const iconScale = Math.max(
      0.5,
      Math.min(tier === 'mobile' ? 1.2 : 1.0, cardW / (tier === 'mobile' ? 90 : 140)),
    );
    const iconCenterY =
      tier === 'mobile'
        ? 0
        : -Math.round(cardH / 2) + Math.round(46 * iconScale) + Math.round(8 * sf);
    const titleCenterY =
      tier === 'desktop'
        ? Math.round(cardH / 4)
        : tier === 'fullscreen'
          ? Math.round(cardH / 12)
          : 0;
    const detailCenterY = Math.round(cardH / 3);

    const titleFontSize = tier === 'fullscreen' ? this.uiFontSize(20) : this.uiFontSize(16);
    const detailFontSize = this.uiFontSize(12);

    return {
      tier,
      dockHeight,
      cardW,
      cardH,
      spacing,
      iconScale,
      iconCenterY,
      titleCenterY,
      detailCenterY,
      titleFontSize,
      detailFontSize,
      titleVisible: tier !== 'mobile',
      detailVisible: tier === 'fullscreen',
    };
  }

  private createToolDock(): Record<NodeType, ToolUi> {
    const attractorCard = this.createToolDockCard(TOOL_CARDS[0]!, -200);
    const repellerCard = this.createToolDockCard(TOOL_CARDS[1]!, 0);
    const vortexCard = this.createToolDockCard(TOOL_CARDS[2]!, 200);

    return {
      [NodeType.Attractor]: attractorCard,
      [NodeType.Repeller]: repellerCard,
      [NodeType.Vortex]: vortexCard,
    };
  }

  private createToolDockCard(card: ToolCard, x: number): ToolUi {
    const panel = this.add.container(x, 0);
    const badge = this.add.rectangle(0, 0, 168, 118, 0x101420, 0.92);
    const title = this.add.text(-72, -36, card.label, {
      fontFamily: 'Arial Black',
      fontSize: '18px',
      color: '#f6ffff',
    }).setOrigin(0.5);
    const detail = this.add.text(-72, -4, card.description, {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#9cb7c4',
      wordWrap: { width: 148 },
      align: 'center',
    }).setOrigin(0.5);
    const icon = this.add.graphics();
    const selectHitArea = this.add.zone(0, 0, 168, 118).setOrigin(0.5).setInteractive({
      useHandCursor: true,
    });

    selectHitArea.on('pointerdown', () => {
      this.selectTool(card.key);
    });

    panel.add([badge, icon, title, detail, selectHitArea]);
    this.dockContainer.add(panel);
    return { badge, detail, icon, panel, selectHitArea, title };
  }

  private createfpsText(): void {
    const debugFps = new URLSearchParams(window.location.search).get('debugFps') === '1';
    if (debugFps) {
      this.fpsText = this.add.text(0, 0, 'FPS: --', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#00ff88',
        backgroundColor: '#00000088',
        padding: { x: 4, y: 2 },
      }).setDepth(100).setScrollFactor(0);
    }
  }

  private handleShutdown = () => {
    this.throughputTimer?.remove(false);
    this.pollTimer?.remove(false);
    this.rejectionResetTimer?.remove(false);
    this.rejectionResetTimer = null;
    this.simulation.destroy();
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    if (this.resizeHandler) {
      this.scale.off('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
    this.throughputRetryQueue = [];
    this.deployQueue = [];
    this.deployInFlight = false;
    this.currentDeployItem = null;
    void this.realtimeConnection?.disconnect();
    this.realtimeConnection = null;
    this.input.off('pointerdown', this.handlePointerDown);
    this.input.keyboard?.off('keydown-ONE', this.handleToolKeyOne);
    this.input.keyboard?.off('keydown-TWO', this.handleToolKeyTwo);
    this.input.keyboard?.off('keydown-THREE', this.handleToolKeyThree);
    this.input.keyboard?.off('keydown-H', this.handleArchiveToggle);
    this.input.keyboard?.off('keydown-ESC', this.handleArchiveEscape);
    this.destroyArchivePanel();
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
        this.statusText.setText(`${message.data.message} ${formatRelativeTime(Date.now() - this.statusTimestamp)}`);
        this.statusTimestamp = Date.now();
        break;
      default:
        break;
    }
  }

  private handlePointerDown = (pointer: Phaser.Input.Pointer) => {
    if (this.isArchiveOpen) {
      if (!this.archivePanel || !this.archivePanelBg) return;
      const panelX = this.scale.width / 2;
      const panelY = this.scale.height / 2;
      const halfW = Math.round(Math.min(200 * this.uiScale, this.scale.width * 0.45));
      const halfH = Math.round(Math.min(150 * this.uiScale, this.scale.height * 0.35));
      if (pointer.x < panelX - halfW || pointer.x > panelX + halfW ||
          pointer.y < panelY - halfH || pointer.y > panelY + halfH) {
        this.closeArchive();
        return;
      }
    }

    if (this.pointerHitInteractiveUi(pointer)) {
      return;
    }

    if (!this.snapshot) {
      return;
    }

    const viewport = this.simulation.getViewport();
    const logicalX = ((pointer.x - viewport.x) / viewport.w) * LOGICAL_FIELD_WIDTH;
    const logicalY = ((pointer.y - viewport.y) / viewport.h) * LOGICAL_FIELD_HEIGHT;
    const logical = canonicalToLogical(logicalX, logicalY);

    this.deployQueue.push({
      type: this.selectedTool,
      x: logical.x,
      y: logical.y,
    });
    this.updatePendingDeployIndicator();
    void this.processDeployQueue();
  };

  private pointerHitInteractiveUi(pointer: Phaser.Input.Pointer): boolean {
    const hitObjects = this.input.hitTestPointer(pointer);
    if (hitObjects.length === 0) {
      return false;
    }

    const toolHitAreas = new Set<unknown>(
      Object.values(this.toolUi).map((ui) => ui.selectHitArea)
    );
    for (const obj of hitObjects) {
      if (toolHitAreas.has(obj)) {
        return true;
      }
      if (obj === this.archiveButton) {
        return true;
      }
    }
    return false;
  }

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
    this.processThroughputRetries();
    const collected = this.simulation.step(delta, this.snapshot?.nodes ?? []);
    if (collected > 0) {
      this.queueThroughput(collected);
    }

    if (this.snapshot) {
      const remaining = Math.max(0, this.snapshot.dailyResetAtUtc - Date.now());
      if (remaining <= 0) {
        this.timerText.setText('NEW DAY');
      } else {
        this.timerText.setText(
          `${UI_TEXT.resetTimerPrefix} ${formatCountdown(this.snapshot.dailyResetAtUtc)}`
        );
      }
    }

    if (this.fpsText) {
      const fps = this.game.loop.actualFps;
      this.fpsText.setText(`FPS: ${fps.toFixed(0)}`);
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
      this.throughputRetryQueue.push({
        attempts: 1,
        count: scoreBatch,
        nextRetryAt: Date.now() + 1000,
      });
      this.updateSyncSpinner();
      return;
    }

    this.applyThroughputSuccess(result.data);
  }

  private applyThroughputSuccess(data: ThroughputResponse) {
    this.applyServerMessage({
      data: {
        delta: data.scoreDelta,
        reason: ScoreUpdateReason.Batch,
        score: data.snapshot.globalScore,
      },
      type: BridgeMessageType.GlobalScoreUpdated,
    });

    this.applySnapshot({
      type: BridgeMessageType.InitialSnapshot,
      data: data.snapshot,
    });
  }

  queueThroughput(count: number) {
    this.localPendingScore += count;
  }

  private async loadInitialSnapshot() {
    try {
      const response = await requestInitialSnapshot();
      if (!response.ok) {
        this.consecutiveNetworkFailures++;
        this.checkSyncStalledState();
        this.applyServerMessage({
          data: {
            message: response.error.message,
          },
          type: BridgeMessageType.SyncError,
        });
        return;
      }

      this.consecutiveNetworkFailures = 0;
      this.applySnapshot({
        type: BridgeMessageType.InitialSnapshot,
        data: response.data.snapshot,
      });

      // Connect to the realtime channel now that we have a postId.
      void this.connectRealtimeChannel(response.data.snapshot.postId);
    } catch (error) {
      console.error('Failed to fetch initial snapshot:', error);
      this.consecutiveNetworkFailures++;
      this.checkSyncStalledState();
      this.statusText.setText(UI_TEXT.snapshotFailed);
    }
  }

  private async connectRealtimeChannel(postId: string) {
    if (this.realtimeConnection) {
      return; // Already connected.
    }

    try {
      this.realtimeConnection = await connectRealtime({
        channel: `resonance_field_${postId}`,
        onConnect: () => {
          console.log('[Realtime] Connected to field channel');
        },
        onDisconnect: () => {
          console.log('[Realtime] Disconnected from field channel');
          this.realtimeConnection = null;
        },
        onMessage: (data: unknown) => {
          console.log('[Realtime] Received message:', data);
          this.handleRealtimeEvent(data as RealtimeEvent);
        },
      });
    } catch (error) {
      console.error('[Realtime] Failed to connect:', error);
    }
  }

  private handleRealtimeEvent(event: RealtimeEvent) {
    switch (event.type) {
      case 'node_added':
        console.log('Node added:', event.node);
        // Ignore our own deploys — the HTTP response already applied them.
        if (event.node.ownerId !== this.snapshot?.username) {
          this.applyServerMessage({
            type: BridgeMessageType.NodeAdded,
            data: { node: event.node },
          });
        }
        break;

      case 'node_removed':
        console.log('Node removed:', event.nodeId);
        this.applyServerMessage({
          type: BridgeMessageType.NodeRemoved,
          data: { nodeId: event.nodeId, reason: NodeRemovalReason.Quota },
        });
        break;

      case 'score_updated':
        console.log('Score updated:', event.score);
        // Only apply if the score is higher than what we already have locally
        // (our own throughput flush already updates the snapshot optimistically).
        if (this.snapshot && event.score > this.snapshot.globalScore) {
          this.applyServerMessage({
            type: BridgeMessageType.GlobalScoreUpdated,
            data: {
              score: event.score,
              delta: event.delta,
              reason: ScoreUpdateReason.Batch,
            },
          });
        }
        break;

      default:
        break;
    }
  }

  private applySnapshot(message: InitialSnapshotMessage) {
    const prevLayout = this.snapshot?.fieldLayout;
    const newLayout = message.data.fieldLayout;
    const dayChanged = !prevLayout || (newLayout && prevLayout.dayKey !== newLayout.dayKey);
    const archivedScore = message.data.lastArchivedScore;
    
    // Preserve local tool selection to avoid flickering
    const localSelectedTool = this.selectedTool;

    this.snapshot = { ...message.data, nodes: [...message.data.nodes] };
    // Keep local tool selection unless it's the default (Attractor) and server has something different
    if (localSelectedTool !== NodeType.Attractor || this.snapshot.selectedTool === NodeType.Attractor) {
      this.selectedTool = localSelectedTool;
      this.snapshot.selectedTool = localSelectedTool;
    } else {
      this.selectedTool = this.snapshot.selectedTool;
    }

    if (newLayout && dayChanged) {
      if (prevLayout) {
        const capturedLayout = newLayout;
        this.tweens.add({
          targets: this.simulation,
          alpha: 0,
          duration: 300,
          ease: 'Power2',
          onComplete: () => {
            this.simulation.setFieldLayout(capturedLayout);
            this.tweens.add({
              targets: this.simulation,
              alpha: 1,
              duration: 300,
              ease: 'Power2',
            });
          },
        });
      } else {
        this.simulation.setFieldLayout(newLayout);
      }
    }

    if (archivedScore !== undefined && archivedScore !== null) {
      this.showResetOverlay(archivedScore);
    }

    this.reconcileSnapshotDerivedFields();
    this.statusText.setText(UI_TEXT.initialSnapshot(this.snapshot.username, this.snapshot.subredditName));
    this.renderSnapshot();
  }

  private showResetOverlay(archivedScore: number) {
    const sf = this.uiScale;
    const overlayText = this.add.text(
      this.scale.width / 2,
      this.scale.height / 2,
      `Day archived — Score: ${archivedScore}`,
      {
        fontFamily: 'monospace',
        fontSize: `${Math.round(Math.max(14, 24 * sf))}px`,
        color: '#00f0ff',
        stroke: '#00151a',
        strokeThickness: 4,
      }
    );
    overlayText.setOrigin(0.5);
    overlayText.setDepth(100);
    overlayText.setAlpha(0);

    this.tweens.add({
      targets: overlayText,
      alpha: 1,
      duration: 200,
      ease: 'Power2',
      onComplete: () => {
        this.time.delayedCall(2000, () => {
          this.tweens.add({
            targets: overlayText,
            alpha: 0,
            duration: 300,
            ease: 'Power2',
            onComplete: () => overlayText.destroy(),
          });
        });
      },
    });
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

    // Sync with server. Capture the tool we're replacing so a failed sync can
    // revert to it; reading the revert target from the snapshot later is
    // unsafe because applySnapshot may have already overwritten it with the
    // optimistic local value.
    const previousTool = this.selectedTool === tool ? null : this.selectedTool;
    void this.syncToolSelection(tool, previousTool);
  }

  private async syncToolSelection(tool: NodeType, previousTool: NodeType | null) {
    if (!this.isOnline) {
      return;
    }

    const result = await selectToolRequest(tool);
    if (!result.ok) {
      console.error('Failed to sync tool selection:', result.error.message);
      // Revert to the tool that was active before this selection. Only revert
      // if the user hasn't since picked a different tool (in which case the
      // newer selection wins).
      if (previousTool && this.selectedTool === tool) {
        this.selectedTool = previousTool;
        if (this.snapshot) {
          this.snapshot.selectedTool = previousTool;
        }
        this.updateToolDock();
      }
    }
  }

  private updateToolDock() {
    const activeTool = this.snapshot?.selectedTool ?? this.selectedTool;
    const sf = this.uiScale;
    const { width, height } = this.scale;
    const dockY = height - Math.round(this.dockHeight / 2);
    const layout = this.getDockLayout(width, height);

    TOOL_CARDS.forEach((card, index) => {
      const ui = this.toolUi[card.key];
      const isActive = card.key === activeTool;
      const isRejected = card.key === this.rejectedTool;
      const x = (index - 1) * layout.spacing;

      ui.panel.setPosition(width / 2 + x, dockY);
      ui.badge.setSize(layout.cardW, layout.cardH);
      ui.badge.setPosition(0, 0);
      ui.title.setVisible(layout.titleVisible);
      ui.title.setFontSize(layout.titleFontSize);
      ui.title.setPosition(0, layout.titleCenterY);
      ui.title.setColor(isActive ? '#ffffff' : '#d8e1e8');
      ui.detail.setVisible(layout.detailVisible);
      ui.detail.setFontSize(layout.detailFontSize);
      ui.detail.setPosition(0, layout.detailCenterY);
      ui.detail.setWordWrapWidth(Math.max(40, layout.cardW - Math.round(16 * sf)));
      ui.detail.setColor(isActive ? '#f7fbff' : '#9cb7c4');
      ui.selectHitArea.setSize(layout.cardW, layout.cardH);
      ui.selectHitArea.setPosition(0, 0);
      ui.badge.setFillStyle(
        isRejected ? 0xff0055 : card.accent,
        isRejected ? 0.22 : isActive ? 0.1 : 0.12
      );
      ui.badge.setStrokeStyle(
        isRejected ? Math.round(4 * sf) : isActive ? Math.round(3 * sf) : 1,
        isRejected ? 0xff0055 : card.accent,
        isRejected || isActive ? 1 : 0.4
      );

      const iconCy = layout.iconCenterY;
      const iconScale = layout.iconScale;
      const isMobile = layout.tier === 'mobile';

      ui.icon.clear();
      ui.icon.lineStyle(
        isRejected ? Math.round(4 * sf) : isActive ? Math.round(3 * sf) : 2,
        isRejected ? 0xff0055 : card.accent,
        1
      );
      ui.icon.fillStyle(isRejected ? 0xff0055 : card.accent, isActive ? 0.1 : 0.1);

      if (card.key === NodeType.Attractor) {
        const radii: [number, number, number] = isActive ? [18, 28, 38] : [16, 26, 36];
        const y = iconCy + (isMobile ? 0 : Math.round(-8 * iconScale));
        ui.icon.strokeCircle(0, y + 100, radii[0] * iconScale);
        ui.icon.strokeCircle(0, y, radii[1] * iconScale);
        ui.icon.strokeCircle(0, y, radii[2] * iconScale);
      } else if (card.key === NodeType.Repeller) {
        const ts = iconScale;
        const y = iconCy + (isMobile ? Math.round(2 * ts) : 0);
        ui.icon.strokeTriangle(
          Math.round(-22 * ts),
          Math.round(16 * ts) + y,
          0,
          Math.round(-20 * ts) + y,
          Math.round(22 * ts),
          Math.round(16 * ts) + y
        );
        ui.icon.fillTriangle(
          Math.round(-22 * ts),
          Math.round(16 * ts) + y,
          0,
          Math.round(-20 * ts) + y,
          Math.round(22 * ts),
          Math.round(16 * ts) + y
        );
      } else {
        ui.icon.beginPath();
        ui.icon.arc(
          0,
          iconCy + (isMobile ? 0 : Math.round(-4 * iconScale)),
          (isActive ? 25 : 21) * iconScale,
          Phaser.Math.DegToRad(30),
          Phaser.Math.DegToRad(330),
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

  private drawAtmosphere(width: number, height: number) {
    this.atmosphere.clear();
    this.atmosphere.fillStyle(0x00f0ff, 0.08);
    this.atmosphere.fillCircle(
      Math.round(width * 0.18),
      Math.round(height * 0.22),
      Math.round(Math.min(width, height) * 0.22)
    );
    this.atmosphere.fillStyle(0xff0055, 0.08);
    this.atmosphere.fillCircle(
      Math.round(width * 0.82),
      Math.round(height * 0.18),
      Math.round(Math.min(width, height) * 0.18)
    );
    this.atmosphere.fillStyle(0xffaa00, 0.08);
    this.atmosphere.fillCircle(
      Math.round(width * 0.56),
      Math.round(height * 0.82),
      Math.round(Math.min(width, height) * 0.2)
    );
  }

  private drawGrid(width: number, height: number) {
    this.grid.clear();
    this.grid.lineStyle(1, 0x1a2a36, 0.4);
    const sf = Math.min(width / LOGICAL_FIELD_WIDTH, height / LOGICAL_FIELD_HEIGHT);
    const step = Math.max(8, Math.round(64 * sf));

    for (let x = 0; x <= width; x += step) {
      this.grid.lineBetween(x, 0, x, height);
    }

    for (let y = 0; y <= height; y += step) {
      this.grid.lineBetween(0, y, width, y);
    }
  }

  private drawFrame() {
    this.playfieldFrame.clear();
    const sf = this.uiScale;
    const viewport = this.simulation.getViewport();
    const margin = Math.round(2 * sf);
    this.playfieldFrame.lineStyle(2, 0x00f0ff, 0.45);
    this.playfieldFrame.strokeRoundedRect(
      viewport.x - margin,
      viewport.y - margin,
      viewport.w + margin * 2,
      viewport.h + margin * 2,
      Math.round(12 * sf)
    );
    this.playfieldFrame.lineStyle(1, 0xff0055, 0.28);
    const innerMargin = Math.round(8 * sf);
    this.playfieldFrame.strokeRoundedRect(
      viewport.x + innerMargin,
      viewport.y + innerMargin,
      viewport.w - innerMargin * 2,
      viewport.h - innerMargin * 2,
      Math.round(8 * sf)
    );
  }

  private drawDockRail(width: number, height: number) {
    this.dockRail.clear();
    const sf = this.uiScale;
    const dockY = height - this.dockHeight;
    const railHeight = this.dockHeight - Math.round(16 * sf);
    const railX = Math.round(16 * sf);
    const railW = width - railX * 2;
    this.dockRail.fillStyle(0x0b1019, 0.88);
    this.dockRail.fillRoundedRect(railX, dockY, railW, railHeight, Math.round(16 * sf));
    this.dockRail.lineStyle(1, 0x00f0ff, 0.5);
    this.dockRail.strokeRoundedRect(railX, dockY, railW, railHeight, Math.round(16 * sf));
    this.dockRail.lineStyle(1, 0xff0055, 0.18);
    const innerMargin = Math.round(10 * sf);
    this.dockRail.strokeRoundedRect(
      railX + innerMargin,
      dockY + innerMargin,
      railW - innerMargin * 2,
      railHeight - innerMargin * 2,
      Math.round(10 * sf)
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

  private positionArchivePanel() {
    if (!this.archivePanel) return;
    this.archivePanel.setPosition(this.scale.width / 2, this.scale.height / 2);
    this.archivePanel.setScale(this.uiScale);
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
    this.positionArchivePanel();

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

  private async pollServerState() {
    if (!this.isOnline) {
      return;
    }

    try {
      const response = await requestInitialSnapshot();
      if (!response.ok) {
        this.consecutiveNetworkFailures++;
        this.checkSyncStalledState();
        return;
      }

      this.consecutiveNetworkFailures = 0;
      if (this.connectivityIndicator.visible) {
        this.connectivityIndicator.setVisible(false);
        this.statusText.setText(UI_TEXT.initialSnapshot(this.snapshot?.username ?? '', this.snapshot?.subredditName ?? null));
      }

      const incoming = response.data.snapshot;
      if (this.snapshot) {
        const sameNodes =
          this.snapshot.nodes.length === incoming.nodes.length &&
          this.snapshot.nodes.every((n, i) => n.id === incoming.nodes[i]!.id && n.expiresAt === incoming.nodes[i]!.expiresAt) &&
          this.snapshot.globalScore === incoming.globalScore;

        if (sameNodes && this.snapshot.fieldLayout?.dayKey === incoming.fieldLayout?.dayKey) {
          this.snapshot.dailyResetAtUtc = incoming.dailyResetAtUtc;
          this.snapshot.lastArchivedScore = incoming.lastArchivedScore;
          return;
        }
      }

      this.applySnapshot({
        type: BridgeMessageType.InitialSnapshot,
        data: incoming,
      });
    } catch (_error) {
      this.consecutiveNetworkFailures++;
      this.checkSyncStalledState();
    }
  }

  private checkSyncStalledState() {
    if (this.consecutiveNetworkFailures >= CONNECTIVITY_FAILURE_THRESHOLD && this.isOnline) {
      this.connectivityIndicator.setText(UI_TEXT.syncStalled);
      this.connectivityIndicator.setVisible(true);
      this.pollTimer!.paused = true;
    }
  }

  private onConnectivityLost() {
    this.connectivityIndicator.setText(UI_TEXT.offline);
    this.connectivityIndicator.setVisible(true);
    if (this.pollTimer) {
      this.pollTimer.paused = true;
    }
    this.deployInFlight = false;
  }

  private onConnectivityRestored() {
    this.connectivityIndicator.setText(UI_TEXT.reconnecting);
    this.connectivityIndicator.setVisible(true);
    this.consecutiveNetworkFailures = 0;
    if (this.pollTimer) {
      this.pollTimer.paused = false;
    }
    void this.pollServerState();
  }

  private processThroughputRetries() {
    if (this.throughputRetryQueue.length === 0) {
      return;
    }

    const now = Date.now();
    let readyEntry: { count: number; attempts: number } | null = null;
    const remaining: typeof this.throughputRetryQueue = [];

    for (const entry of this.throughputRetryQueue) {
      if (now < entry.nextRetryAt) {
        remaining.push(entry);
      } else if (!readyEntry) {
        readyEntry = { count: entry.count, attempts: entry.attempts };
      } else {
        remaining.push(entry);
      }
    }

    this.throughputRetryQueue = remaining;
    if (readyEntry) {
      void this.processSingleRetry(readyEntry);
    }
    this.updateSyncSpinner();
  }

  private async processSingleRetry(entry: { count: number; attempts: number }) {
    const result = await submitThroughputRequest(entry.count);
    if (result.ok) {
      this.applyThroughputSuccess(result.data);
      this.updateSyncSpinner();
      return;
    }

    const nextAttempts = entry.attempts + 1;
    if (nextAttempts < MAX_BACKOFF_ATTEMPTS) {
      this.throughputRetryQueue.push({
        attempts: nextAttempts,
        count: entry.count,
        nextRetryAt: Date.now() + 1000 * Math.pow(2, nextAttempts),
      });
    } else {
      this.localPendingScore += entry.count;
      this.statusText.setText(`Score returned to pending after ${MAX_BACKOFF_ATTEMPTS} retries`);
    }
    this.updateSyncSpinner();
  }

  private updateSyncSpinner() {
    if (this.throughputRetryQueue.length > 0) {
      this.syncSpinner.setText(UI_TEXT.retrying);
      this.syncSpinner.setPosition(this.scale.width - Math.round(60 * this.uiScale), Math.round(30 * this.uiScale));
      this.syncSpinner.setVisible(true);
    } else {
      this.syncSpinner.setVisible(false);
    }
  }

  private async processDeployQueue() {
    if (this.deployInFlight || !this.isOnline) {
      return;
    }

    while (this.deployQueue.length > 0) {
      this.deployInFlight = true;
      const item = this.deployQueue.shift()!;
      this.currentDeployItem = item;
      this.updatePendingDeployIndicator();

      const result = await deployNodeRequest({
        type: item.type,
        x: item.x,
        y: item.y,
      });

      if (!result.ok) {
        this.applyServerMessage({
          data: {
            message: result.error.message,
            reason: deriveDeployRejectionReason(result.error.message),
            requested: {
              type: item.type,
              x: item.x,
              y: item.y,
            },
          },
          type: BridgeMessageType.NodeDeployRejected,
        });
      } else {
        this.handleDeploySuccess(result.data);
      }
    }

    this.deployInFlight = false;
    this.currentDeployItem = null;
    this.updatePendingDeployIndicator();
  }

  private updatePendingDeployIndicator() {
    if (this.deployQueue.length === 0 && !this.deployInFlight) {
      this.pendingDeployIndicator.setVisible(false);
      return;
    }

    const count = this.deployQueue.length + (this.deployInFlight ? 1 : 0);
    const tool = this.currentDeployItem?.type ?? this.selectedTool;
    const ui = this.toolUi[tool];
    const layout = this.getDockLayout(this.scale.width, this.scale.height);
    this.pendingDeployIndicator.setText(`${UI_TEXT.pending} ${count}`);
    this.pendingDeployIndicator.setPosition(
      ui.panel.x + Math.round(60 * this.uiScale),
      ui.panel.y - Math.round(layout.cardH / 2) - Math.round(14 * this.uiScale)
    );
    this.pendingDeployIndicator.setVisible(true);
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

const formatRelativeTime = (elapsedMs: number) => {
  if (elapsedMs < 2000) return '(just now)';
  const seconds = Math.floor(elapsedMs / 1000);
  if (seconds < 60) return `(${seconds}s ago)`;
  const minutes = Math.floor(seconds / 60);
  return `(${minutes}m ago)`;
};
