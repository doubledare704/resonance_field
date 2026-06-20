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
- Step 11.2: Added Playwright E2E FPS benchmarks (Desktop >= 50, Tablet >= 40, Phone >= 30) and 26 Vitest unit tests for ParticleField physics collection, layout culling, throughput batching, retry queue exponential backoff, client-side expiry pruning, and Game.update score accumulation.

## Planned

- Step 12: Finish final UI polish and mobile spacing adjustments.

## Recommended Next Order

1. Final UI polish and mobile spacing adjustments.
