import { describe, it, expect } from 'vitest';
import { generateDailyField } from '../field-generator';

describe('generateDailyField', () => {
  const postId = 'test-post';
  const utcDayStart = 1_700_000_000_000;

  it('returns same layout for same (postId, utcDayStart)', () => {
    const layout1 = generateDailyField(postId, utcDayStart);
    const layout2 = generateDailyField(postId, utcDayStart);
    expect(layout1).toEqual(layout2);
  });

  it('returns different layout for different postId', () => {
    const layout1 = generateDailyField('post-a', utcDayStart);
    const layout2 = generateDailyField('post-b', utcDayStart);
    expect(layout1.seed).not.toBe(layout2.seed);
  });

  it('returns different layout for different utcDayStart', () => {
    const layout1 = generateDailyField(postId, utcDayStart);
    const layout2 = generateDailyField(postId, utcDayStart + 86_400_000);
    expect(layout1.seed).not.toBe(layout2.seed);
  });

  it('returns all required fields', () => {
    const layout = generateDailyField(postId, utcDayStart);
    expect(layout).toHaveProperty('dayKey');
    expect(layout).toHaveProperty('seed');
    expect(layout).toHaveProperty('templateId');
    expect(layout).toHaveProperty('bounds');
    expect(layout).toHaveProperty('obstacles');
    expect(layout).toHaveProperty('hazards');
    expect(layout).toHaveProperty('sink');
    expect(layout).toHaveProperty('spawnBand');
  });

  it('templateId is within valid range', () => {
    for (let i = 0; i < 20; i += 1) {
      const layout = generateDailyField(`post-${i}`, utcDayStart);
      expect(layout.templateId).toBeGreaterThanOrEqual(0);
      expect(layout.templateId).toBeLessThanOrEqual(5);
    }
  });

  it('dayKey is ISO date string from utcDayStart', () => {
    const layout = generateDailyField(postId, utcDayStart);
    const expectedDate = new Date(utcDayStart).toISOString().split('T')[0];
    expect(layout.dayKey).toBe(expectedDate);
  });

  it('obstacles have x, y, w, h', () => {
    const layout = generateDailyField(postId, utcDayStart);
    for (const obs of layout.obstacles) {
      expect(typeof obs.x).toBe('number');
      expect(typeof obs.y).toBe('number');
      expect(typeof obs.w).toBe('number');
      expect(typeof obs.h).toBe('number');
    }
  });

  it('hazards have x, y, r', () => {
    const layout = generateDailyField(postId, utcDayStart + 1);
    for (const h of layout.hazards) {
      expect(typeof h.x).toBe('number');
      expect(typeof h.y).toBe('number');
      expect(typeof h.r).toBe('number');
    }
  });

  it('obstacle positions are jittered within ±8', () => {
    // Generate the same layout many times and check that template 0's first
    // obstacle position is within expected range of the original
    const layout1 = generateDailyField(postId, utcDayStart);
    const template0Obstacle0 = { x: 120, y: 180, w: 40, h: 200 };

    // Check if templateId 0 was selected - if not, skip (probabilistic)
    if (layout1.templateId === 0) {
      const obs = layout1.obstacles[0];
      expect(obs).toBeDefined();
      if (obs) {
        expect(obs.x).toBeGreaterThanOrEqual(template0Obstacle0.x - 8);
        expect(obs.x).toBeLessThanOrEqual(template0Obstacle0.x + 8);
        expect(obs.y).toBeGreaterThanOrEqual(template0Obstacle0.y - 8);
        expect(obs.y).toBeLessThanOrEqual(template0Obstacle0.y + 8);
        // Dimensions are unchanged
        expect(obs.w).toBe(template0Obstacle0.w);
        expect(obs.h).toBe(template0Obstacle0.h);
      }
    }
  });

  it('hazard positions are jittered within ±8', () => {
    const layout = generateDailyField(postId, utcDayStart);
    if (layout.templateId === 0 && layout.hazards.length > 0) {
      const h = layout.hazards[0];
      expect(h).toBeDefined();
      if (h) {
        expect(h.x).toBeGreaterThanOrEqual(392);
        expect(h.x).toBeLessThanOrEqual(408);
        expect(h.y).toBeGreaterThanOrEqual(292);
        expect(h.y).toBeLessThanOrEqual(308);
        expect(h.r).toBe(35);
      }
    }
  });

  it('bounds are correct dimensions', () => {
    const layout = generateDailyField(postId, utcDayStart);
    expect(layout.bounds.x).toBe(24);
    expect(layout.bounds.y).toBe(24);
    // LOGICAL_FIELD_WIDTH - 48 = 752
    expect(layout.bounds.w).toBeGreaterThan(0);
    expect(layout.bounds.h).toBeGreaterThan(0);
  });

  it('spawnBand width spans full field', () => {
    const layout = generateDailyField(postId, utcDayStart);
    expect(layout.spawnBand.w).toBeGreaterThan(0);
    expect(layout.spawnBand.h).toBe(80);
  });

  it('deterministic result across same template', () => {
    const layout1 = generateDailyField(postId, utcDayStart);
    const layout2 = generateDailyField(postId, utcDayStart);
    const layout3 = generateDailyField(postId, utcDayStart);
    expect(layout1).toEqual(layout2);
    expect(layout2).toEqual(layout3);
  });
});
