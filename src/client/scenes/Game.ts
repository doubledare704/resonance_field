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
  NodeDeployResponse,
  NodeRemovedMessage,
  ServerBridgeMessage,
} from '../../shared/api';

export class Game extends Scene {
  camera: Phaser.Cameras.Scene2D.Camera;
  background: GameObjects.Rectangle;
  titleText: GameObjects.Text;
  statusText: GameObjects.Text;
  scoreText: GameObjects.Text;
  nodeText: GameObjects.Text;
  toolText: GameObjects.Text;
  snapshot: GameSnapshot | null = null;
  localPendingScore = 0;
  private throughputTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super('Game');
  }

  create() {
    this.camera = this.cameras.main;
    this.camera.setBackgroundColor('#0d0e15');

    this.background = this.add.rectangle(0, 0, 1, 1, 0x0d0e15).setOrigin(0);
    this.titleText = this.add.text(0, 0, 'Resonance Field', {
      fontFamily: 'Arial Black',
      fontSize: '38px',
      color: '#00f0ff',
      stroke: '#00151a',
      strokeThickness: 6,
    });
    this.statusText = this.add.text(0, 0, 'Waiting for contract snapshot...', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#c7f9ff',
    });
    this.scoreText = this.add.text(0, 0, 'Score: 0', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#ffaa00',
    });
    this.nodeText = this.add.text(0, 0, 'Nodes: 0 / 3', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#ff0055',
    });
    this.toolText = this.add.text(0, 0, 'Tool: ATTRACTOR', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#ffffff',
    });

    this.refreshLayout();
    this.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
      this.refreshLayout(gameSize.width, gameSize.height);
    });

    window.addEventListener('message', this.handleBridgeMessage);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown);
    this.input.on('pointerdown', this.handlePointerDown);
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

  private handleShutdown = () => {
    this.throughputTimer?.remove(false);
    window.removeEventListener('message', this.handleBridgeMessage);
    this.input.off('pointerdown', this.handlePointerDown);
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
      case 'INITIAL_SNAPSHOT':
        this.applySnapshot(message);
        break;
      case 'NODE_ADDED':
        this.mergeNode(message);
        break;
      case 'NODE_REMOVED':
        this.removeNode(message);
        break;
      case 'GLOBAL_SCORE_UPDATED':
        this.updateScore(message);
        break;
      case 'NODE_DEPLOY_REJECTED':
        this.statusText.setText(message.data.message);
        break;
      case 'SYNC_ERROR':
        this.statusText.setText(message.data.message);
        break;
      default:
        break;
    }
  };

  private handlePointerDown = async (pointer: Phaser.Input.Pointer) => {
    if (!this.snapshot) {
      return;
    }

    const result = await deployNodeRequest({
      type: this.snapshot.selectedTool,
      x: pointer.worldX,
      y: pointer.worldY,
    });

    if (!result.ok) {
      const requested = {
        type: this.snapshot.selectedTool,
        x: pointer.worldX,
        y: pointer.worldY,
      };

      this.applyServerMessage({
        data: {
          message: result.error.message,
          reason: deriveDeployRejectionReason(result.error.message),
          requested,
        },
        type: 'NODE_DEPLOY_REJECTED',
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
          reason: 'quota',
        },
        type: 'NODE_REMOVED',
      });
    }

    this.applyServerMessage({
      data: {
        node: result.node,
      },
      type: 'NODE_ADDED',
    });

    this.applySnapshot({
      type: 'INITIAL_SNAPSHOT',
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
        type: 'SYNC_ERROR',
      });
      return;
    }

    this.applyServerMessage({
      data: {
        delta: result.data.scoreDelta,
        reason: 'batch',
        score: result.data.snapshot.globalScore,
      },
      type: 'GLOBAL_SCORE_UPDATED',
    });

    this.applySnapshot({
      type: 'INITIAL_SNAPSHOT',
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
          type: 'SYNC_ERROR',
        });
        return;
      }

      this.applySnapshot({
        type: 'INITIAL_SNAPSHOT',
        data: response.data.snapshot,
      });
    } catch (error) {
      console.error('Failed to fetch initial snapshot:', error);
      this.statusText.setText('Snapshot load failed. Waiting for bridge sync...');
    }
  }

  private applySnapshot(message: InitialSnapshotMessage) {
    this.snapshot = { ...message.data, nodes: [...message.data.nodes] };
    this.statusText.setText(
      `Snapshot ready for ${this.snapshot.username} in ${this.snapshot.subredditName ?? 'unknown'}`
    );
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

    this.scoreText.setText(`Score: ${this.snapshot.globalScore}`);
    this.nodeText.setText(
      `Nodes: ${this.snapshot.nodes.length} / ${this.snapshot.userMaxActiveNodes}`
    );
    this.toolText.setText(`Tool: ${this.snapshot.selectedTool}`);
  }

  private refreshLayout(width = this.scale.width, height = this.scale.height) {
    this.cameras.resize(width, height);
    this.background.setSize(width, height);

    const margin = 28;
    this.titleText.setPosition(margin, margin);
    this.statusText.setPosition(margin, margin + 54);
    this.scoreText.setPosition(margin, height - margin - 84);
    this.nodeText.setPosition(margin, height - margin - 52);
    this.toolText.setPosition(margin, height - margin - 20);
  }
}

const deriveDeployRejectionReason = (message: string) => {
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes('position')) {
    return 'invalid_position' as const;
  }
  if (lowerMessage.includes('type')) {
    return 'invalid_type' as const;
  }
  if (lowerMessage.includes('quota')) {
    return 'quota_exceeded' as const;
  }
  return 'sync_required' as const;
};
