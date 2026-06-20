# Resonance Field Roadmap

This file tracks the current implementation status for the Phaser + Devvit app.
It separates work that is already done from the next pieces still planned.

## Done

- Step 1: Defined the game contract in `src/shared/contract.ts`.
- Step 2: Built the Devvit server authority, state handling, and API routes.
- Step 3: Wired the client bridge and sync flow between Phaser and Devvit.
- Step 4: Built the Phaser game shell, HUD, dock, and tool selection flow.
- Step 5: Added the particle simulation and throughput batching loop.
- Review cleanup: Replaced raw protocol strings with enums and tightened layout constants in `src/client/scenes/Game.ts`.
- Review cleanup: Replaced raw node type strings with enums in `src/client/simulation.ts` and server validation.
- Step 6: Added procedural daily field generation for the new UTC reset layout.
- Step 7: Build a leaderboard or archive UI for past daily scores.
- Step 8: Polish the reset rollover experience on the client.
- Step 9: Harden realtime sync and Devvit bridge behavior under live playtest conditions.
- Step 10: Tune particle simulation balance and small-screen, tablet, desktop performance.
- Step 11.1: Added automated tests for quota enforcement, FIFO removal, expiry, reset, and throughput batching (169 tests, 91% coverage).

## Planned

- Step 11.2: Add performance testing fps with Playwright.
  - Deferred from 11.1 (client-side throughput batching, see `src/client/simulation.ts:104` `ParticleField.step()` and `src/client/scenes/Game.ts:528` `queueThroughput`).
  - Install Playwright + configure `playwright.config.ts` with device profiles (Pixel 5, iPad, Desktop Chrome).
  - E2E performance test: launch `npm run dev`, navigate to a seeded post, deploy all three node types, run for 60s, assert `actualFps >= 50` on desktop and `>= 30` on phone.
  - Particle simulation test: load page, trigger `ParticleField.step()` for N frames, assert `collected` count > 0 within window and throughput batches are sent.
  - Batch flush test: accumulate score in `localPendingScore` via `queueThroughput`, wait for the 10s `throughputTimer` to fire, assert `submitThroughputRequest` is called once with the full batch.
  - Retry queue test: force `submitThroughputRequest` to fail twice, assert the entry stays in `throughputRetryQueue` with exponential backoff, then succeed and assert queue empties.
  - Throughput scoring test: verify `Game.update()` accumulates `collected` particles into `localPendingScore` and flushes the total.
  - Client-side expiry pruning test: deploy node with short `expiresAt`, advance fake timers past expiry, assert node is removed from `snapshot.nodes` by `pruneExpiredNodes()`.
  - Layout/culling test: verify `simulation.setFieldLayout` updates `layoutVersion` and redraws on `step()`.

- Step 12: Finish final UI polish and mobile spacing adjustments.

## Recommended Next Order

1. Procedural daily field generation.
2. Leaderboard or archive UI.
3. Reset rollover polish.
4. Realtime hardening and playtest verification.
5. Simulation tuning.
6. Tests.
7. Final UI polish.
