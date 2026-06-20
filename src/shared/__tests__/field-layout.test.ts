import { describe, it, expect } from 'vitest';
import {
  scaleFieldX,
  scaleFieldY,
  pointInRect,
  pointInCircle,
  circleIntersectsRect,
  type FieldRect,
  type FieldCircle,
} from '../field-layout';

describe('scaleFieldX', () => {
  it('scales proportionally: midpoint', () => {
    expect(scaleFieldX(400, 800)).toBe(400);
  });

  it('scales zero to zero', () => {
    expect(scaleFieldX(0, 800)).toBe(0);
  });

  it('scales full width to full width', () => {
    expect(scaleFieldX(800, 800)).toBe(800);
  });

  it('scales to wider canvas', () => {
    expect(scaleFieldX(200, 1600)).toBe(400);
  });

  it('scales to narrower canvas', () => {
    expect(scaleFieldX(400, 400)).toBe(200);
  });
});

describe('scaleFieldY', () => {
  it('scales proportionally: midpoint', () => {
    expect(scaleFieldY(300, 600)).toBe(300);
  });

  it('scales zero to zero', () => {
    expect(scaleFieldY(0, 600)).toBe(0);
  });

  it('scales full height to full height', () => {
    expect(scaleFieldY(600, 600)).toBe(600);
  });

  it('scales to taller canvas', () => {
    expect(scaleFieldY(150, 1200)).toBe(300);
  });
});

describe('pointInRect', () => {
  const rect: FieldRect = { x: 100, y: 50, w: 200, h: 100 };

  it('returns true for point at origin of rect', () => {
    expect(pointInRect(100, 50, rect)).toBe(true);
  });

  it('returns true for point at far corner', () => {
    expect(pointInRect(300, 150, rect)).toBe(true);
  });

  it('returns true for point inside rect', () => {
    expect(pointInRect(200, 100, rect)).toBe(true);
  });

  it('returns false for point to the left', () => {
    expect(pointInRect(99, 100, rect)).toBe(false);
  });

  it('returns false for point to the right', () => {
    expect(pointInRect(301, 100, rect)).toBe(false);
  });

  it('returns false for point above', () => {
    expect(pointInRect(200, 49, rect)).toBe(false);
  });

  it('returns false for point below', () => {
    expect(pointInRect(200, 151, rect)).toBe(false);
  });

  it('returns true for point on left edge (inclusive)', () => {
    expect(pointInRect(100, 100, rect)).toBe(true);
  });

  it('returns true for point on right edge (inclusive)', () => {
    expect(pointInRect(300, 100, rect)).toBe(true);
  });

  it('returns true for point on top edge (inclusive)', () => {
    expect(pointInRect(200, 50, rect)).toBe(true);
  });

  it('returns true for point on bottom edge (inclusive)', () => {
    expect(pointInRect(200, 150, rect)).toBe(true);
  });
});

describe('pointInCircle', () => {
  const circle: FieldCircle = { x: 400, y: 300, r: 50 };

  it('returns true for point at center', () => {
    expect(pointInCircle(400, 300, circle)).toBe(true);
  });

  it('returns true for point exactly at radius distance', () => {
    expect(pointInCircle(450, 300, circle)).toBe(true);
  });

  it('returns false for point just outside radius', () => {
    expect(pointInCircle(451, 300, circle)).toBe(false);
  });

  it('returns false for point far outside', () => {
    expect(pointInCircle(500, 300, circle)).toBe(false);
  });

  it('handles diagonal proximity correctly', () => {
    const r = 50;
    const halfR = r / Math.SQRT2;
    // Point at exactly r distance (diagonal) - using distance formula
    // Distance from center = sqrt((r/√2)^2 + (r/√2)^2) = r
    expect(pointInCircle(400 + halfR, 300 + halfR, circle)).toBe(true);
    // Point just inside
    expect(pointInCircle(400 + halfR * 0.99, 300 + halfR * 0.99, circle)).toBe(true);
  });
});

describe('circleIntersectsRect', () => {
  const circle: FieldCircle = { x: 400, y: 300, r: 50 };

  it('returns true when circle fully inside rect', () => {
    const rect: FieldRect = { x: 300, y: 200, w: 200, h: 200 };
    expect(circleIntersectsRect(circle, rect)).toBe(true);
  });

  it('returns true when circle overlaps rect edge', () => {
    const rect: FieldRect = { x: 430, y: 250, w: 100, h: 100 };
    expect(circleIntersectsRect(circle, rect)).toBe(true);
  });

  it('returns true when circle touches rect corner', () => {
    // Circle center (400,300) r=50. Rect corner at (435,335) is sqrt(35^2+35^2) ≈ 49.5 < 50
    const rect: FieldRect = { x: 435, y: 335, w: 100, h: 100 };
    expect(circleIntersectsRect(circle, rect)).toBe(true);
  });

  it('returns false when circle is far from rect', () => {
    const rect: FieldRect = { x: 500, y: 400, w: 100, h: 100 };
    expect(circleIntersectsRect(circle, rect)).toBe(false);
  });

  it('returns true when circle tangent to rect', () => {
    const rect: FieldRect = { x: 450, y: 250, w: 100, h: 100 };
    expect(circleIntersectsRect(circle, rect)).toBe(true);
  });
});
