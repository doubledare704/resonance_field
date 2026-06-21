import * as Phaser from 'phaser';
import { NodeType } from '../shared/api';

type ToolCard = {
  key: NodeType;
  label: string;
  accent: number;
  description: string;
};

type ToolUi = {
  panel: Phaser.GameObjects.Container;
  badge: Phaser.GameObjects.Rectangle;
  title: Phaser.GameObjects.Text;
  detail: Phaser.GameObjects.Text;
  icon: Phaser.GameObjects.Graphics;
  selectHitArea: Phaser.GameObjects.Zone;
};

type DockTier = 'mobile' | 'desktop' | 'fullscreen';

export type DockLayout = {
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

export class ToolDock {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly onSelectTool: (tool: NodeType) => void;
  private readonly toolUi: Record<NodeType, ToolUi>;

  constructor(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    onSelectTool: (tool: NodeType) => void
  ) {
    this.scene = scene;
    this.container = container;
    this.onSelectTool = onSelectTool;
    this.toolUi = this.createToolDock();
  }

  getHitAreas(): Phaser.GameObjects.Zone[] {
    return Object.values(this.toolUi).map((ui) => ui.selectHitArea);
  }

  getToolPanel(tool: NodeType): Phaser.GameObjects.Container {
    return this.toolUi[tool].panel;
  }

  destroy() {
    Object.values(this.toolUi).forEach((ui) => {
      ui.panel.destroy();
    });
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
    const panel = this.scene.add.container(x, 0);
    const badge = this.scene.add.rectangle(0, 0, 168, 118, 0x101420, 0.92);
    const title = this.scene.add.text(-72, -36, card.label, {
      fontFamily: 'Arial Black',
      fontSize: '18px',
      color: '#f6ffff',
    }).setOrigin(0.5);
    const detail = this.scene.add.text(-72, -4, card.description, {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#9cb7c4',
      wordWrap: { width: 148 },
      align: 'center',
    }).setOrigin(0.5);
    const icon = this.scene.add.graphics();
    const selectHitArea = this.scene.add.zone(0, 0, 168, 118).setOrigin(0.5).setInteractive({
      useHandCursor: true,
    });

    selectHitArea.on('pointerdown', () => {
      this.onSelectTool(card.key);
    });

    panel.add([badge, icon, title, detail, selectHitArea]);
    this.container.add(panel);
    return { badge, detail, icon, panel, selectHitArea, title };
  }


  static getLayout(width: number, height: number, uiScale: number): DockLayout {
    const tier = ToolDock.getDockTier(width, height);

    const dockHeightBase = tier === 'mobile' ? 140 : tier === 'desktop' ? 150 : 190;
    const dockHeight = Math.round(dockHeightBase * uiScale);
    const cardMargin = Math.round(16 * uiScale);
    const cardH = Math.max(Math.round(64 * uiScale), dockHeight - cardMargin * 2);

    let cardW: number;
    let spacing: number;
    if (tier === 'mobile') {
      cardW = cardH;
      spacing = cardW + Math.round(12 * uiScale);
    } else if (tier === 'desktop') {
      cardW = Math.round(120 * uiScale);
      spacing = cardW + Math.round(24 * uiScale);
    } else {
      cardW = Math.round(150 * uiScale);
      spacing = cardW + Math.round(40 * uiScale);
    }

    const iconScale = Math.max(
      0.5,
      Math.min(tier === 'mobile' ? 1.2 : 1.0, cardW / (tier === 'mobile' ? 90 : 140)),
    );
    const iconCenterY =
      tier === 'mobile'
        ? 0
        : -Math.round(cardH / 2) + Math.round(46 * iconScale) + Math.round(8 * uiScale);
    const titleCenterY =
      tier === 'desktop'
        ? Math.round(cardH / 4)
        : tier === 'fullscreen'
          ? Math.round(cardH / 12)
          : 0;
    const detailCenterY = Math.round(cardH / 3);

    const titleFontSize = ToolDock.uiFontSize(tier === 'fullscreen' ? 20 : 16, uiScale);
    const detailFontSize = ToolDock.uiFontSize(12, uiScale);

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

  static getDockTier(width: number, height: number): DockTier {
    if (width < 640 || height < 520) {
      return 'mobile';
    }
    if (width >= 1280 && height >= 800) {
      return 'fullscreen';
    }
    return 'desktop';
  }

  static uiFontSize(base: number, uiScale: number): string {
    const size = Math.round(Math.max(10, base * uiScale));
    return `${size}px`;
  }

  update(
    activeTool: NodeType,
    rejectedTool: NodeType | null,
    uiScale: number,
    width: number,
    height: number,
    dockHeight: number
  ) {
    const dockY = height - Math.round(dockHeight / 2);
    const layout = ToolDock.getLayout(width, height, uiScale);

    TOOL_CARDS.forEach((card, index) => {
      const ui = this.toolUi[card.key];
      const isActive = card.key === activeTool;
      const isRejected = card.key === rejectedTool;
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
      ui.detail.setWordWrapWidth(Math.max(40, layout.cardW - Math.round(16 * uiScale)));
      ui.detail.setColor(isActive ? '#f7fbff' : '#9cb7c4');
      ui.selectHitArea.setSize(layout.cardW, layout.cardH);
      ui.selectHitArea.setPosition(0, 0);
      ui.badge.setFillStyle(
        isRejected ? 0xff0055 : card.accent,
        isRejected ? 0.22 : isActive ? 0.1 : 0.12
      );
      ui.badge.setStrokeStyle(
        isRejected ? Math.round(4 * uiScale) : isActive ? Math.round(3 * uiScale) : 1,
        isRejected ? 0xff0055 : card.accent,
        isRejected || isActive ? 1 : 0.4
      );

      const iconCy = layout.iconCenterY;
      const iconScale = layout.iconScale;
      const isMobile = layout.tier === 'mobile';

      ui.icon.clear();
      ui.icon.lineStyle(
        isRejected ? Math.round(4 * uiScale) : isActive ? Math.round(3 * uiScale) : 2,
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
}