import * as Phaser from 'phaser';
import { NodeType } from '../shared/api';
import type { FieldLayout, GameNode } from '../shared/api';
import { logicalToCanonical } from '../shared/field-layout';

const CAPTURE_RADIUS = 384;

type CanonicalNode = {
  type: NodeType;
  x: number;
  y: number;
};

const NODE_FORCE_SCALE: Record<NodeType, number> = {
  [NodeType.Attractor]: 0.95,
  [NodeType.Repeller]: 1.35,
  [NodeType.Vortex]: 1.75,
};

const PARTICLE_LIFETIME_MS = 1_800_000;
const MAX_SPEED = 28.8;
const BASE_GRAVITY = 0.216;

const VIRTUAL_WIDTH = 1920;
const VIRTUAL_HEIGHT = 1080;

const NODE_ACCENTS: Record<NodeType, number> = {
  [NodeType.Attractor]: 0x00f0ff,
  [NodeType.Repeller]: 0xff0055,
  [NodeType.Vortex]: 0xffaa00,
};

type CanonicalLayout = {
  bounds: { x: number; y: number; w: number; h: number };
  obstacles: Array<{ x: number; y: number; w: number; h: number }>;
  hazards: Array<{ x: number; y: number; r: number }>;
  sink: { x: number; y: number; r: number };
  spawnBand: { x: number; y: number; w: number; h: number };
};

const logicalRectToCanonical = (r: { x: number; y: number; w: number; h: number }) => {
  const tl = logicalToCanonical(r.x, r.y);
  const br = logicalToCanonical(r.x + r.w, r.y + r.h);
  return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
};

const logicalCircleToCanonical = (c: { x: number; y: number; r: number }) => {
  const center = logicalToCanonical(c.x, c.y);
  const edge = logicalToCanonical(c.x + c.r, c.y);
  return { x: center.x, y: center.y, r: edge.x - center.x };
};

export class ParticleField {
  private readonly sinkGraphics: Phaser.GameObjects.Graphics;
  private readonly nodeGraphics: Phaser.GameObjects.Graphics;
  private readonly fieldGraphics: Phaser.GameObjects.Graphics;
  private readonly emitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private sinkPulse = 0;
  private layout: FieldLayout | null = null;
  private canonicalLayout: CanonicalLayout | null = null;
  private layoutVersion = -1;
  private drawnLayoutVersion = -1;
  private viewportX = 0;
  private viewportY = 0;
  private viewportW = VIRTUAL_WIDTH;
  private viewportH = VIRTUAL_HEIGHT;
  private vpScale = 1;
  private viewportLayout: CanonicalLayout | null = null;

  constructor(
    scene: Phaser.Scene,
    particleCount: number,
    particleTexture: string,
  ) {
    this.sinkGraphics = scene.add.graphics().setDepth(2);
    this.nodeGraphics = scene.add.graphics().setDepth(3);
    this.fieldGraphics = scene.add.graphics().setDepth(1);

    this.emitter = scene.add.particles(0, 0, particleTexture, {
      frequency: -1,
      quantity: particleCount,
      maxParticles: particleCount,
      lifespan: PARTICLE_LIFETIME_MS,
      speed: 0,
      alpha: {
        onUpdate: (
          _particle: Phaser.GameObjects.Particles.Particle,
          _key: string,
          t: number,
          _value: number,
        ) => {
          const alpha = 0.25 + t * 0.6;
          return Phaser.Math.Clamp(alpha, 0.25, 0.85);
        },
      },
      tint: 0xe7ffff,
      emitting: true,
    });
    this.emitter.setDepth(4);

    this.seedParticles(particleCount);
  }

  destroy() {
    this.sinkGraphics.destroy();
    this.nodeGraphics.destroy();
    this.fieldGraphics.destroy();
    this.emitter.destroy();
  }

  get alpha(): number {
    return this.sinkGraphics.alpha;
  }

  set alpha(value: number) {
    this.setAlpha(value);
  }

  setAlpha(alpha: number) {
    this.sinkGraphics.setAlpha(alpha);
    this.nodeGraphics.setAlpha(alpha);
    this.fieldGraphics.setAlpha(alpha);
    this.emitter.setAlpha(alpha);
  }

  setFieldLayout(layout: FieldLayout | null) {
    this.layout = layout;
    if (layout) {
      this.layoutVersion += 1;
      this.canonicalLayout = {
        bounds: logicalRectToCanonical(layout.bounds),
        obstacles: layout.obstacles.map(logicalRectToCanonical),
        hazards: layout.hazards.map(logicalCircleToCanonical),
        sink: logicalCircleToCanonical(layout.sink),
        spawnBand: logicalRectToCanonical(layout.spawnBand),
      };
      this.rebuildViewportLayout();
    }
  }

  setViewport(x: number, y: number, w: number, h: number): void {
    this.viewportX = x;
    this.viewportY = y;
    this.viewportW = w;
    this.viewportH = h;
    this.vpScale = w / VIRTUAL_WIDTH;
    this.rebuildViewportLayout();
  }

  getViewport(): { x: number; y: number; w: number; h: number } {
    return { x: this.viewportX, y: this.viewportY, w: this.viewportW, h: this.viewportH };
  }

  private rebuildViewportLayout(): void {
    if (!this.canonicalLayout) {
      this.viewportLayout = null;
      return;
    }
    const s = this.vpScale;
    const ox = this.viewportX;
    const oy = this.viewportY;
    this.viewportLayout = {
      bounds: {
        x: Math.round(this.canonicalLayout.bounds.x * s + ox),
        y: Math.round(this.canonicalLayout.bounds.y * s + oy),
        w: Math.round(this.canonicalLayout.bounds.w * s),
        h: Math.round(this.canonicalLayout.bounds.h * s),
      },
      obstacles: this.canonicalLayout.obstacles.map((o) => ({
        x: Math.round(o.x * s + ox),
        y: Math.round(o.y * s + oy),
        w: Math.round(o.w * s),
        h: Math.round(o.h * s),
      })),
      hazards: this.canonicalLayout.hazards.map((h) => ({
        x: Math.round(h.x * s + ox),
        y: Math.round(h.y * s + oy),
        r: Math.round(h.r * s),
      })),
      sink: {
        x: Math.round(this.canonicalLayout.sink.x * s + ox),
        y: Math.round(this.canonicalLayout.sink.y * s + oy),
        r: Math.round(this.canonicalLayout.sink.r * s),
      },
      spawnBand: {
        x: Math.round(this.canonicalLayout.spawnBand.x * s + ox),
        y: Math.round(this.canonicalLayout.spawnBand.y * s + oy),
        w: Math.round(this.canonicalLayout.spawnBand.w * s),
        h: Math.round(this.canonicalLayout.spawnBand.h * s),
      },
    };
  }

  step(delta: number, nodes: readonly GameNode[]) {
    const now = Date.now();
    const dt = Math.max(0.5, delta / 16.6667);
    const activeNodes = nodes.filter((node) => node.expiresAt > now);

    this.sinkPulse += delta * 0.004;

    if (this.layout && this.drawnLayoutVersion !== this.layoutVersion) {
      this.drawFieldLayout();
      this.drawnLayoutVersion = this.layoutVersion;
    }
    this.drawNodes(activeNodes);

    let collected = 0;

    const canonicalNodes: CanonicalNode[] = activeNodes.map((node) => {
      const c = logicalToCanonical(node.x, node.y);
      return {
        type: node.type,
        x: c.x * this.vpScale + this.viewportX,
        y: c.y * this.vpScale + this.viewportY,
      };
    });

    this.emitter.forEachAlive((particle): void => {
      let ax = 0;
      let ay = BASE_GRAVITY * this.vpScale;

      for (const node of canonicalNodes) {
        const dx = node.x - particle.x;
        const dy = node.y - particle.y;
        const distSq = dx * dx + dy * dy;
        const captureRadiusSq = CAPTURE_RADIUS * CAPTURE_RADIUS * this.vpScale * this.vpScale;

        if (distSq <= 36 || distSq >= captureRadiusSq) {
          continue;
        }

        const distance = Math.sqrt(distSq);
        const forceFactor = ((CAPTURE_RADIUS * this.vpScale - distance) / (CAPTURE_RADIUS * this.vpScale)) * dt;

        if (node.type === NodeType.Attractor) {
          ax += (dx / distance) * forceFactor * NODE_FORCE_SCALE[NodeType.Attractor];
          ay += (dy / distance) * forceFactor * NODE_FORCE_SCALE[NodeType.Attractor];
        } else if (node.type === NodeType.Repeller) {
          ax -= (dx / distance) * forceFactor * NODE_FORCE_SCALE[NodeType.Repeller];
          ay -= (dy / distance) * forceFactor * NODE_FORCE_SCALE[NodeType.Repeller];
        } else {
          ax += (-dy / distance) * forceFactor * NODE_FORCE_SCALE[NodeType.Vortex];
          ay += (dx / distance) * forceFactor * NODE_FORCE_SCALE[NodeType.Vortex];
        }
      }

      particle.velocityX += ax * dt;
      particle.velocityY += ay * dt;

      const currentSpeed = Math.sqrt(
        particle.velocityX * particle.velocityX + particle.velocityY * particle.velocityY
      );
      const maxSpeed = MAX_SPEED * this.vpScale;
      if (currentSpeed > maxSpeed) {
        particle.velocityX = (particle.velocityX / currentSpeed) * maxSpeed;
        particle.velocityY = (particle.velocityY / currentSpeed) * maxSpeed;
      }

      particle.x += particle.velocityX * dt;
      particle.y += particle.velocityY * dt;

      const clampedSpeed = currentSpeed;

      if (this.viewportLayout) {
        const layout = this.viewportLayout;

        for (const obstacle of layout.obstacles) {
          if (
            particle.x >= obstacle.x &&
            particle.x <= obstacle.x + obstacle.w &&
            particle.y >= obstacle.y &&
            particle.y <= obstacle.y + obstacle.h
          ) {
            const distLeft = Math.abs(particle.x - obstacle.x);
            const distRight = Math.abs(particle.x - (obstacle.x + obstacle.w));
            const distTop = Math.abs(particle.y - obstacle.y);
            const distBottom = Math.abs(particle.y - (obstacle.y + obstacle.h));
            const minDist = Math.min(distLeft, distRight, distTop, distBottom);

            if (minDist === distLeft) {
              particle.x = obstacle.x - 1;
              particle.velocityX = -Math.abs(particle.velocityX);
            } else if (minDist === distRight) {
              particle.x = obstacle.x + obstacle.w + 1;
              particle.velocityX = Math.abs(particle.velocityX);
            } else if (minDist === distTop) {
              particle.y = obstacle.y - 1;
              particle.velocityY = -Math.abs(particle.velocityY);
            } else {
              particle.y = obstacle.y + obstacle.h + 1;
              particle.velocityY = Math.abs(particle.velocityY);
            }
          }
        }

        for (const hazard of layout.hazards) {
          const dx = particle.x - hazard.x;
          const dy = particle.y - hazard.y;
          if (dx * dx + dy * dy <= hazard.r * hazard.r) {
            this.respawnParticle(particle);
            return;
          }
        }

        if (this.isCollected(particle, layout)) {
          collected += 1;
          this.respawnParticle(particle, true);
          return;
        }

        const bounds = layout.bounds;

        if (
          particle.x < bounds.x ||
          particle.x > bounds.x + bounds.w ||
          particle.y < bounds.y ||
          particle.y > bounds.y + bounds.h
        ) {
          this.respawnParticle(particle);
          return;
        }
      } else {
        if (this.isCollectedFallback(particle)) {
          collected += 1;
          this.respawnParticle(particle, true);
          return;
        }

        const vpX = this.viewportX;
        const vpY = this.viewportY;
        const vpW = this.viewportW;
        const vpH = this.viewportH;

        if (
          particle.x < vpX - 24 ||
          particle.x > vpX + vpW + 24 ||
          particle.y > vpY + vpH + 24
        ) {
          this.respawnParticle(particle);
          return;
        }

        if (particle.y < vpY - 24) {
          particle.y = vpY - 24;
          particle.velocityY = Math.abs(particle.velocityY);
        }

        if (particle.x < vpX + 24) {
          particle.x = vpX + 24;
          particle.velocityX = Math.abs(particle.velocityX);
        } else if (particle.x > vpX + vpW - 24) {
          particle.x = vpX + vpW - 24;
          particle.velocityX = -Math.abs(particle.velocityX);
        }
      }

      const intensity = Phaser.Math.Clamp(clampedSpeed / MAX_SPEED, 0.2, 1);
      const size = 0.6 + intensity * 1.2;
      particle.scaleX = size;
      particle.scaleY = size;
    }, this);

    return collected;
  }

  private seedParticles(count: number) {
    for (let index = 0; index < count; index += 1) {
      const spawn = this.spawnCoords(index > 0);
      const particle = this.emitter.emitParticleAt(spawn.x, spawn.y);
      if (particle) {
        particle.velocityX = Phaser.Math.FloatBetween(-0.45, 0.45);
        particle.velocityY = Phaser.Math.FloatBetween(0.35, 0.9);
      }
    }
  }

  private spawnCoords(initial = false) {
    const layout = this.viewportLayout ?? this.canonicalLayout;
    const vpW = this.viewportW;
    const vpH = this.viewportH;
    const vpX = this.viewportX;
    const vpY = this.viewportY;
    const spawnBandY = layout
      ? layout.spawnBand.y + layout.spawnBand.h * 0.5
      : vpY + vpH * 0.15;
    const startY = initial
      ? Phaser.Math.Between(-Math.round(spawnBandY), Math.round(vpY + vpH * 0.5))
      : Phaser.Math.Between(-60, 10) + vpY;

    return {
      x: Phaser.Math.Between(Math.max(vpX + 24, vpX), Math.max(vpX + 25, vpX + vpW - 24)),
      y: startY,
    };
  }

  private respawnParticle(
    particle: Phaser.GameObjects.Particles.Particle,
    asBurst = false
  ) {
    const spawn = this.spawnCoords(!asBurst);
    particle.x = spawn.x;
    particle.y = spawn.y;
    const baseV = this.vpScale;
    particle.velocityX = Phaser.Math.FloatBetween(-0.45 * baseV, 0.45 * baseV);
    particle.velocityY = asBurst
      ? Phaser.Math.FloatBetween(0.7 * baseV, 1.6 * baseV)
      : Phaser.Math.FloatBetween(0.35 * baseV, 0.9 * baseV);
    particle.lifeCurrent = particle.life;
    particle.scaleX = 0.6;
    particle.scaleY = 0.6;
  }

  private isCollected(particle: Phaser.GameObjects.Particles.Particle, layout: CanonicalLayout) {
    const sink = layout.sink;

    if (particle.y < sink.y - sink.r * 0.4) {
      return false;
    }

    const dx = particle.x - sink.x;
    const dy = particle.y - sink.y;
    return dx * dx + dy * dy <= sink.r * sink.r;
  }

  private isCollectedFallback(particle: Phaser.GameObjects.Particles.Particle) {
    const sinkX = this.viewportX + this.viewportW / 2;
    const sinkY = this.viewportY + this.viewportH * 0.81;
    const sinkR = Math.min(this.viewportW, this.viewportH) * 0.075;
    if (particle.y < sinkY - sinkR * 0.4) {
      return false;
    }
    const dx = particle.x - sinkX;
    const dy = particle.y - sinkY;
    return dx * dx + dy * dy <= sinkR * sinkR;
  }

  private drawFieldLayout() {
    if (!this.viewportLayout) return;

    this.fieldGraphics.clear();

    for (const obstacle of this.viewportLayout.obstacles) {
      this.fieldGraphics.lineStyle(2, 0x00f0ff, 0.7);
      this.fieldGraphics.fillStyle(0x0d0e15, 0.9);
      this.fieldGraphics.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h);
      this.fieldGraphics.strokeRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h);
    }

    for (const hazard of this.viewportLayout.hazards) {
      const pulse = 0.5 + Math.sin(this.sinkPulse * 2) * 0.3;
      this.fieldGraphics.lineStyle(2, 0xff0055, 0.6 * pulse);
      this.fieldGraphics.strokeCircle(hazard.x, hazard.y, hazard.r * (1 + pulse * 0.2));
    }

    this.drawSink(this.viewportLayout.sink);
  }

  private drawSink(sink: { x: number; y: number; r: number }) {
    this.sinkGraphics.clear();

    const pulse = 0.5 + Math.sin(this.sinkPulse) * 0.25;
    this.sinkGraphics.lineStyle(2, 0x00f0ff, 0.5);
    this.sinkGraphics.strokeCircle(sink.x, sink.y, sink.r * (1.2 + pulse * 0.15));
    this.sinkGraphics.lineStyle(1, 0xffaa00, 0.45);
    this.sinkGraphics.strokeCircle(sink.x, sink.y, sink.r * (0.82 + pulse * 0.1));
    this.sinkGraphics.fillStyle(0x081118, 0.85);
    this.sinkGraphics.fillCircle(sink.x, sink.y, sink.r * 0.72);
    this.sinkGraphics.lineStyle(1, 0xffffff, 0.08);
    this.sinkGraphics.strokeCircle(sink.x, sink.y, sink.r * 0.55);
  }

  private drawNodes(nodes: readonly GameNode[]) {
    this.nodeGraphics.clear();
    const s = this.vpScale;
    const ox = this.viewportX;
    const oy = this.viewportY;

    for (const node of nodes) {
      const c = logicalToCanonical(node.x, node.y);
      const screenX = c.x * s + ox;
      const screenY = c.y * s + oy;
      const accent = NODE_ACCENTS[node.type];
      const nodeScale = Math.max(0.4, s * 0.5);
      if (node.type === NodeType.Attractor) {
        this.nodeGraphics.lineStyle(3, accent, 0.9);
        this.nodeGraphics.strokeCircle(screenX, screenY, 18 * nodeScale);
        this.nodeGraphics.strokeCircle(screenX, screenY, 28 * nodeScale);
        this.nodeGraphics.strokeCircle(screenX, screenY, 38 * nodeScale);
      } else if (node.type === NodeType.Repeller) {
        this.nodeGraphics.lineStyle(3, accent, 0.95);
        this.nodeGraphics.fillStyle(accent, 0.18);
        this.nodeGraphics.fillTriangle(
          screenX - 22 * nodeScale, screenY + 16 * nodeScale,
          screenX, screenY - 20 * nodeScale,
          screenX + 22 * nodeScale, screenY + 16 * nodeScale,
        );
        this.nodeGraphics.strokeTriangle(
          screenX - 22 * nodeScale, screenY + 16 * nodeScale,
          screenX, screenY - 20 * nodeScale,
          screenX + 22 * nodeScale, screenY + 16 * nodeScale,
        );
      } else {
        this.nodeGraphics.lineStyle(3, accent, 0.95);
        this.nodeGraphics.beginPath();
        this.nodeGraphics.arc(screenX, screenY, 24 * nodeScale, Phaser.Math.DegToRad(30), Phaser.Math.DegToRad(330), false);
        this.nodeGraphics.strokePath();
        this.nodeGraphics.lineStyle(1, accent, 0.45);
        this.nodeGraphics.strokeCircle(screenX, screenY, 12 * nodeScale);
      }
    }
  }
}
