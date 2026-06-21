import * as Phaser from 'phaser';
import { formatDayKey } from './game-utils';
import type { ArchiveEntry } from '../shared/api';

type ArchivePanelOptions = {
  scene: Phaser.Scene;
  fetchEntries: () => Promise<ArchiveEntry[]>;
};

export class ArchivePanel {
  private readonly scene: Phaser.Scene;
  private readonly fetchEntries: () => Promise<ArchiveEntry[]>;
  private readonly panel: Phaser.GameObjects.Container;
  private readonly panelBg: Phaser.GameObjects.Rectangle;
  private readonly entryContainer: Phaser.GameObjects.Container;
  private readonly panelWidth = 400;
  private readonly panelHeight = 300;
  private readonly entryHeight = 28;
  private readonly headerHeight = 36;
  private readonly contentHeight: number;

  private entries: ArchiveEntry[] = [];
  private scrollY = 0;
  private isOpen = false;
  private isLoading = false;
  private cache: ArchiveEntry[] | null = null;
  private dragState = { isDragging: false, startY: 0, startScrollY: 0 };

  private readonly pointerMoveHandler: (pointer: Phaser.Input.Pointer) => void;
  private readonly pointerUpHandler: () => void;
  private readonly pointerOutHandler: () => void;

  constructor(options: ArchivePanelOptions) {
    this.scene = options.scene;
    this.fetchEntries = options.fetchEntries;
    this.contentHeight = this.panelHeight - this.headerHeight;

    this.panel = this.scene.add.container(0, 0);
    this.panel.setDepth(10);
    this.panel.setVisible(false);

    this.panelBg = this.scene.add.rectangle(0, 0, this.panelWidth, this.panelHeight, 0x0d0e15, 0.92);
    this.panelBg.setStrokeStyle(2, 0x00f0ff);
    this.panel.add(this.panelBg);

    const title = this.scene.add.text(0, -this.panelHeight / 2 + 12, 'ARCHIVE', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#00f0ff',
    }).setOrigin(0.5, 0);
    this.panel.add(title);

    const headerLine = this.scene.add.graphics();
    headerLine.lineStyle(1, 0x00f0ff, 0.3);
    headerLine.lineBetween(
      -this.panelWidth / 2 + 12,
      -this.panelHeight / 2 + 30,
      this.panelWidth / 2 - 12,
      -this.panelHeight / 2 + 30
    );
    this.panel.add(headerLine);

    const columnHeaders = this.scene.add.text(0, -this.panelHeight / 2 + 32, 'Date          Score        Nodes       Seed', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#5a7a8a',
    }).setOrigin(0.5, 0);
    this.panel.add(columnHeaders);

    this.entryContainer = this.scene.add.container(0, 0);
    this.panel.add(this.entryContainer);

    this.createMask();
    this.createEmptyText();
    this.setupDragHandlers();

    this.pointerMoveHandler = (pointer: Phaser.Input.Pointer) => {
      if (!this.dragState.isDragging) return;
      const dy = pointer.y - this.dragState.startY;
      const totalH = this.entries.length * this.entryHeight;
      const maxScroll = Math.max(0, totalH - this.contentHeight);
      this.scrollY = Phaser.Math.Clamp(this.dragState.startScrollY + dy, -maxScroll, 0);
      this.entryContainer.setY(this.scrollY);
    };
    this.pointerUpHandler = () => {
      this.dragState.isDragging = false;
    };
    this.pointerOutHandler = () => {
      this.dragState.isDragging = false;
    };

    this.scene.input.on('pointermove', this.pointerMoveHandler);
    this.scene.input.on('pointerup', this.pointerUpHandler);
    this.scene.input.on('pointerout', this.pointerOutHandler);
  }

  getPanel() {
    return this.panel;
  }

  isVisible() {
    return this.isOpen;
  }

  open() {
    this.isOpen = true;
    this.panel.setVisible(true);

    if (this.cache) {
      this.renderEntries(this.cache);
    } else if (!this.isLoading) {
      void this.fetchAndRender();
    }
  }

  close() {
    this.isOpen = false;
    this.panel.setVisible(false);
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  setPosition(x: number, y: number) {
    this.panel.setPosition(x, y);
  }

  setScale(scale: number) {
    this.panel.setScale(scale);
  }

  destroy() {
    this.scene.input.off('pointermove', this.pointerMoveHandler);
    this.scene.input.off('pointerup', this.pointerUpHandler);
    this.scene.input.off('pointerout', this.pointerOutHandler);
    this.panel.destroy();
  }

  private createMask() {
    const clipX = -this.panelWidth / 2 + 2;
    const clipY = -this.panelHeight / 2 + this.headerHeight;
    const clipW = this.panelWidth - 4;
    const clipH = this.contentHeight;

    const maskGraphics = this.scene.add.graphics();
    maskGraphics.fillStyle(0xffffff);
    maskGraphics.fillRect(clipX, clipY, clipW, clipH);
    maskGraphics.setVisible(false);
    const geometryMask = maskGraphics.createGeometryMask();
    this.entryContainer.setMask(geometryMask);
  }

  private createEmptyText() {
    const emptyText = this.scene.add.text(0, 0, 'No archived days yet', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#5a7a8a',
    }).setOrigin(0.5);
    emptyText.setName('archiveEmpty');
    this.entryContainer.add(emptyText);
  }

  private setupDragHandlers() {
    this.entryContainer.setInteractive(
      new Phaser.Geom.Rectangle(
        -this.panelWidth / 2,
        -this.panelHeight / 2 + this.headerHeight,
        this.panelWidth,
        this.contentHeight
      ),
      Phaser.Geom.Rectangle.Contains
    );

    this.entryContainer.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const totalH = this.entries.length * this.entryHeight;
      if (totalH > this.contentHeight) {
        this.dragState.isDragging = true;
        this.dragState.startY = pointer.y;
        this.dragState.startScrollY = this.scrollY;
      }
    });
  }

  private async fetchAndRender() {
    if (this.isLoading) return;
    this.isLoading = true;

    try {
      const entries = await this.fetchEntries();
      this.cache = entries;
      this.renderEntries(entries);
    } catch (error) {
      console.error('Archive fetch error:', error);
      this.renderEntries([]);
    } finally {
      this.isLoading = false;
    }
  }


  renderEntries(entries: ArchiveEntry[]) {
    this.entries = entries;
    this.scrollY = 0;
    this.entryContainer.setY(0);
    this.entryContainer.removeAll(true);

    if (entries.length === 0) {
      this.createEmptyText();
      return;
    }

    const bestScore = Math.max(...entries.map((e) => e.score));

    entries.forEach((entry, index) => {
      const isBest = entry.score === bestScore && entries.length > 1;
      const rowBg = this.scene.add.rectangle(
        0,
        index * this.entryHeight,
        396,
        this.entryHeight - 2,
        isBest ? 0x1a1a00 : index % 2 === 0 ? 0x101420 : 0x0d0e15,
        0.6
      );
      if (isBest) {
        rowBg.setStrokeStyle(1, 0xffd700, 0.8);
      }
      this.entryContainer.add(rowBg);

      const dateStr = formatDayKey(entry.dayKey);
      const scoreColor = isBest ? '#ffd700' : '#ffaa00';
      const rowText = this.scene.add.text(-180, index * this.entryHeight, dateStr, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#9cb7c4',
      }).setOrigin(0, 0.5);
      this.entryContainer.add(rowText);

      const scoreText = this.scene.add.text(-70, index * this.entryHeight, String(entry.score), {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: scoreColor,
      }).setOrigin(0, 0.5);
      this.entryContainer.add(scoreText);

      const nodesText = this.scene.add.text(40, index * this.entryHeight, String(entry.nodeCount), {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#9cb7c4',
      }).setOrigin(0, 0.5);
      this.entryContainer.add(nodesText);

      const seedText = this.scene.add.text(120, index * this.entryHeight, String(entry.layoutSeed), {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#5a7a8a',
      }).setOrigin(0, 0.5);
      this.entryContainer.add(seedText);
    });
  }
}