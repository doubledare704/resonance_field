import * as Phaser from 'phaser';
import { NodeType } from '../shared/api';
import type { FieldLayout, GameNode } from '../shared/api';
import { scaleFieldX, scaleFieldY } from '../shared/field-layout';

type Particle = {
  age: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
};

const SIMULATION = {
  captureRadius: 160,
  nodeForceScale: {
    [NodeType.Attractor]: 0.95,
    [NodeType.Repeller]: 1.35,
    [NodeType.Vortex]: 1.75,
  },
  particleCount: 180,
  particleLifetime: 1800,
  maxSpeed: 12,
  baseGravity: 0.09,
} as const;

const NODE_ACCENTS: Record<NodeType, number> = {
  [NodeType.Attractor]: 0x00f0ff,
  [NodeType.Repeller]: 0xff0055,
  [NodeType.Vortex]: 0xffaa00,
};

export class ParticleField {
  private readonly sinkGraphics: Phaser.GameObjects.Graphics;
  private readonly nodeGraphics: Phaser.GameObjects.Graphics;
  private readonly particleGraphics: Phaser.GameObjects.Graphics;
  private readonly fieldGraphics: Phaser.GameObjects.Graphics;
  private particles: Particle[] = [];
  private sinkPulse = 0;
  private layout: FieldLayout | null = null;

  constructor(
    scene: Phaser.Scene,
    private width: number,
    private height: number
  ) {
    this.sinkGraphics = scene.add.graphics().setDepth(2);
    this.nodeGraphics = scene.add.graphics().setDepth(3);
    this.particleGraphics = scene.add.graphics().setDepth(4);
    this.fieldGraphics = scene.add.graphics().setDepth(1);
    this.resetParticles();
  }

  destroy() {
    this.sinkGraphics.destroy();
    this.nodeGraphics.destroy();
    this.particleGraphics.destroy();
    this.fieldGraphics.destroy();
  }

  setSize(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  setFieldLayout(layout: FieldLayout | null) {
    this.layout = layout;
  }

  step(delta: number, nodes: readonly GameNode[]) {
    const now = Date.now();
    const dt = Math.max(0.5, delta / 16.6667);
    const activeNodes = nodes.filter((node) => node.expiresAt > now);

    this.sinkPulse += delta * 0.004;

    if (this.layout) {
      this.drawFieldLayout();
    }
    this.drawNodes(activeNodes);

    let collected = 0;
    this.particleGraphics.clear();

    for (const particle of this.particles) {
      particle.age += 1;

      let ax = 0;
      let ay = SIMULATION.baseGravity;

      for (const node of activeNodes) {
        const dx = node.x - particle.x;
        const dy = node.y - particle.y;
        const distSq = dx * dx + dy * dy;
        const captureRadiusSq = SIMULATION.captureRadius * SIMULATION.captureRadius;

        if (distSq <= 36 || distSq >= captureRadiusSq) {
          continue;
        }

        const distance = Math.sqrt(distSq);
        const forceFactor = ((SIMULATION.captureRadius - distance) / SIMULATION.captureRadius) * dt;

        if (node.type === NodeType.Attractor) {
          ax += (dx / distance) * forceFactor * SIMULATION.nodeForceScale[NodeType.Attractor];
          ay += (dy / distance) * forceFactor * SIMULATION.nodeForceScale[NodeType.Attractor];
        } else if (node.type === NodeType.Repeller) {
          ax -= (dx / distance) * forceFactor * SIMULATION.nodeForceScale[NodeType.Repeller];
          ay -= (dy / distance) * forceFactor * SIMULATION.nodeForceScale[NodeType.Repeller];
        } else {
          ax += (-dy / distance) * forceFactor * SIMULATION.nodeForceScale[NodeType.Vortex];
          ay += (dx / distance) * forceFactor * SIMULATION.nodeForceScale[NodeType.Vortex];
        }
      }

      particle.vx += ax * dt;
      particle.vy += ay * dt;

      const currentSpeed = Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy);
      if (currentSpeed > SIMULATION.maxSpeed) {
        particle.vx = (particle.vx / currentSpeed) * SIMULATION.maxSpeed;
        particle.vy = (particle.vy / currentSpeed) * SIMULATION.maxSpeed;
      }

      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;

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

            if (minDist === distLeft || minDist === distRight) {
              particle.vx = -particle.vx;
            } else {
              particle.vy = -particle.vy;
            }
            particle.x += particle.vx * dt;
            particle.y += particle.vy * dt;
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
            continue;
          }
        }

        if (this.isCollected(particle)) {
          collected += 1;
          this.respawnParticle(particle, true);
          continue;
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
          continue;
        }
      } else {
        if (this.isCollected(particle)) {
          collected += 1;
          this.respawnParticle(particle, true);
          continue;
        }

        if (
          particle.age > SIMULATION.particleLifetime ||
          particle.x < -24 ||
          particle.x > this.width + 24 ||
          particle.y > this.height + 24
        ) {
          this.respawnParticle(particle);
          continue;
        }

        if (particle.y < -24) {
          particle.y = -24;
          particle.vy = Math.abs(particle.vy);
        }

        if (particle.x < 24) {
          particle.x = 24;
          particle.vx = Math.abs(particle.vx);
        } else if (particle.x > this.width - 24) {
          particle.x = this.width - 24;
          particle.vx = -Math.abs(particle.vx);
        }
      }

      const alpha = Phaser.Math.Clamp(0.25 + particle.age / 1400, 0.25, 0.85);
      const intensity = Phaser.Math.Clamp(currentSpeed / 12, 0.2, 1);
      this.particleGraphics.fillStyle(0xe7ffff, alpha);
      this.particleGraphics.fillCircle(particle.x, particle.y, 1.5 + intensity);
    }

    return collected;
  }

  private resetParticles() {
    this.particles = [];
    for (let index = 0; index < SIMULATION.particleCount; index += 1) {
      this.particles.push(this.createParticle(true));
    }
  }

  private createParticle(initial = false): Particle {
    const spawnBandY = this.layout
      ? scaleFieldY(this.layout.spawnBand.y + this.layout.spawnBand.h * 0.5, this.height)
      : this.height * 0.15;
    const startY = initial
      ? Phaser.Math.Between(-Math.round(spawnBandY), Math.round(this.height * 0.5))
      : Phaser.Math.Between(-60, 10);

    return {
      age: 0,
      vx: Phaser.Math.FloatBetween(-0.45, 0.45),
      vy: Phaser.Math.FloatBetween(0.35, 0.9),
      x: Phaser.Math.Between(24, Math.max(25, this.width - 24)),
      y: startY,
    };
  }

  private respawnParticle(particle: Particle, asBurst = false) {
    const respawn = this.createParticle(!asBurst);
    particle.x = respawn.x;
    particle.y = respawn.y;
    particle.vx = respawn.vx;
    particle.vy = asBurst ? Phaser.Math.FloatBetween(0.7, 1.6) : respawn.vy;
    particle.age = 0;
  }

  private isCollected(particle: Particle) {
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
      const accent = NODE_ACCENTS[node.type];
      if (node.type === NodeType.Attractor) {
        this.nodeGraphics.lineStyle(3, accent, 0.9);
        this.nodeGraphics.strokeCircle(node.x, node.y, 18);
        this.nodeGraphics.strokeCircle(node.x, node.y, 28);
        this.nodeGraphics.strokeCircle(node.x, node.y, 38);
      } else if (node.type === NodeType.Repeller) {
        this.nodeGraphics.lineStyle(3, accent, 0.95);
        this.nodeGraphics.fillStyle(accent, 0.18);
        this.nodeGraphics.fillTriangle(node.x - 22, node.y + 16, node.x, node.y - 20, node.x + 22, node.y + 16);
        this.nodeGraphics.strokeTriangle(node.x - 22, node.y + 16, node.x, node.y - 20, node.x + 22, node.y + 16);
      } else {
        this.nodeGraphics.lineStyle(3, accent, 0.95);
        this.nodeGraphics.beginPath();
        this.nodeGraphics.arc(node.x, node.y, 24, Phaser.Math.DegToRad(30), Phaser.Math.DegToRad(330), false);
        this.nodeGraphics.strokePath();
        this.nodeGraphics.lineStyle(1, accent, 0.45);
        this.nodeGraphics.strokeCircle(node.x, node.y, 12);
      }
    }
  }
}
