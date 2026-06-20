# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fps.spec.ts >> FPS Performance >> iPad maintains >= 40 FPS over 60 seconds with active nodes
- Location: tests/e2e/fps.spec.ts:117:3

# Error details

```
Error: page.waitForTimeout: Target page, context or browser has been closed
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | const FPS_DESKTOP_MIN = 50;
  4   | const FPS_PHONE_MIN = 30;
  5   | const FPS_TABLET_MIN = 40;
  6   | const MEASURE_DURATION_MS = 60_000;
  7   | const WARMUP_MS = 5000;
  8   | 
  9   | async function waitForGame(page) {
  10  |   await page.waitForFunction(
  11  |     () => (window as unknown as Record<string, unknown>).__PHASER_GAME__ !== undefined,
  12  |     { timeout: 30000 },
  13  |   );
  14  | }
  15  | 
  16  | async function clickThroughMainMenu(page) {
  17  |   const canvas = page.locator('canvas');
  18  |   await page.waitForTimeout(1500);
  19  |   await canvas.click({ position: { x: 100, y: 100 } });
  20  |   await page.waitForTimeout(2000);
  21  | }
  22  | 
  23  | async function waitForGameScene(page) {
  24  |   await page.waitForFunction(
  25  |     () => {
  26  |       const game = (window as unknown as Record<string, unknown>).__PHASER_GAME__ as Record<string, unknown> | undefined;
  27  |       const scene = game?.scene as Record<string, unknown> | undefined;
  28  |       const gameScene = scene?.getScene?.('Game') as Record<string, unknown> | undefined;
  29  |       return gameScene?.snapshot !== null && gameScene?.snapshot !== undefined;
  30  |     },
  31  |     { timeout: 30000 },
  32  |   );
  33  | }
  34  | 
  35  | async function deployNode(page, toolKey, logicalX, logicalY) {
  36  |   await page.keyboard.press(toolKey);
  37  |   await page.waitForTimeout(200);
  38  | 
  39  |   const canvas = page.locator('canvas');
  40  |   const box = await canvas.boundingBox();
  41  |   if (!box) throw new Error('Canvas not found');
  42  | 
  43  |   const physicalX = box.x + (logicalX / 800) * box.width;
  44  |   const physicalY = box.y + (logicalY / 600) * box.height;
  45  | 
  46  |   await page.mouse.click(physicalX, physicalY);
  47  |   await page.waitForTimeout(300);
  48  | }
  49  | 
  50  | async function readFps(page) {
  51  |   return page.evaluate(() => {
  52  |     const game = (window as unknown as Record<string, unknown>).__PHASER_GAME__ as Record<string, unknown> | undefined;
  53  |     return (game?.loop as Record<string, unknown>)?.actualFps as number ?? 0;
  54  |   });
  55  | }
  56  | 
  57  | async function measureAverageFps(page, durationMs) {
  58  |   const samples: number[] = [];
  59  |   const startTime = Date.now();
  60  | 
  61  |   while (Date.now() - startTime < durationMs) {
  62  |     const fps = await readFps(page);
  63  |     if (fps > 0) samples.push(fps);
> 64  |     await page.waitForTimeout(1000);
      |                ^ Error: page.waitForTimeout: Target page, context or browser has been closed
  65  |   }
  66  | 
  67  |   if (samples.length === 0) return 0;
  68  |   return samples.reduce((a, b) => a + b, 0) / samples.length;
  69  | }
  70  | 
  71  | async function getDeviceTier(page) {
  72  |   return page.evaluate(() => {
  73  |     const game = (window as unknown as Record<string, unknown>).__PHASER_GAME__ as Record<string, unknown> | undefined;
  74  |     const scene = game?.scene as Record<string, unknown> | undefined;
  75  |     const gameScene = scene?.getScene?.('Game') as Record<string, unknown> | undefined;
  76  |     return gameScene?.currentTier as string ?? 'desktop';
  77  |   });
  78  | }
  79  | 
  80  | test.describe('FPS Performance', () => {
  81  |   test('Desktop Chrome maintains >= 50 FPS over 60 seconds with active nodes', async ({ page }) => {
  82  |     test.setTimeout(150_000);
  83  | 
  84  |     await page.goto('/game.html?debugFps=1');
  85  |     await waitForGame(page);
  86  |     await clickThroughMainMenu(page);
  87  |     await waitForGameScene(page);
  88  |     await page.waitForTimeout(WARMUP_MS);
  89  | 
  90  |     await deployNode(page, '1', 300, 200);
  91  |     await deployNode(page, '2', 600, 300);
  92  |     await deployNode(page, '3', 450, 400);
  93  | 
  94  |     const minFps = FPS_DESKTOP_MIN;
  95  |     const avgFps = await measureAverageFps(page, MEASURE_DURATION_MS);
  96  | 
  97  |     expect(avgFps).toBeGreaterThanOrEqual(minFps);
  98  |   });
  99  | 
  100 |   test('Pixel 5 maintains >= 30 FPS over 60 seconds with active nodes', async ({ page }) => {
  101 |     test.setTimeout(150_000);
  102 | 
  103 |     await page.goto('/game.html?debugFps=1');
  104 |     await waitForGame(page);
  105 |     await clickThroughMainMenu(page);
  106 |     await waitForGameScene(page);
  107 |     await page.waitForTimeout(WARMUP_MS);
  108 | 
  109 |     await deployNode(page, '1', 200, 300);
  110 |     await deployNode(page, '2', 100, 200);
  111 | 
  112 |     const avgFps = await measureAverageFps(page, MEASURE_DURATION_MS);
  113 | 
  114 |     expect(avgFps).toBeGreaterThanOrEqual(FPS_PHONE_MIN);
  115 |   });
  116 | 
  117 |   test('iPad maintains >= 40 FPS over 60 seconds with active nodes', async ({ page }) => {
  118 |     test.setTimeout(150_000);
  119 | 
  120 |     await page.goto('/game.html?debugFps=1');
  121 |     await waitForGame(page);
  122 |     await clickThroughMainMenu(page);
  123 |     await waitForGameScene(page);
  124 |     await page.waitForTimeout(WARMUP_MS);
  125 | 
  126 |     await deployNode(page, '1', 350, 250);
  127 |     await deployNode(page, '2', 500, 350);
  128 |     await deployNode(page, '3', 250, 400);
  129 | 
  130 |     const avgFps = await measureAverageFps(page, MEASURE_DURATION_MS);
  131 | 
  132 |     expect(avgFps).toBeGreaterThanOrEqual(FPS_TABLET_MIN);
  133 |   });
  134 | });
  135 | 
```