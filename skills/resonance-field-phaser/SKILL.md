---
name: resonance-field-phaser
description: Use for Phaser 3 client code, HUD layout, particle simulation, pointer input, and webview message handling in Resonance Field.
---

# Resonance Field Phaser

Use this skill for client-side work in the webview, especially scene code, HUD, particle logic, and bridge events.

## Client rules

- Keep the canvas logic compatible with a sandboxed Devvit iframe.
- Preserve the 800x600 logical layout target and responsive scaling behavior.
- Keep the visual language neon, high-contrast, and geometric.
- Use flat particle state and direct vector math for the simulation loop.
- Keep score batching local and send it on a timer instead of per particle.

## Gameplay rules

- Enforce the three node classes: attractor, repeller, and vortex.
- Respect the active tool availability display in the HUD.
- Keep the local UI in sync with backend snapshots and node add/remove events.
- Treat the client as a renderer and interaction surface, not the source of truth.

## Implementation notes

- Prefer simple loops and direct math over heavy wrappers.
- Keep message types stable: `REQUEST_SYNC`, `INITIAL_SNAPSHOT`, `NODE_ADDED`, `NODE_REMOVED`, `NODE_DEPLOY`, and `SUBMIT_THROUGHPUT`.
- When changing input or HUD behavior, verify the full message path still works from pointer event to backend event.

