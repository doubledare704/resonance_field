import { test, expect } from '@playwright/test';

const FPS_DESKTOP_MIN = 50;
const FPS_PHONE_MIN = 30;
const FPS_TABLET_MIN = 40;
const MEASURE_DURATION_MS = 60_000;
const WARMUP_MS = 5000;

async function waitForGame(page) {
  await page.waitForFunction(
    () => (window as unknown as Record<string, unknown>).__PHASER_GAME__ !== undefined,
    { timeout: 30000 },
  );
}

async function clickThroughMainMenu(page) {
  const canvas = page.locator('canvas');
  await page.waitForTimeout(1500);
  await canvas.click({ position: { x: 100, y: 100 } });
  await page.waitForTimeout(2000);
}

async function waitForGameScene(page) {
  await page.waitForFunction(
    () => {
      const game = (window as unknown as Record<string, unknown>).__PHASER_GAME__ as Record<string, unknown> | undefined;
      const scene = game?.scene as Record<string, unknown> | undefined;
      const gameScene = scene?.getScene?.('Game') as Record<string, unknown> | undefined;
      return gameScene?.snapshot !== null && gameScene?.snapshot !== undefined;
    },
    { timeout: 30000 },
  );
}

async function deployNode(page, toolKey, logicalX, logicalY) {
  await page.keyboard.press(toolKey);
  await page.waitForTimeout(200);

  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');

  const physicalX = box.x + (logicalX / 800) * box.width;
  const physicalY = box.y + (logicalY / 600) * box.height;

  await page.mouse.click(physicalX, physicalY);
  await page.waitForTimeout(300);
}

async function readFps(page) {
  return page.evaluate(() => {
    const game = (window as unknown as Record<string, unknown>).__PHASER_GAME__ as Record<string, unknown> | undefined;
    return (game?.loop as Record<string, unknown>)?.actualFps as number ?? 0;
  });
}

async function measureAverageFps(page, durationMs) {
  const samples: number[] = [];
  const startTime = Date.now();

  while (Date.now() - startTime < durationMs) {
    const fps = await readFps(page);
    if (fps > 0) samples.push(fps);
    await page.waitForTimeout(1000);
  }

  if (samples.length === 0) return 0;
  return samples.reduce((a, b) => a + b, 0) / samples.length;
}

async function getDeviceTier(page) {
  return page.evaluate(() => {
    const game = (window as unknown as Record<string, unknown>).__PHASER_GAME__ as Record<string, unknown> | undefined;
    const scene = game?.scene as Record<string, unknown> | undefined;
    const gameScene = scene?.getScene?.('Game') as Record<string, unknown> | undefined;
    return gameScene?.currentTier as string ?? 'desktop';
  });
}

test.describe('FPS Performance', () => {
  test('Desktop Chrome maintains >= 50 FPS over 60 seconds with active nodes', async ({ page }) => {
    test.setTimeout(150_000);

    await page.goto('/game.html?debugFps=1');
    await waitForGame(page);
    await clickThroughMainMenu(page);
    await waitForGameScene(page);
    await page.waitForTimeout(WARMUP_MS);

    await deployNode(page, '1', 300, 200);
    await deployNode(page, '2', 600, 300);
    await deployNode(page, '3', 450, 400);

    const minFps = FPS_DESKTOP_MIN;
    const avgFps = await measureAverageFps(page, MEASURE_DURATION_MS);

    expect(avgFps).toBeGreaterThanOrEqual(minFps);
  });

  test('Pixel 5 maintains >= 30 FPS over 60 seconds with active nodes', async ({ page }) => {
    test.setTimeout(150_000);

    await page.goto('/game.html?debugFps=1');
    await waitForGame(page);
    await clickThroughMainMenu(page);
    await waitForGameScene(page);
    await page.waitForTimeout(WARMUP_MS);

    await deployNode(page, '1', 200, 300);
    await deployNode(page, '2', 100, 200);

    const avgFps = await measureAverageFps(page, MEASURE_DURATION_MS);

    expect(avgFps).toBeGreaterThanOrEqual(FPS_PHONE_MIN);
  });

  test('iPad maintains >= 40 FPS over 60 seconds with active nodes', async ({ page }) => {
    test.setTimeout(150_000);

    await page.goto('/game.html?debugFps=1');
    await waitForGame(page);
    await clickThroughMainMenu(page);
    await waitForGameScene(page);
    await page.waitForTimeout(WARMUP_MS);

    await deployNode(page, '1', 350, 250);
    await deployNode(page, '2', 500, 350);
    await deployNode(page, '3', 250, 400);

    const avgFps = await measureAverageFps(page, MEASURE_DURATION_MS);

    expect(avgFps).toBeGreaterThanOrEqual(FPS_TABLET_MIN);
  });
});
