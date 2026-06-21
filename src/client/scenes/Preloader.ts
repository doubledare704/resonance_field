import { Scene } from 'phaser';
import * as Phaser from 'phaser';

export class Preloader extends Scene {
  private bg!: Phaser.GameObjects.Image;
  private bar!: Phaser.GameObjects.Rectangle;
  private barOutline!: Phaser.GameObjects.Rectangle;
  private resizeHandler: ((gameSize: Phaser.Structs.Size) => void) | null = null;

  constructor() {
    super('Preloader');
  }

  init() {
    this.bg = this.add.image(0, 0, 'background').setOrigin(0);
    this.barOutline = this.add.rectangle(0, 0, 468, 32).setStrokeStyle(1, 0xffffff);
    this.bar = this.add.rectangle(0, 0, 4, 28, 0xffffff);

    this.updateLayout(this.scale.width, this.scale.height);

    this.load.on('progress', (progress: number) => {
      this.bar.width = 4 + 460 * progress;
    });

    this.resizeHandler = (gameSize: Phaser.Structs.Size) => {
      this.updateLayout(gameSize.width, gameSize.height);
    };
    this.scale.on('resize', this.resizeHandler);

    this.events.once('shutdown', this.handleShutdown);
  }

  private handleShutdown = () => {
    if (this.resizeHandler) {
      this.scale.off('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
  };

  private updateLayout(width: number, height: number): void {
    if (!this.bg || !this.barOutline || !this.bar) {
      return;
    }

    this.cameras.resize(width, height);
    this.bg.setDisplaySize(width, height);

    const centerX = width / 2;
    const centerY = height / 2;
    const sf = Math.min(width / 1024, height / 768);

    this.barOutline.setPosition(centerX, centerY);
    this.barOutline.setSize(Math.round(468 * sf), Math.round(32 * sf));
    this.barOutline.setStrokeStyle(Math.max(1, Math.round(1 * sf)), 0xffffff);

    this.bar.setPosition(centerX - Math.round(230 * sf), centerY);
    this.bar.setSize(Math.round(4 * sf), Math.round(28 * sf));
  }

  preload() {
    this.load.setPath('../assets');
    this.load.image('logo', 'logo.png');
  }

  create() {
    const gfx = this.make.graphics({ x: 0, y: 0 });
    gfx.fillStyle(0xffffff, 1);
    gfx.fillCircle(4, 4, 4);
    gfx.generateTexture('particle_circle', 8, 8);
    gfx.destroy();

    this.scene.start('MainMenu');
  }
}
