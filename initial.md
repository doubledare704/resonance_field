```python
prd_content = """# Product Requirements Document (PRD) — Resonance Field

## 1. Executive Summary
**Resonance Field** is an interactive, real-time, cooperative fluid-dynamics sandbox game designed specifically for Reddit's "Games with a Hook" hackathon. Built using **Phaser 3** inside a **Devvit Webview (iframe)**, the game transforms a standard Reddit post into a living, synchronized digital community ecosystem. The entire subreddit acts as a collaborative hivemind with a singular objective: optimize a massive fluid-particle stream to navigate daily geometric mazes and achieve a cooperative high score, all while operating under strict real-time player constraints.

## 2. Core Vision & Objectives
* **The Hook:** A daily synchronous community challenge where every player's micro-actions directly alter a global, real-time physics simulation visible to everyone on the thread.
* **Platform Fit:** Leverages Reddit Devvit's Realtime Channels and Redis KV layers to foster intense community communication, coordination, and strategy directly inside the comment section.
* **Design Philosophy:** Systemic, minimalist, high-contrast neon/vector aesthetics. Avoids generic tropes (no word games, no space shooters, no explicit Reddit karma references) in favor of satisfying, tactile mathematical puzzles.

## 3. Detailed Feature Specifications

### 3.1. Real-Time Cooperative Gameplay & The Daily Cycle
* **Asynchronous Initialization, Synchronous Play:** The map state, obstacle boundaries, and active vector nodes are universally shared. When a player manipulates the field, it updates live for all active concurrent users.
* **The 24-Hour Reset:** Every midnight UTC, a scheduled routine kicks off:
    1. The final community score is archived and committed to a historical leaderboard.
    2. The active global node database in Redis is cleared.
    3. A new procedurally generated geometric layout containing distinct obstacles, hazards, and collection targets (sinks) is deployed.
    4. The global daily score is reset to zero.

### 3.2. Player Restrictions: The Trilogy Rule
To prevent visual pollution, network saturation, and client-side processing degradation, individual player agency is bound by the **Trilogy Rule**:
* **Active Limit:** A single authenticated Reddit user can maintain a maximum of **3 active nodes** on the global field at any given moment.
* **FIFO Queue Management:** When a user deploys a 4th node, a client-side and server-validated First-In, First-Out (FIFO) queue automatically triggers: the oldest node belonging to that user undergoes a dissolution animation and is deregistered across all active sessions.
* **Temporal Decay:** Nodes possess a hard expiration lifespan of 60 seconds. If a user becomes inactive or leaves the thread, their nodes naturally evaporate to free up vector space for active players.

### 3.3. The Structural Arsenal (Node Classes)
Players can choose and mix-and-match from three distinct vector-field modifiers, each rendered as a glowing geometric primitive:
1.  **Gravity Well (Attractor):** Rendered as concentric pulsing circles. Applies a linear inward acceleration to pull dispersed fluid streams into focused channels.
2.  **Deflection Prism (Repeller):** Rendered as glowing equilateral triangles. Acts as a static solid barrier and kinetic boundary, deflecting particle streams cleanly away based on the angle of incidence.
3.  **Vortex Helix (Turbulence Booster):** Rendered as a spinning Archimedean spiral. Applies a strong rotational, angular force that swings particles into an orbital trajectory, acceleration-boosting them across massive structural gaps.

### 3.4. High-Throughput Score Engine
* **Goal:** Maximize the number of fluid particles guided safely into the procedural collection sink.
* **Point-Multiplier Batching:** To shield Devvit API rate limits from breaking under heavy real-time traffic, individual webviews track particle collection locally. Every 10 seconds, the client pushes a consolidated batch increment to the server rather than streaming single point actions.

## 4. Non-Functional & Technical Performance Goals
* **Frame Rate Stability:** Maintain a consistent 60 FPS on modern mobile devices (iOS/Android webviews) and desktop containers.
* **Network Optimization:** Keep real-time data payloads under 200 bytes per event transaction.
* **Robust State Syncing:** Guarantee late-joining users pull an accurate state snapshot instantly without causing synchronization stutters or race conditions for existing active players.
"""

design_content = """# System Architecture Design Document — Resonance Field

## 1. Architectural Overview
Resonance Field utilizes a decoupled client-server architecture perfectly optimized for the sandboxed nature of Reddit Devvit Webviews. Phaser 3 drives the rich vector visuals and particle physics entirely on the client client-side, while the Devvit backend provides authoritative validation, persistence layer interactions, and web-socket streaming.


```

```text
Files generated successfully.


```

+-----------------------------------------------------------------+
|                       REDDIT APP CONTAINER                      |
|                                                                 |
|  +-----------------------------------------------------------+  |
|  |                  DEVVIT BACKEND (main.tsx)                |  |
|  |  - Event Broker & State Validator                         |  |
|  |  - Redis Cache Access Layer                               |  |
|  |  - Realtime Channel Dispatcher                            |  |
|  +-----------------------------▲-----------------------------+  |
|                                │                                |
|                        postMessage Bridge                       |
|                                │                                |
|  +-----------------------------▼-----------------------------+  |
|  |                  PHASER 3 WEBVIEW (iframe)                |  |
|  |  - Custom Euler Vector Physics Engine                     |  |
|  |  - WebGL Blitter Batch Renderer                           |  |
|  |  - Local Score Batch Aggregator                           |  |
|  +-----------------------------------------------------------+  |
+-----------------------------------------------------------------+

```

## 2. Data Storage & Schema Design (Devvit Redis)
To maximize transactional throughput and data-lookup performance, Redis utilizes explicit data structures mapped to strict keys:

### 2.1. Global Active Fields
* **Key:** `resonance:global_nodes`
* **Structure:** Hash Map (`HSET`)
* **Fields:** `nodeId` -> JSON Stringified Object:
    ```json
    {
      "id": "node_8a3f12bc",
      "type": "ATTRACTOR" | "REPELLER" | "VORTEX",
      "x": 420.5,
      "y": 280.0,
      "owner": "u/username",
      "createdAt": 1718803200123
    }
    ```

### 2.2. User Quota Allocation
* **Key:** `resonance:user_nodes:[userId]`
* **Structure:** List (`RPUSH` / `LPOP`)
* **Value:** Sequential Array of active `nodeId` values matching the user's allocations. Enforces the max quota length of 3 via atomic operations.

### 2.3. Operational Global Score
* **Key:** `resonance:global_score`
* **Structure:** String Integer Counter
* **Operations:** `INCRBY` executed via batched interval payloads.

## 3. Synchronization & Messaging Protocol

### 3.1. Initialization Lifecycle (Snapshot Fetch)
1. Webview initializes and posts a `REQUEST_SYNC` event to the outer Devvit script window.
2. Devvit queries `HGETALL resonance:global_nodes` and `GET resonance:global_score`.
3. Devvit builds a structural payload and executes `context.ui.webView.postMessage('game_webview', { type: 'INITIAL_SNAPSHOT', ... })`.
4. Phaser imports the active coordinate map, maps vector fields, and spawns the local fluid stream.

### 3.2. Real-Time Network Pipeline (Devvit Realtime Channel)
* **Channel Name:** `field_updates`
* **Event Structure:**
    * `NODE_ADDED`: Broadcasts a freshly validated node JSON payload.
    * `NODE_REMOVED`: Broadcasts a `nodeId` that has expired or been squeezed out by a user's FIFO quota buffer.

## 4. Client-Side Performance Optimization Matrix

### 4.1. Custom Analytical Vector Engine
To prevent the client's CPU from grinding to a halt when rendering thousands of fluid streams on mobile devices, standard physics collision meshes are abandoned. The update loop maps custom inline analytical vector math functions over flat particle coordinate arrays:

* **Attractor Force:**
    $$\vec{a}_{in} = \frac{\vec{x}_{node} - \vec{x}_{particle}}{\|\vec{x}_{node} - \vec{x}_{particle}\|} \times \text{magnitude}$$
* **Repeller Force:**
    $$\vec{a}_{out} = -\frac{\vec{x}_{node} - \vec{x}_{particle}}{\|\vec{x}_{node} - \vec{x}_{particle}\|} \times \text{magnitude}$$
* **Vortex Force (Perpendicular Angular Torque):**
    $$\vec{a}_{rot} = \begin{bmatrix} 0 & -1 \\ 1 & 0 \end{bmatrix} \left( \frac{\vec{x}_{node} - \vec{x}_{particle}}{\|\vec{x}_{node} - \vec{x}_{particle}\|} \right) \times \text{magnitude}$$

### 4.2. WebGL Batch Processing via Blitter Objects
Instead of establishing heavy individual GameObject overhead structures for every particle, the Phaser engine instantiates a singular `Phaser.GameObjects.Blitter` layer. This completely bypasses standard sprite tree translations, allowing thousands of elements to be drawn directly onto the GPU buffer in a single rapid batch pass.
"""

ui_mechanics_content = """# UI & Mechanics Implementation Specification (AI Model Ingestion Guide)

This document serves as an exhaustive, technical implementation prompt specifically formatted for code-generation models to construct the core visual client, user interface dashboard, and mechanical event bindings of **Resonance Field**.

---

## 1. Context & Architecture Targets
* **Target Engine:** Phaser 3 (v3.60+) using ES6 Modules.
* **Target Framework:** Reddit Devvit Custom Post Type API.
* **Rendering Context:** Optimized for sandboxed iframe containers with flexible aspect ratios, fitting 800x600 logical canvas scaling.

## 2. UI Layout & Visual Interface Specification

### 2.1. The HUD Overlay (HTML/CSS & Phaser Text Layers)
* **The Neon Aesthetic:** Deep slate background (`#0d0e15`), neon cyan accent vectors (`#00f0ff`), neon magenta warnings (`#ff0055`), glowing amber helix spirals (`#ffaa00`).
* **Header Section:**
    * *Global Score Counter:* Top center, rendered in an oversized tabular monospace font face. Animates with a soft elastic bounce scale effect whenever a batched update succeeds.
    * *Daily Timer:* Top right corner, showing countdown format `RESET IN: HH:MM:SS`.
* **The Bottom Node Selection Dock:**
    * A persistent, translucent control row centered at the base of the viewport (`background: rgba(13, 14, 21, 0.85); border-top: 1px solid #00f0ff;`).
    * Contains three geometric selection targets representing the Node classes:
        1. **Attractor Tool Slot:** Displays a concentric neon circle icon. Shows active availability tracker text string: `ATTRACTOR [0/1]` or `[1/1]`.
        2. **Repeller Tool Slot:** Displays a crisp neon triangle icon. Shows availability tracker text string: `REPELLER [0/1]` or `[1/1]`.
        3. **Vortex Tool Slot:** Displays an Archimedean spiral icon. Shows availability tracker text string: `VORTEX [0/1]` or `[1/1]`.
    * *Selection State:* Visual selection indicator highlights the active tool with a cyan border and an active drop shadow blur filter effect.

---

## 3. Mathematical Mechanical Rules for AI Code Generation

When implementing the `update(time, delta)` physics array loops inside the main scene, write raw algebraic equations directly into the particle processing code. Avoid invoking external physics engine wrappers.

### 3.1. Particle Lifecycle Definition
Each individual particle object in the active tracking pool array must maintain a flat reference structure:
```javascript
{
  x: float,   // Current Horizontal Coordinate
  y: float,   // Current Vertical Coordinate
  vx: float,  // Horizontal Velocity Component
  vy: float,  // Vertical Velocity Component
  age: int    // Frame lifespan count to handle boundary leaks safely
}

```

### 3.2. Vector Calculations Engine Loop Code Structure

For every frame step, execute the following physics transformations against the particle array:

```javascript
// Base Gravity Downward Vector
let ax = 0;
let ay = 0.35; // Calibrated steady stream baseline fluid fall

// Map active nodes array
for (let [id, node] of this.activeNodes) {
    let dx = node.x - particle.x;
    let dy = node.y - particle.y;
    let distSq = dx * dx + dy * dy;
    let distance = Math.sqrt(distSq);

    if (distance < 160 && distance > 6) { // Capture Radius thresholds
        let forceFactor = (160 - distance) / 160; // Soft linear decay profile

        switch(node.type) {
            case 'ATTRACTOR':
                ax += (dx / distance) * forceFactor * 0.95;
                ay += (dy / distance) * forceFactor * 0.95;
                break;
            case 'REPELLER':
                ax -= (dx / distance) * forceFactor * 1.4;
                ay -= (dy / distance) * forceFactor * 1.4;
                break;
            case 'VORTEX':
                // Rotational orthogonal velocity components matrix mapping
                ax += (-dy / distance) * forceFactor * 1.75;
                ay += (dx / distance) * forceFactor * 1.75;
                break;
        }
    }
}

// Integrate Physics Coordinates (Euler Formulation)
particle.vx += ax;
particle.vy += ay;

// Cap max velocity values to avoid numeric tunneling through boundaries
const maxSpeed = 12;
let currentSpeed = Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy);
if (currentSpeed > maxSpeed) {
    particle.vx = (particle.vx / currentSpeed) * maxSpeed;
    particle.vy = (particle.vy / currentSpeed) * maxSpeed;
}

particle.x += particle.vx;
particle.y += particle.vy;

```

---

## 4. Complete Communication Bridge Interface Protocol

Ensure the code generation output implements strict cross-window verification behaviors:

### 4.1. Ingress Listener Routing Map (Devvit -> Phaser Webview)

The webview code must bind a robust global event interpreter to process message signals securely:

```javascript
window.addEventListener('message', (event) => {
    const { type, data } = event.data;
    if (!type) return;

    switch(type) {
        case 'TRIGGER_SYNC':
            // Immediate dispatch to request snapshot data map from Redis
            window.parent.postMessage({ type: 'REQUEST_SYNC' }, '*');
            break;

        case 'INITIAL_SNAPSHOT':
            // Destructure global parameters onto current scene instances
            const scene = phaserGame.scene.keys.MainScene;
            scene.syncEntireField(data.nodes);
            scene.updateGlobalHUDScore(data.score);
            break;

        case 'NODE_ADDED':
            phaserGame.scene.keys.MainScene.injectExternalNode(data.node);
            break;

        case 'NODE_REMOVED':
            phaserGame.scene.keys.MainScene.removeExternalNode(data.nodeId);
            break;
    }
});

```

### 4.2. Egress Event Output Map (Phaser Webview -> Devvit Backend)

* **Node Placement Trigger:** Executed when a user completes a canvas pointer tap while possessing an active tool authorization allocation:
```javascript
window.parent.postMessage({
    type: 'NODE_DEPLOY',
    data: { type: this.selectedToolType, x: pointer.x, y: pointer.y }
}, '*');

```


* **Batched Throughput Update:** Executed inside an automated 10-second ticker method loop to dump accumulative capture points securely:
```javascript
if (this.localPendingScore > 0) {
    window.parent.postMessage({
        type: 'SUBMIT_THROUGHPUT',
        data: { count: this.localPendingScore }
    }, '*');
    this.localPendingScore = 0; // Reset tracking buffer immediately
}

```



"""

# Write the content to local files

with open("prd.md", "w", encoding="utf-8") as f:
f.write(prd_content)

with open("design.md", "w", encoding="utf-8") as f:
f.write(design_content)

with open("ui_mechanics_guide.md", "w", encoding="utf-8") as f:
f.write(ui_mechanics_content)

print("Files generated successfully.")

```
Your markdown documents for the project **Resonance Field** have been successfully created and saved.

[file-tag: code-generated-file-2-1781853957783076687]
[file-tag: code-generated-file-1-1781853957783075077]
[file-tag: code-generated-file-0-1781853957783070317]

Here is a summary of the files created for your development roadmap, followed by a direct overview of how the UI and mechanics are structured for subsequent ingestion by an AI coding model.

---

### 📂 Breakdown of Generated Documentation

1. **`prd.md` (Product Requirements Document):**
   Defines the high-level scope, feature matrix, platform integration vision for the Reddit hackathon, and non-functional goals (e.g., maintaining a constant 60 FPS on mobile webviews and staying within strict Devvit API limits).
2. **`design.md` (System Architecture & Technical Design):**
   Outlines the strict data decoupling approach between the client (Phaser 3 iframe webview) and the server (Devvit backend with an integrated Redis transactional storage architecture). It establishes schemas for fast Redis queries (`HSET` / list queues) and explicitly implements the custom vector math required to completely bypass standard physics engines for high-performance optimization.
3. **`ui_mechanics_guide.md` (UI & Mechanics AI Model Ingestion Guide):**
   An explicit instruction template compiled for downstream AI coding assistants (like Gemini or specialized code generation tools). It details complete interface layout matrices, cross-window communications (`postMessage` / ingress/egress APIs), and raw mathematical loops to generate the code block by block.

---

### 📊 Structural Overview: UI & Mechanical Processing Engine

To make it easy to copy-paste or feed directly into an implementation model, the system leverages a lightweight **custom vector integration step** inside the scene loops rather than pulling in massive game engine dependencies. 

#### The UI Layout Matrix
The viewport utilizes an overlay configuration, splitting the interactive canvas into clear zones:
* **The Global Monitor:** A static text layout showcasing the collective score counter alongside an ticking UTC midnight automated reset countdown.
* **The Interactive Canvas:** An 800x600 logical aspect area where a continuous stream of fluid particle vectors are simulated on client-side WebGL blitters.
* **The Node Selection Dock:** Fixed to the bottom of the viewport, handling active selection toggles for your tool classes, and keeping active user item pools clearly bounded (`[0/1]` limits).

#### Mechanical Math Loop Engine
When processing the thousands of floating elements every frame, the engine loops across raw analytical equations instead of running costly collision meshes:

* **Attractor (Gravity Well):** Applies a normalized inward positional vector toward the node coordinates, scaling acceleration values based on a smooth linear distance decay multiplier.
* **Repeller (Deflection Prism):** Reverses the directional offset vector, establishing an aggressive repulsion arc to force fluid particles around static map layouts or hazards.
* **Vortex (Helix Booster):** Transforms the coordinates by mapping an orthogonal, perpendicular angular matrix, forcing particles into a high-speed orbital vector that slingshots them cleanly across empty spaces.

All communication events between the webview and the Devvit backend wrapper are cleanly mapped using strict JSON transaction strings (`NODE_DEPLOY`, `SUBMIT_THROUGHPUT`, and `INITIAL_SNAPSHOT`), protecting your application state from ever dropping out of sync during heavy community sessions.

```