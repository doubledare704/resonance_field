import * as Phaser from 'phaser';
import { NodeType } from '../shared/api';
import type { FieldLayout, GameNode } from '../shared/api';
import { scaleFieldX, scaleFieldY } from '../shared/field-layout';

const CAPTURE_RADIUS = 160;

// A node projected into screen space. Node coordinates are stored in logical
// field units (0..LOGICAL_FIELD_*) while particles live in screen pixels, so
// we precompute the screen position once per frame instead of recomputing it
// for every particle in the inner loop.
type ScreenNode = {
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
const MAX_SPEED = 12;
const BASE_GRAVITY = 0.09;

const NODE_ACCENTS: Record<NodeType, number> = {
  [NodeType.Attractor]: 0x00f0ff,
  [NodeType.Repeller]: 0xff0055,
  [NodeType.Vortex]: 0xffaa00,
};

export class ParticleField {
  private readonly sinkGraphics: Phaser.GameObjects.Graphics;
  private readonly nodeGraphics: Phaser.GameObjects.Graphics;
  private readonly fieldGraphics: Phaser.GameObjects.Graphics;
  private readonly emitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private sinkPulse = 0;
  private layout: FieldLayout | null = null;
  private layoutVersion = -1;
  private drawnLayoutVersion = -1;

  constructor(
    scene: Phaser.Scene,
    private width: number,
    private height: number,
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

  setSize(width: number, height: number) {
    this.width = width;
    this.height = height;
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
    }
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

    // Precompute each active node's screen position once for the whole frame.
    // Node coordinates are stored in logical field units (0..LOGICAL_FIELD_*)
    // while particles live in screen pixels; converting here (instead of
    // inside the per-particle loop) avoids recomputing the same invariant
    // value for every particle × every node.
    const screenNodes: ScreenNode[] = activeNodes.map((node) => ({
      type: node.type,
      x: scaleFieldX(node.x, this.width),
      y: scaleFieldY(node.y, this.height),
    }));

    this.emitter.forEachAlive((particle): void => {
      let ax = 0;
      let ay = BASE_GRAVITY;

      for (const node of screenNodes) {
        const dx = node.x - particle.x;
        const dy = node.y - particle.y;
        const distSq = dx * dx + dy * dy;
        const captureRadiusSq = CAPTURE_RADIUS * CAPTURE_RADIUS;

        if (distSq <= 36 || distSq >= captureRadiusSq) {
          continue;
        }

        const distance = Math.sqrt(distSq);
        const forceFactor = ((CAPTURE_RADIUS - distance) / CAPTURE_RADIUS) * dt;

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
      if (currentSpeed > MAX_SPEED) {
        particle.velocityX = (particle.velocityX / currentSpeed) * MAX_SPEED;
        particle.velocityY = (particle.velocityY / currentSpeed) * MAX_SPEED;
      }

      particle.x += particle.velocityX * dt;
      particle.y += particle.velocityY * dt;

      const clampedSpeed = currentSpeed;

      if (this.layout) {
        for (const obstacle of this.layout.obstacles) {
          const screenX = scaleFieldX(obstacle.x, this.width);
          const screenY = scaleFieldY(obstacle.y, this.height);
          const screenW = scaleFieldX(obstacle.w, this.width) - scaleFieldX(0, this.width);
          const screenH = scaleFieldY(obstacle.h, this.height) - scaleFieldY(0, this.height);

          if (
            particle.x >= screenX &&
            particle.x <= screenX + screenW &&
            particle.y >= screenY &&
            particle.y <= screenY + screenH
          ) {
            const distLeft = Math.abs(particle.x - screenX);
            const distRight = Math.abs(particle.x - (screenX + screenW));
            const distTop = Math.abs(particle.y - screenY);
            const distBottom = Math.abs(particle.y - (screenY + screenH));
            const minDist = Math.min(distLeft, distRight, distTop, distBottom);

            // Push particle out of obstacle instead of just bouncing
            if (minDist === distLeft) {
              particle.x = screenX - 1;
              particle.velocityX = -Math.abs(particle.velocityX);
            } else if (minDist === distRight) {
              particle.x = screenX + screenW + 1;
              particle.velocityX = Math.abs(particle.velocityX);
            } else if (minDist === distTop) {
              particle.y = screenY - 1;
              particle.velocityY = -Math.abs(particle.velocityY);
            } else {
              particle.y = screenY + screenH + 1;
              particle.velocityY = Math.abs(particle.velocityY);
            }
          }
        }

        for (const hazard of this.layout.hazards) {
          const screenX = scaleFieldX(hazard.x, this.width);
          const screenY = scaleFieldY(hazard.y, this.height);
          const screenR = scaleFieldX(hazard.r, this.width);
          const dx = particle.x - screenX;
          const dy = particle.y - screenY;
          if (dx * dx + dy * dy <= screenR * screenR) {
            this.respawnParticle(particle);
            return;
          }
        }

        if (this.isCollected(particle)) {
          collected += 1;
          this.respawnParticle(particle, true);
          return;
        }

        const bounds = this.layout.bounds;
        const screenBoundsX = scaleFieldX(bounds.x, this.width);
        const screenBoundsY = scaleFieldY(bounds.y, this.height);
        const screenBoundsW = scaleFieldX(bounds.w, this.width) - scaleFieldX(0, this.width);
        const screenBoundsH = scaleFieldY(bounds.h, this.height) - scaleFieldY(0, this.height);

        if (
          particle.x < screenBoundsX ||
          particle.x > screenBoundsX + screenBoundsW ||
          particle.y < screenBoundsY ||
          particle.y > screenBoundsY + screenBoundsH
        ) {
          this.respawnParticle(particle);
          return;
        }
      } else {
        if (this.isCollected(particle)) {
          collected += 1;
          this.respawnParticle(particle, true);
          return;
        }

        if (
          particle.x < -24 ||
          particle.x > this.width + 24 ||
          particle.y > this.height + 24
        ) {
          this.respawnParticle(particle);
          return;
        }

        if (particle.y < -24) {
          particle.y = -24;
          particle.velocityY = Math.abs(particle.velocityY);
        }

        if (particle.x < 24) {
          particle.x = 24;
          particle.velocityX = Math.abs(particle.velocityX);
        } else if (particle.x > this.width - 24) {
          particle.x = this.width - 24;
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
    const spawnBandY = this.layout
      ? scaleFieldY(this.layout.spawnBand.y + this.layout.spawnBand.h * 0.5, this.height)
      : this.height * 0.15;
    const startY = initial
      ? Phaser.Math.Between(-Math.round(spawnBandY), Math.round(this.height * 0.5))
      : Phaser.Math.Between(-60, 10);

    return {
      x: Phaser.Math.Between(24, Math.max(25, this.width - 24)),
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
    particle.velocityX = Phaser.Math.FloatBetween(-0.45, 0.45);
    particle.velocityY = asBurst
      ? Phaser.Math.FloatBetween(0.7, 1.6)
      : Phaser.Math.FloatBetween(0.35, 0.9);
    particle.lifeCurrent = particle.life;
    particle.scaleX = 0.6;
    particle.scaleY = 0.6;
  }

  private isCollected(particle: Phaser.GameObjects.Particles.Particle) {
    if (!this.layout) {
      const sinkX = this.width / 2;
      const sinkY = this.height * 0.81;
      const sinkR = Math.min(this.width, this.height) * 0.075;
      if (particle.y < sinkY - sinkR * 0.4) {
        return false;
      }
      const dx = particle.x - sinkX;
      const dy = particle.y - sinkY;
      return dx * dx + dy * dy <= sinkR * sinkR;
    }

    const sink = this.layout.sink;
    const screenX = scaleFieldX(sink.x, this.width);
    const screenY = scaleFieldY(sink.y, this.height);
    const screenR = scaleFieldX(sink.r, this.width);

    if (particle.y < screenY - screenR * 0.4) {
      return false;
    }

    const dx = particle.x - screenX;
    const dy = particle.y - screenY;
    return dx * dx + dy * dy <= screenR * screenR;
  }

  private drawFieldLayout() {
    if (!this.layout) return;

    this.fieldGraphics.clear();

    for (const obstacle of this.layout.obstacles) {
      const x = scaleFieldX(obstacle.x, this.width);
      const y = scaleFieldY(obstacle.y, this.height);
      const w = scaleFieldX(obstacle.w, this.width) - scaleFieldX(0, this.width);
      const h = scaleFieldY(obstacle.h, this.height) - scaleFieldY(0, this.height);

      this.fieldGraphics.lineStyle(2, 0x00f0ff, 0.7);
      this.fieldGraphics.fillStyle(0x0d0e15, 0.9);
      this.fieldGraphics.fillRect(x, y, w, h);
      this.fieldGraphics.strokeRect(x, y, w, h);
    }

    for (const hazard of this.layout.hazards) {
      const x = scaleFieldX(hazard.x, this.width);
      const y = scaleFieldY(hazard.y, this.height);
      const r = scaleFieldX(hazard.r, this.width);

      const pulse = 0.5 + Math.sin(this.sinkPulse * 2) * 0.3;
      this.fieldGraphics.lineStyle(2, 0xff0055, 0.6 * pulse);
      this.fieldGraphics.strokeCircle(x, y, r * (1 + pulse * 0.2));
    }

    this.drawSink(this.layout.sink);
  }

  private drawSink(sink: { x: number; y: number; r: number }) {
    this.sinkGraphics.clear();

    const screenX = scaleFieldX(sink.x, this.width);
    const screenY = scaleFieldY(sink.y, this.height);
    const screenR = scaleFieldX(sink.r, this.width);

    const pulse = 0.5 + Math.sin(this.sinkPulse) * 0.25;
    this.sinkGraphics.lineStyle(2, 0x00f0ff, 0.5);
    this.sinkGraphics.strokeCircle(screenX, screenY, screenR * (1.2 + pulse * 0.15));
    this.sinkGraphics.lineStyle(1, 0xffaa00, 0.45);
    this.sinkGraphics.strokeCircle(screenX, screenY, screenR * (0.82 + pulse * 0.1));
    this.sinkGraphics.fillStyle(0x081118, 0.85);
    this.sinkGraphics.fillCircle(screenX, screenY, screenR * 0.72);
    this.sinkGraphics.lineStyle(1, 0xffffff, 0.08);
    this.sinkGraphics.strokeCircle(screenX, screenY, screenR * 0.55);
  }

  private drawNodes(nodes: readonly GameNode[]) {
    this.nodeGraphics.clear();

    for (const node of nodes) {
      // Node coordinates are stored in logical field space (0..LOGICAL_FIELD_*).
      // The graphics object renders in screen space, so convert before drawing
      // to keep node visuals aligned with both the click position and the
      // particle simulation.
      const screenX = scaleFieldX(node.x, this.width);
      const screenY = scaleFieldY(node.y, this.height);
      const accent = NODE_ACCENTS[node.type];
      if (node.type === NodeType.Attractor) {
        this.nodeGraphics.lineStyle(3, accent, 0.9);
        this.nodeGraphics.strokeCircle(screenX, screenY, 18);
        this.nodeGraphics.strokeCircle(screenX, screenY, 28);
        this.nodeGraphics.strokeCircle(screenX, screenY, 38);
      } else if (node.type === NodeType.Repeller) {
        this.nodeGraphics.lineStyle(3, accent, 0.95);
        this.nodeGraphics.fillStyle(accent, 0.18);
        this.nodeGraphics.fillTriangle(screenX - 22, screenY + 16, screenX, screenY - 20, screenX + 22, screenY + 16);
        this.nodeGraphics.strokeTriangle(screenX - 22, screenY + 16, screenX, screenY - 20, screenX + 22, screenY + 16);
      } else {
        this.nodeGraphics.lineStyle(3, accent, 0.95);
        this.nodeGraphics.beginPath();
        this.nodeGraphics.arc(screenX, screenY, 24, Phaser.Math.DegToRad(30), Phaser.Math.DegToRad(330), false);
        this.nodeGraphics.strokePath();
        this.nodeGraphics.lineStyle(1, accent, 0.45);
        this.nodeGraphics.strokeCircle(screenX, screenY, 12);
      }
    }
  }
}
