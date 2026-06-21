import * as Phaser from 'phaser';
import { NodeType } from '../shared/api';
import type { FieldLayout, GameNode } from '../shared/api';
import { SIMULATION_CONFIG } from '../shared/simulation-config';
import {
  VIRTUAL_FIELD_HEIGHT,
  VIRTUAL_FIELD_WIDTH,
  logicalToCanonical,
} from '../shared/field-layout';

type CanonicalNode = {
  type: NodeType;
  x: number;
  y: number;
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
  private viewportW = VIRTUAL_FIELD_WIDTH;
  private viewportH = VIRTUAL_FIELD_HEIGHT;
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
      lifespan: SIMULATION_CONFIG.particleLifetimeMs,
      speed: 0,
      alpha: {
        onUpdate: (
          _particle: Phaser.GameObjects.Particles.Particle,
          _key: string,
          t: number,
          _value: number,
        ) => {
          const alpha = SIMULATION_CONFIG.alphaRange.min + t * 0.6;
          return Phaser.Math.Clamp(
            alpha,
            SIMULATION_CONFIG.alphaRange.min,
            SIMULATION_CONFIG.alphaRange.max,
          );
        },
      },
      tint: SIMULATION_CONFIG.particleTint,
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
    this.vpScale = w / VIRTUAL_FIELD_WIDTH;
    this.rebuildViewportLayout();
    this.drawFieldLayout();
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

    this.sinkPulse += delta * SIMULATION_CONFIG.sinkPulseRate;

    if (this.layout && this.drawnLayoutVersion !== this.layoutVersion) {
      this.drawFieldLayout();
      this.drawnLayoutVersion = this.layoutVersion;
    }
    this.drawNodes(activeNodes);

    const canonicalNodes = this.buildCanonicalNodes(activeNodes);

    let collected = 0;
    this.emitter.forEachAlive((particle) => {
      if (this.integrateParticle(particle, canonicalNodes, dt)) {
        collected += 1;
      }
    }, this);

    return collected;
  }

  private buildCanonicalNodes(nodes: readonly GameNode[]): CanonicalNode[] {
    return nodes.map((node) => {
      const c = logicalToCanonical(node.x, node.y);
      return {
        type: node.type,
        x: c.x * this.vpScale + this.viewportX,
        y: c.y * this.vpScale + this.viewportY,
      };
    });
  }

  private integrateParticle(
    particle: Phaser.GameObjects.Particles.Particle,
    canonicalNodes: CanonicalNode[],
    dt: number,
  ): boolean {
    const { ax, ay } = this.computeForces(particle, canonicalNodes, dt);
    particle.velocityX += ax * dt;
    particle.velocityY += ay * dt;

    const preCapSpeed = Math.sqrt(
      particle.velocityX * particle.velocityX + particle.velocityY * particle.velocityY
    );
    this.capSpeed(particle);

    particle.x += particle.velocityX * dt;
    particle.y += particle.velocityY * dt;

    const collision = this.handleWorldCollision(particle);
    if (collision.respawned) {
      return collision.collected;
    }

    this.updateParticleScale(particle, preCapSpeed);
    return false;
  }

  private computeForces(
    particle: Phaser.GameObjects.Particles.Particle,
    canonicalNodes: CanonicalNode[],
    dt: number,
  ): { ax: number; ay: number } {
    let ax = 0;
    let ay = SIMULATION_CONFIG.baseGravity * this.vpScale;

    for (const node of canonicalNodes) {
      const dx = node.x - particle.x;
      const dy = node.y - particle.y;
      const distSq = dx * dx + dy * dy;
      const captureRadius = SIMULATION_CONFIG.captureRadius * this.vpScale;
      const captureRadiusSq = captureRadius * captureRadius;

      if (distSq <= 36 || distSq >= captureRadiusSq) {
        continue;
      }

      const distance = Math.sqrt(distSq);
      const forceFactor = ((captureRadius - distance) / captureRadius) * dt;

      if (node.type === NodeType.Attractor) {
        ax += (dx / distance) * forceFactor * SIMULATION_CONFIG.nodeForceScale[NodeType.Attractor];
        ay += (dy / distance) * forceFactor * SIMULATION_CONFIG.nodeForceScale[NodeType.Attractor];
      } else if (node.type === NodeType.Repeller) {
        ax -= (dx / distance) * forceFactor * SIMULATION_CONFIG.nodeForceScale[NodeType.Repeller];
        ay -= (dy / distance) * forceFactor * SIMULATION_CONFIG.nodeForceScale[NodeType.Repeller];
      } else {
        ax += (-dy / distance) * forceFactor * SIMULATION_CONFIG.nodeForceScale[NodeType.Vortex];
        ay += (dx / distance) * forceFactor * SIMULATION_CONFIG.nodeForceScale[NodeType.Vortex];
      }
    }

    return { ax, ay };
  }

  private capSpeed(particle: Phaser.GameObjects.Particles.Particle) {
    const maxSpeed = SIMULATION_CONFIG.maxSpeed * this.vpScale;
    const currentSpeed = Math.sqrt(
      particle.velocityX * particle.velocityX + particle.velocityY * particle.velocityY
    );
    if (currentSpeed > maxSpeed) {
      particle.velocityX = (particle.velocityX / currentSpeed) * maxSpeed;
      particle.velocityY = (particle.velocityY / currentSpeed) * maxSpeed;
    }
  }

  private handleWorldCollision(
    particle: Phaser.GameObjects.Particles.Particle,
  ): { collected: boolean; respawned: boolean } {
    if (this.viewportLayout) {
      return this.handleLayoutCollision(particle, this.viewportLayout);
    }
    return this.handleFallbackCollision(particle);
  }

  private handleLayoutCollision(
    particle: Phaser.GameObjects.Particles.Particle,
    layout: CanonicalLayout,
  ): { collected: boolean; respawned: boolean } {
    for (const obstacle of layout.obstacles) {
      this.resolveObstacleCollision(particle, obstacle);
    }

    for (const hazard of layout.hazards) {
      const dx = particle.x - hazard.x;
      const dy = particle.y - hazard.y;
      if (dx * dx + dy * dy <= hazard.r * hazard.r) {
        this.respawnParticle(particle);
        return { collected: false, respawned: true };
      }
    }

    if (this.isCollected(particle, layout)) {
      this.respawnParticle(particle, true);
      return { collected: true, respawned: true };
    }

    const bounds = layout.bounds;
    if (
      particle.x < bounds.x ||
      particle.x > bounds.x + bounds.w ||
      particle.y < bounds.y ||
      particle.y > bounds.y + bounds.h
    ) {
      this.respawnParticle(particle);
      return { collected: false, respawned: true };
    }

    return { collected: false, respawned: false };
  }

  private resolveObstacleCollision(
    particle: Phaser.GameObjects.Particles.Particle,
    obstacle: { x: number; y: number; w: number; h: number },
  ) {
    if (
      particle.x < obstacle.x ||
      particle.x > obstacle.x + obstacle.w ||
      particle.y < obstacle.y ||
      particle.y > obstacle.y + obstacle.h
    ) {
      return;
    }

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

  private handleFallbackCollision(
    particle: Phaser.GameObjects.Particles.Particle,
  ): { collected: boolean; respawned: boolean } {
    if (this.isCollectedFallback(particle)) {
      this.respawnParticle(particle, true);
      return { collected: true, respawned: true };
    }

    const margin = SIMULATION_CONFIG.spawnMargin;
    const vpX = this.viewportX;
    const vpY = this.viewportY;
    const vpW = this.viewportW;
    const vpH = this.viewportH;

    if (
      particle.x < vpX - margin ||
      particle.x > vpX + vpW + margin ||
      particle.y > vpY + vpH + margin
    ) {
      this.respawnParticle(particle);
      return { collected: false, respawned: true };
    }

    if (particle.y < vpY - margin) {
      particle.y = vpY - margin;
      particle.velocityY = Math.abs(particle.velocityY);
    }

    if (particle.x < vpX + margin) {
      particle.x = vpX + margin;
      particle.velocityX = Math.abs(particle.velocityX);
    } else if (particle.x > vpX + vpW - margin) {
      particle.x = vpX + vpW - margin;
      particle.velocityX = -Math.abs(particle.velocityX);
    }

    return { collected: false, respawned: false };
  }

  private updateParticleScale(particle: Phaser.GameObjects.Particles.Particle, speed: number) {
    const intensity = Phaser.Math.Clamp(speed / SIMULATION_CONFIG.maxSpeed, 0.2, 1);
    const size =
      SIMULATION_CONFIG.scaleRange.min +
      intensity * (SIMULATION_CONFIG.scaleRange.max - SIMULATION_CONFIG.scaleRange.min);
    particle.scaleX = size;
    particle.scaleY = size;
  }

  private seedParticles(count: number) {
    for (let index = 0; index < count; index += 1) {
      const spawn = this.spawnCoords(index > 0);
      const particle = this.emitter.emitParticleAt(spawn.x, spawn.y);
      if (particle) {
        const baseV = this.vpScale;
        particle.velocityX = Phaser.Math.FloatBetween(
          SIMULATION_CONFIG.initialVelocityX.min * baseV,
          SIMULATION_CONFIG.initialVelocityX.max * baseV,
        );
        particle.velocityY = Phaser.Math.FloatBetween(
          SIMULATION_CONFIG.initialVelocityY.min * baseV,
          SIMULATION_CONFIG.initialVelocityY.max * baseV,
        );
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

    const margin = SIMULATION_CONFIG.spawnMargin;
    return {
      x: Phaser.Math.Between(Math.max(vpX + margin, vpX), Math.max(vpX + margin + 1, vpX + vpW - margin)),
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
    particle.velocityX = Phaser.Math.FloatBetween(
      SIMULATION_CONFIG.initialVelocityX.min * baseV,
      SIMULATION_CONFIG.initialVelocityX.max * baseV,
    );
    particle.velocityY = asBurst
      ? Phaser.Math.FloatBetween(
          SIMULATION_CONFIG.burstVelocityY.min * baseV,
          SIMULATION_CONFIG.burstVelocityY.max * baseV,
        )
      : Phaser.Math.FloatBetween(
          SIMULATION_CONFIG.initialVelocityY.min * baseV,
          SIMULATION_CONFIG.initialVelocityY.max * baseV,
        );
    particle.lifeCurrent = particle.life;
    particle.scaleX = SIMULATION_CONFIG.scaleRange.min;
    particle.scaleY = SIMULATION_CONFIG.scaleRange.min;
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
      const accent = SIMULATION_CONFIG.nodeAccents[node.type];
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
