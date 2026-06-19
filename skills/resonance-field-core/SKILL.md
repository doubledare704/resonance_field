---
name: resonance-field-core
description: Use for repo-wide planning, turning initial.md into implementation tasks, and keeping Resonance Field work aligned with the PRD and architecture constraints.
---

# Resonance Field Core

Use this skill when the task spans multiple layers, requires reading the source prompt, or affects project-wide decisions.

## Canonical constraints

- The source of truth is `initial.md`.
- The game is a Phaser 3 webview inside Devvit.
- Devvit is authoritative for sync, quotas, resets, and score persistence.
- The experience should stay neon, geometric, and minimal.
- Preserve the trilogy rule, 60 second node expiry, and daily UTC reset.
- Keep realtime payloads small and the client stable at 60 FPS on modern devices.

## Workflow

1. Read `initial.md` first if the task touches design or gameplay intent.
2. Identify the layer affected: client, backend, bridge, docs, or tooling.
3. Prefer the smallest change that keeps the system coherent.
4. If a change touches multiple layers, update the related skill or hook notes in the same pass.
5. Validate against the PRD rules above before finishing.

## Guardrails

- Do not drift into generic game patterns when the prompt calls for a distinctive cooperative fluid sandbox.
- Do not weaken validation on the backend just to simplify the client.
- Do not add extra abstractions unless they reduce risk or remove repeated logic.

