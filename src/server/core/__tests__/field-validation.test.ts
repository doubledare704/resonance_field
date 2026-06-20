import { describe, it, expect } from 'vitest';
import { isValidDeployPosition } from '../field-validation';
import type { FieldLayout } from '../../../shared/field-layout';

describe('isValidDeployPosition', () => {
  const layout: FieldLayout = {
    dayKey: '2026-01-01',
    seed: 42,
    templateId: 0,
    bounds: { x: 24, y: 24, w: 752, h: 552 },
    obstacles: [
      { x: 120, y: 180, w: 40, h: 200 },
      { x: 600, y: 220, w: 40, h: 180 },
    ],
    hazards: [{ x: 400, y: 300, r: 35 }],
    sink: { x: 400, y: 480, r: 45 },
    spawnBand: { x: 0, y: 0, w: 800, h: 80 },
  };

  it('returns true for valid point inside bounds', () => {
    expect(isValidDeployPosition(layout, 400, 100)).toBe(true);
  });

  it('returns true for point near spawn band', () => {
    expect(isValidDeployPosition(layout, 400, 40)).toBe(true);
  });

  it('returns false for point outside left bounds', () => {
    expect(isValidDeployPosition(layout, 20, 100)).toBe(false);
  });

  it('returns false for point outside right bounds', () => {
    expect(isValidDeployPosition(layout, 780, 100)).toBe(false);
  });

  it('returns false for point above bounds', () => {
    expect(isValidDeployPosition(layout, 400, 20)).toBe(false);
  });

  it('returns false for point below bounds', () => {
    expect(isValidDeployPosition(layout, 400, 580)).toBe(false);
  });

  it('returns true for point on bounds edge', () => {
    expect(isValidDeployPosition(layout, 24, 100)).toBe(true);
    expect(isValidDeployPosition(layout, 776, 100)).toBe(true);
  });

  it('returns false for point inside first obstacle', () => {
    expect(isValidDeployPosition(layout, 140, 280)).toBe(false);
  });

  it('returns false for point inside second obstacle', () => {
    expect(isValidDeployPosition(layout, 620, 300)).toBe(false);
  });

  it('returns true for point outside all obstacles', () => {
    expect(isValidDeployPosition(layout, 500, 100)).toBe(true);
  });

  it('returns false for point inside hazard', () => {
    expect(isValidDeployPosition(layout, 400, 300)).toBe(false);
    expect(isValidDeployPosition(layout, 420, 300)).toBe(false);
  });

  it('returns true for point outside all hazards', () => {
    expect(isValidDeployPosition(layout, 400, 250)).toBe(true);
  });

  it('returns false for point inside sink', () => {
    expect(isValidDeployPosition(layout, 400, 480)).toBe(false);
    expect(isValidDeployPosition(layout, 430, 480)).toBe(false);
  });

  it('returns true for point outside sink', () => {
    expect(isValidDeployPosition(layout, 400, 150)).toBe(true);
  });

  it('handles empty obstacles and hazards arrays', () => {
    const emptyLayout: FieldLayout = {
      ...layout,
      obstacles: [],
      hazards: [],
    };
    expect(isValidDeployPosition(emptyLayout, 400, 100)).toBe(true);
    expect(isValidDeployPosition(emptyLayout, 400, 480)).toBe(false);
  });

  it('multi-condition: in bounds but inside obstacle', () => {
    expect(isValidDeployPosition(layout, 130, 200)).toBe(false);
  });

  it('multi-condition: in bounds, outside obstacles, inside hazard', () => {
    expect(isValidDeployPosition(layout, 400, 330)).toBe(false);
  });

  it('multi-condition: in bounds, outside obstacles/hazards, inside sink', () => {
    expect(isValidDeployPosition(layout, 400, 490)).toBe(false);
  });
});
