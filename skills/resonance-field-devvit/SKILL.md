---
name: resonance-field-devvit
description: Use for Devvit backend logic, Redis state, realtime sync, validation, queueing, scoring, and daily reset behavior in Resonance Field.
---

# Resonance Field Devvit

Use this skill for backend and sync work that needs authoritative state handling.

## Backend rules

- Devvit owns validation for node deployment, quota enforcement, scoring, and reset jobs.
- Redis state should stay simple and atomic where possible.
- The backend should archive the daily score, clear active state, and start the next map on the UTC reset.
- Message handling must remain strict and predictable.

## State rules

- Keep the active node store authoritative.
- Enforce the trilogy rule per user.
- Expire nodes after 60 seconds if they are stale.
- Update the global score in batches rather than per particle event.

## Bridge rules

- Accept snapshot requests from the webview and return a complete field state.
- Broadcast node add and node remove events to all active sessions.
- Validate incoming deploy requests before mutating state.
- Keep event payloads compact and schema-stable.

## Implementation notes

- Prefer atomic Redis operations or a small transactional sequence over multi-step mutation logic.
- If a change affects the webview contract, update the client skill and `agents.md` at the same time.

