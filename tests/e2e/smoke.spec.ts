import { test, expect } from '@playwright/test';

test('game loads and Phaser initializes', async ({ page }) => {
  test.setTimeout(30000);

  await page.goto('/game.html?debugFps=1');

  await page.waitForFunction(
    () => (window as unknown as Record<string, unknown>).__PHASER_GAME__ !== undefined,
    { timeout: 15000 },
  );

  const hasGame = await page.evaluate(() => {
    return (window as unknown as Record<string, unknown>).__PHASER_GAME__ !== undefined;
  });

  expect(hasGame).toBe(true);

  const canvas = page.locator('canvas');
  await canvas.click({ position: { x: 10, y: 10 } });
  await page.waitForTimeout(1000);

  const fps = await page.evaluate(() => {
    const game = (window as unknown as Record<string, unknown>).__PHASER_GAME__ as Record<string, unknown> | undefined;
    return (game?.loop as Record<string, unknown>)?.actualFps as number ?? -1;
  });

  expect(fps).toBeGreaterThan(0);
});

test('API endpoints respond correctly', async ({ page }) => {
  await page.goto('/game.html');

  const initResp = await page.evaluate(async () => {
    const r = await fetch('/api/init');
    return r.json();
  });

  expect(initResp.type).toBe('snapshot');
  expect(initResp.contractVersion).toBe('resonance-field/v1');

  const deployResp = await page.evaluate(async () => {
    const r = await fetch('/api/node-deploy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'ATTRACTOR', x: 400, y: 300 }),
    });
    return r.json();
  });

  expect(deployResp.type).toBe('node_deployed');
  expect(deployResp.node.type).toBe('ATTRACTOR');
});

test('Snapshot loads after clicking through MainMenu', async ({ page }) => {
  test.setTimeout(30000);

  await page.goto('/game.html?debugFps=1');

  await page.waitForFunction(
    () => (window as unknown as Record<string, unknown>).__PHASER_GAME__ !== undefined,
    { timeout: 15000 },
  );

  await page.waitForTimeout(1500);

  const canvas = page.locator('canvas');
  await canvas.click({ position: { x: 100, y: 100 } });

  await page.waitForFunction(
    () => {
      const game = (window as unknown as Record<string, unknown>).__PHASER_GAME__ as Record<string, unknown> | undefined;
      const scene = game?.scene as Record<string, unknown> | undefined;
      const gameScene = scene?.getScene?.('Game') as Record<string, unknown> | undefined;
      return gameScene?.snapshot !== null && gameScene?.snapshot !== undefined;
    },
    { timeout: 15000 },
  );

  const info = await page.evaluate(() => {
    const game = (window as unknown as Record<string, unknown>).__PHASER_GAME__ as Record<string, unknown> | undefined;
    const scene = game?.scene as Record<string, unknown> | undefined;
    const gameScene = scene?.getScene?.('Game') as Record<string, unknown> | undefined;
    return {
      contractVersion: gameScene?.snapshot?.contractVersion,
      globalScore: gameScene?.snapshot?.globalScore,
    };
  });

  expect(info.contractVersion).toBe('resonance-field/v1');
});
