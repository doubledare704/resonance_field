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

# Overview | Reddit for Developers
Create live and event-driven interactive posts. Realtime provides a set of primitives that lets you build interactive posts that are:

*   **Live**. Users engaging with the same interactive post see each others’ changes without any observable lag.
*   **Event-driven**. Posts render automatically in response to server events.
*   **Synced**. Using realtime with [Redis](https://developers.reddit.com/docs/capabilities/server/redis) lets you build persistent community experiences that are backed by high performance data synchronization.

Realtime is supported in [Devvit Web](https://developers.reddit.com/docs/capabilities/devvit-web/devvit_web_overview) applications.

Realtime in Devvit Web
----------------------

This guide walks through step-by-step instructions on how to set up [Realtime](https://developers.reddit.com/docs/capabilities/realtime/overview) in a [Devvit Web](https://developers.reddit.com/docs/capabilities/devvit-web/devvit_web_overview) application

Overview[​](#overview-1 "Direct link to Overview")
--------------------------------------------------

The realtime client allows you to:

*   **Connect** to realtime channels for receiving messages
*   **Handle** connection lifecycle events (connect/disconnect)
*   **Process** incoming messages with custom logic
*   **Manage** multiple channel subscriptions
*   **Disconnect** from channels when no longer needed

Architecture[​](#architecture "Direct link to Architecture")
------------------------------------------------------------

Realtime functionality in Devvit follows a client/server architecture:

*   **Client-side** (connectRealtime): Subscribe to channels and receive messages
*   **Server-side** (realtime.send): Send messages to channels

This separation ensures that message sending is controlled by server-side logic while clients can freely subscribe to channels they're interested in.

Client-side API reference[​](#client-side-api-reference "Direct link to Client-side API reference")
---------------------------------------------------------------------------------------------------

### connectRealtime[​](#connectrealtime "Direct link to connectRealtime")

Connects to a realtime channel for receiving messages.

client/index.ts

```

import { connectRealtime } from '@devvit/web/client';

const connection = await connectRealtime({

  channel: 'my-channel',

  onConnect: (channel) => {

    console.log(`Connected to ${channel}`);

  },

  onDisconnect: (channel) => {

    console.log(`Disconnected from ${channel}`);

  },

  onMessage: (data) => {

    console.log('Received message:', data);

  },

});

```


#### Parameters[​](#parameters "Direct link to Parameters")

*   `opts` - Connection options object
    *   `channel` (string) - The name of the channel to connect to. Note, you cannot use the `:` character in the channel name
    *   `onConnect?` (function) - Optional callback called when connection is established
    *   `onDisconnect?` (function) - Optional callback called when connection is lost
    *   `onMessage` (function) - Required callback called when a message is received

#### Returns[​](#returns "Direct link to Returns")

A `Connection` object with a `disconnect()` method.

### Connection[​](#connection "Direct link to Connection")

A connection object returned by `connectRealtime()`.

#### Methods[​](#methods "Direct link to Methods")

##### disconnect()
[​](#disconnect "Direct link to disconnect()")

Disconnects from the realtime channel.

```

await connection.disconnect();

```


This method:

*   Removes the channel from active subscriptions
*   Cleans up event listeners
*   Calls the `onDisconnect` callback if provided

Server-side API reference[​](#server-side-api-reference "Direct link to Server-side API reference")
---------------------------------------------------------------------------------------------------

### Realtime plugin[​](#realtime-plugin "Direct link to Realtime plugin")

The server-side plugin for sending messages to realtime channels.

server/index.ts

```

import { realtime } from '@devvit/web/server';

// Send a message to a channel

await realtime.send('my-channel', {

  type: 'user-joined',

  userId: '123',

});

```


#### Methods[​](#methods-1 "Direct link to Methods")

##### send(channel: string, msg: JSONValue): Promise[​](#sendchannel-string-msg-jsonvalue-promise "Direct link to sendchannel-string-msg-jsonvalue-promise")

Sends a message to a specific channel.

*   `channel` (string) - The name of the channel to send the message to
*   `msg` (JSONValue) - The message data to send

Usage examples[​](#usage-examples "Direct link to Usage examples")
------------------------------------------------------------------

### Client-side: basic channel connection[​](#client-side-basic-channel-connection "Direct link to Client-side: basic channel connection")

client/index.ts

```

import { connectRealtime } from '@devvit/web/client';

// Connect to a channel

const connection = await connectRealtime({

  channel: 'user-updates',

  onMessage: (data) => {

    // Handle incoming messages

    console.log('User update:', data);

  },

});

// Later, disconnect when done

await connection.disconnect();

```


### Client-side: connection lifecycle management[​](#client-side-connection-lifecycle-management "Direct link to Client-side: connection lifecycle management")

client/index.ts

```

import { connectRealtime } from '@devvit/web/client';

const connection = await connectRealtime({

  channel: 'live-chat',

  onConnect: (channel) => {

    console.log(`Connected to ${channel}`);

    // Update UI to show connected state

    setIsConnected(true);

  },

  onDisconnect: (channel) => {

    console.log(`Disconnected from ${channel}`);

    // Update UI to show disconnected state

    setIsConnected(false);

  },

  onMessage: (data) => {

    // Process chat messages

    addMessageToChat(data);

  },

});

```


### Server-side: sending messages[​](#server-side-sending-messages "Direct link to Server-side: sending messages")

server/index.ts

```

import { realtime } from '@devvit/web/server';

// Send a simple message

await realtime.send('notifications', 'New user joined!');

// Send a structured message

await realtime.send('game-updates', {

  type: 'score-update',

  playerId: 'user123',

  score: 1500,

  timestamp: Date.now(),

});

```


# Devvit Web | Reddit for Developers
Devvit Web includes an easy way to build Devvit apps using a standard web stack.

What it is[​](#what-it-is "Direct link to What it is")
------------------------------------------------------

Devvit Web allows developers to build Devvit apps just like you would for the web. At the core, Devvit Web provides:

*   **A standard web app** that allows you to build with industry-standard frameworks and technologies (like React, Three.js, or Phaser).
*   **Server endpoints** that you define to communicate between the webview client and the Devvit server, using industry-standard frameworks and technologies (like Express.js, Hono, Koa, etc.).
*   **Devvit configuration** with a traditional client/server split. Devvit capabilities are now in one of three places:
    *   A configuration file in devvit.json for defining app metadata, permissions, and capabilities
    *   Client capabilities in the @devvit/client SDK
    *   Server capabilities, like Redis and Reddit API with the @devvit/server SDK

With Devvit Web, you have continued access to our hosting services, key capabilities like Redis and Reddit API, standard web technologies, and a typical client/server pattern to build your apps.

In addition, since you’re working with standard web technologies your apps should work with AI tools more effectively.

Examples[​](#examples "Direct link to Examples")
------------------------------------------------

Visit [https://developers.reddit.com/new](https://developers.reddit.com/new) and choose one of our templates or take a look at the github repositories:

*   [React](https://github.com/reddit/devvit-template-react)
*   [Phaser](https://github.com/reddit/devvit-template-phaser)
*   [Three.js](https://github.com/reddit/devvit-template-threejs)
*   [Hello World](https://github.com/reddit/devvit-template-hello-world)

Limitations[​](#limitations "Direct link to Limitations")
---------------------------------------------------------

As with most experimental features, there are some caveats.



* Limitation: Serverless endpoints
  * What it means: The node server will run just long enough to execute your endpoint function and return a response, which means you can't use packages that require long-running connections like streaming.
* Limitation: Package limitations
  * What it means: Developers cannot use fs or external native packages. For now, we recommend using external services over the native dependencies, such as StreamPot (instead of ffmpeg) and OpenAI (instead of @xenova/transformers) .
* Limitation: Single request and single response handling only
  * What it means: Streaming or chunked responses and websockets are not supported. Long-polling is supported if it's under the max request time.
* Limitation: No external requests from your client
  * What it means: You can't have any external requests other than the app's webview domain. All backend responses are locked down to the webview domain via CSP. (Your backend can make external fetch requests though.)
* Limitation: localStorage clears on app updates
  * What it means: The iframe URL changes with each app version, so localStorage data is lost when you publish an update. Use Redis for data that needs to persist across app versions.


Devvit Web still has the same technical requirements:

*   Server endpoint calls
*   Max request time: 30s
*   Max payload size: 4MB
*   Max response size: 10MB
*   HTML/CSS/JS only

Devvit Web components[​](#devvit-web-components "Direct link to Devvit Web components")
---------------------------------------------------------------------------------------

Devvit Web uses endpoints between the client and server to make communication similar to standard web apps. A Devvit Web app has three components:

*   Client
*   Server
*   Configuration

Devvit Web templates all have the same file structure:

```

.

├── src/

│   ├── client/     # contains the webview code

│   └── server/     # endpoints for the client

└── devvit.json     # the devvit config file

```


Your client talks to the server by calling `/api/` endpoints you define with `fetch()`.

### Client folder[​](#client-folder "Direct link to Client folder")

This folder includes client-side code. This includes any html/css/javascript and relevant web libraries, and it will appear in a webview inside of a post for Reddit users.

When you want to make server-side calls, or use server-side capabilities, you’ll use fetch and define what happens in your server folder.

### Server folder[​](#server-folder "Direct link to Server folder")

This folder includes server-side code. We provide a node server, and you can use typical node server frameworks like Hono, Koa, or Express. This is where you can access key capabilities like [Redis](https://developers.reddit.com/docs/capabilities/server/redis), Reddit API client, and [fetch](https://developers.reddit.com/docs/capabilities/server/http-fetch).

We also provide an authentication middleware so you don’t have to worry about authentication.

note

All server endpoints must start with `/api/` (e.g. `/api/get-something` or `/api/widgets/42`).

![devvit web architecture](https://developers.reddit.com/docs/assets/images/devvit_web_arch-7c4a1eded4e6462277ab8169622722fa.png)

### Configuration in `devvit.json`[​](#configuration-in-devvitjson "Direct link to configuration-in-devvitjson")

`devvit.json` is the configuration file for Devvit apps. It defines an app's post configuration, Node.js server configuration, permissions, scheduled jobs, event triggers, menu entries, payments configuration, and project settings. `devvit.json` replaces the legacy `devvit.yaml` configuration. A project should have one or the other but not both.

Learn more about [devvit.json](https://developers.reddit.com/docs/capabilities/devvit-web/devvit_web_configuration)

# Building Community Games | Reddit for Developers
*   [](https://developers.reddit.com/docs/)
*   Best Practices
*   Building Community Games

Building Community Games
------------------------

Community games are multiplayer experiences that tap into Reddit’s unique social dynamics.

This guide provides practical tips to help you create engaging community games that thrive in Reddit's ecosystem. Read on to learn about the kinds of mechanics that help drive long-term engagement and unlock a shot at [featuring placements](https://developers.reddit.com/docs/guides/launch/feature-guide) for your app.

Player retention[​](#player-retention "Direct link to Player retention")
------------------------------------------------------------------------

Retention is the art of giving players a reason to come back tomorrow. Most successful games create simple, repeatable patterns that become part of the player’s daily routine.

### Add a subscribe option[​](#add-a-subscribe-option "Direct link to Add a subscribe option")

One of the simplest ways to drive repeat play is to encourage users to subscribe to your subreddit. Subscribers will see new app posts and community discussions in their home feed, which organically brings them back to your game.

You can add a “Join” button in your app using the [user actions](https://developers.reddit.com/docs/capabilities/server/userActions) plugin. This creates a lightweight, opt-in way for players to stay connected and engaged.

### Habits and feedback loops[​](#habits-and-feedback-loops "Direct link to Habits and feedback loops")

Build loops in your game that reward daily habits. **Streaks** and **milestone rewards** encourage consistency: players come back to maintain progress and reach the next goal. You’ll see streaks in games like [r/syllo](https://www.reddit.com/r/syllo/), and [r/honk](https://www.reddit.com/r/honk/) lets players earn loot by completing game levels. You can also add streaks to player flairs.

**Tip**: Consider adding grace mechanics like streak freezes to reduce churn.

**Push notifications** are another way to reinforce a daily habit, and they work best when paired with other retention features like streaks, leagues, and leaderboards. Push notifications are currently a limited beta feature, but you can reach out via [r/Devvit](https://www.reddit.com/r/Devvit/) modmail to apply for a spot in our beta program.

### Progress and recognition[​](#progress-and-recognition "Direct link to Progress and recognition")

Short-term and long-term goals give players something to work toward, and you’ll want to make progress visible and meaningful:

*   Tie daily play to larger systems like **leagues** or **ranks** so that small actions contribute to bigger goals.
*   Use visible status indicators like **flair** and **badges** to increase emotional investment in your game.

For short-term goals, [r/HotandCold](https://www.reddit.com/r/HotAndCold/) uses the fire emoji to let players know they’re on the right track, and keeps a progress bar with player avatars to see gameplay progress.

![HotandCold progress bar](https://developers.reddit.com/docs/assets/images/hotandcold-f244300074833b25eb0af98367288d9b.jpg)

For long-term goals, [r/BubbleShooterPro](https://www.reddit.com/r/BubbleShooterPro/) sets up weekly tournaments to establish leagues and encourages players to return to try to get promoted to the next level.

![BubbleShooterPro](https://developers.reddit.com/docs/assets/images/bubbleshooterpro-c63a30afe79ab9c14b43f04584368139.png)

### Competition and social pull[​](#competition-and-social-pull "Direct link to Competition and social pull")

Reddit is inherently social, and it’s a natural fit for **leaderboards**. The daily leaderboard on [r/syllo](https://www.reddit.com/r/syllo/) gives everyone a fresh chance to compete each day.

![Syllo leaderboard](https://developers.reddit.com/docs/assets/images/syllo_leaderboard-297a909f65fecff317f64d824289183e.jpg)

Leverage the community to **highlight top contributors** or celebrate a “**player of the week**” in a way that's visible in the feed. Social visibility turns participation into status.

### Challenges and missions[​](#challenges-and-missions "Direct link to Challenges and missions")

Give players clear goals on a cadence to drive engagement:

*   **Daily or weekly missions**. Short, achievable tasks create regular reasons to return, like:
    
*   Solve today’s puzzle of [r/pocketgrids](https://www.reddit.com/r/pocketgrids/)
    
*   Submit a drawing in [r/Pixelary](https://www.reddit.com/r/Pixelary/)
    
*   Complete a mission in [r/PlaySpies](https://www.reddit.com/r/PlaySpies/)
    
*   **Rotating or seasonal events**. Create limited-time themes and special events to keep content fresh and give players urgency.
    

### Reward systems[​](#reward-systems "Direct link to Reward systems")

Use rewards to reinforce meaningful participation. Allow players to accumulate **points** they can **redeem** for perks or other in-game advantages. In [r/FarmMergeValley](https://www.reddit.com/r/FarmMergeValley/), players earn diamonds they can use toward things like purchasing land for their farm.

![FMV diamonds](https://developers.reddit.com/docs/assets/images/farmmergevalley-99923e68b97f483f7559f184f6695719.png)

**Tip**: Align incentives with community values. High-quality contributions should earn more than low-effort ones.

Why retention matters for featuring[​](#why-retention-matters-for-featuring "Direct link to Why retention matters for featuring")
---------------------------------------------------------------------------------------------------------------------------------

Reddit prioritizes sustained engagement over short spikes.

Games that consistently bring players back through progression, competition, and repeatable loops build strong retention curves. That ongoing engagement demonstrates lasting community value, which is a key factor in featuring decisions.

Core design principles[​](#core-design-principles "Direct link to Core design principles")
------------------------------------------------------------------------------------------

Use these principles to build for return visits, not just first plays.



* Principle: Keep it bite-sized
  * Execution: · Focus on quick gameplay loops.· Reduce time to fun — players should be engaged within seconds.· Smaller scope means faster development and easier maintenance.
  * Example: r/chessquiz delivers daily puzzles instead of full matches.
* Principle: Design for the feed
  * Execution: · Make the first screen eye-catching· Include a clear, immediate call to action· Remember you’re competing with everything else in the feed
  * Example: r/Pixelary shows the canvas immediately.
* Principle: Build Content Flywheels
  * Execution: Reddit posts decay quickly. Your game needs a strategy to stay relevant.Option A: Scheduled content· Daily or weekly challenges· Automated post creation· Recurring tournamentsOption B: Player-generated content· Gameplay creates new posts or comments· Players generate the content· Include moderation systems for quality control
  * Example: r/Sections schedules a new puzzle every day.r/captioncontest turns submissions into ongoing content.
* Principle: Embrace asynchronous play
  * Execution: · Players can participate anytime· Lower commitment per session· Works across time zones· Scales more easily
  * Example: r/BlinkWords is available for players any time.
* Principle: Scale from one to many
  * Execution: Your game should be fun at any player count:· A strong single-player baseline· Smooth scaling as more players join· Leaderboards or shared goals to add competition
  * Example: r/DarkDungeonGame works solo but improves with collaboration.


Getting featured[​](#getting-featured "Direct link to Getting featured")
------------------------------------------------------------------------

Check out the [Feature Guide](https://developers.reddit.com/docs/guides/launch/feature-guide) to learn more about how Reddit helps your game get discovered.

[](https://developers.reddit.com/docs/capabilities/server/userActions)
[](https://developers.reddit.com/docs/guides/best-practices/mod_resources)

*   [Player retention](#player-retention)
    *   [Add a subscribe option](#add-a-subscribe-option)
    *   [Habits and feedback loops](#habits-and-feedback-loops)
    *   [Progress and recognition](#progress-and-recognition)
    *   [Competition and social pull](#competition-and-social-pull)
    *   [Challenges and missions](#challenges-and-missions)
    *   [Reward systems](#reward-systems)
*   [Why retention matters for featuring](#why-retention-matters-for-featuring)
*   [Core design principles](#core-design-principles)
*   [Getting featured](#getting-featured)

# Mod Resources | Reddit for Developers
Devvit apps are programs hosted and run on Reddit’s Developer Platform. Moderators can install an app on their subreddits to customize a community with bespoke mod tools, discussion bots, new governance tools, games, leaderboards, and more.

note

Some apps are for everyone in the community, while others are limited to moderators in the community. Moderation apps will often have buttons that show up in, or with, the mod shield icon.

Understanding apps[​](#understanding-apps "Direct link to Understanding apps")
------------------------------------------------------------------------------

### Permissions[​](#permissions "Direct link to Permissions")

Apps may require certain permissions in order to work on your subreddit. These permissions are listed on the app detail pages in the [Community Apps](https://developers.reddit.com/) directory.

Permissions fall in one of three categories.



* Category: UI
  * Description: Permissions the app needs for the UI elements it uses.
* Category: User data handling
  * Description: Permissions the app needs for the way it manages user data.
* Category: Mod permissions (required)
  * Description: Permission the app needs to create an app account with everything permissions on your subreddit.


You can see the permissions an app requires on the app details page, install details page, and in the CLI.

![app permissions](https://developers.reddit.com/docs/assets/images/app_permissions-075fb7f91ad1b7c505c9db32b8068616.png)

### App accounts[​](#app-accounts "Direct link to App accounts")

Each app has an “app account”’ which is basically a user account for the app. The app account may take mod actions, write posts/comments, or send messages programmatically. These accounts are not human-operated or logged into.

Currently, app accounts are granted full mod permissions. In the future they will be granted more granular permissions based on the actions they need to take.

![app details](https://developers.reddit.com/docs/assets/images/app_account_everything_permissions-55a70a9cc20145eda57a45ae39398088.png)

### Configuration settings[​](#configuration-settings "Direct link to Configuration settings")

Some apps have settings that let you control how the app is configured to work on your subreddit. You can enable a specific setting or select options the developer provided to further customize your subreddit’s experience.

![app details](https://developers.reddit.com/docs/assets/images/app_config_screen-53d1a9ebedbbe3f94560a4fca0add4fa.png)

How to install an app[​](#how-to-install-an-app "Direct link to How to install an app")
---------------------------------------------------------------------------------------

Go to the [Apps](https://developers.reddit.com/apps) directory and select an app. This opens the app detail page. Click the red **Install** button, select the subreddit you want to add the app to, and presto! You’ve just installed an app.

![app details](https://developers.reddit.com/docs/assets/images/app-details-5-18520ba4b5e6e26fe6aa58b1a53820a2.png)

Safety[​](#safety "Direct link to Safety")
------------------------------------------

### Data privacy[​](#data-privacy "Direct link to Data privacy")

Each installation of an app has its own data storage. This means that the data used by the app cannot interact with or share data with other communities, or with other apps . If the app you are installing uses external web services, the app will come with a separate privacy agreement with the developer.

If you uninstall an app from a subreddit, your app history will be lost. Be sure you want to remove an app before clicking "uninstall," because you won't be able to retrieve the data or settings if you reinstall the app at a later date.

### App review[​](#app-review "Direct link to App review")

Admins review the source code and test functionality of every app made publicly available. Apps going through major updates or with greater security risk go through the review process for each new version.

### Reporting an app[​](#reporting-an-app "Direct link to Reporting an app")

If you believe an app is in violation of Reddit’s sitewide content policies, is creating issues, or otherwise having negative impacts to communities it’s installed in, please contact our team via r/modsupport.

# Text Fallback | Reddit for Developers
Text fallback lets you specify alternative text content for your interactive post, enabling:

*   **Old Reddit and third-party app support** - These platforms cannot render interactive posts
*   **Google (SEO) and Reddit Answers indexing** - Critical for discoverability and growth
*   **AutoModerator rule compatibility** - Allows mod rules to process your post content
*   **Reddit safety checks and filters** - Enables content moderation systems to work properly
*   **Custom post thumbnail** - Link to an image to generate a thumbnail

Text fallback uses Markdown formatting and allows for up to 40,000 characters.

[Reddit API](https://developers.reddit.com/docs/capabilities/server/reddit-api)
[​](#reddit-api "Direct link to reddit-api")
----------------------------------------------------------------------------------------------

The text fallback is only available when using the Reddit API to create a post.

devvit.json

```

{

  "permissions": {

    "reddit": true

  }

}

```


Use a text string[​](#use-a-text-string "Direct link to Use a text string")
---------------------------------------------------------------------------

```

import { reddit } from '@devvit/web/server';

const post = await reddit.submitCustomPost({

  title: 'Text String',

  subredditName: subreddit.name,

  textFallback: { text: 'You can read this text string on oldreddit because you used textFallback' },

  entry: 'default',

});

```


**Result**

![text string fallback](https://developers.reddit.com/docs/assets/images/fallback_text_string-f4e52032cce1040f1960ed54feaeb1ec.png)

Use a text string with markdown[​](#use-a-text-string-with-markdown "Direct link to Use a text string with markdown")
---------------------------------------------------------------------------------------------------------------------

```

import { reddit } from '@devvit/web/server';

const post = await reddit.submitCustomPost({

  title: 'Text string with markdown',

  subredditName: subreddit.name,

  textFallback: {

    text: 'You can read this _text string with markdown_ on oldreddit because you used **textFallback**',

  },

  entry: 'default',

});

```


**Result**

![text string fallback](https://developers.reddit.com/docs/assets/images/fallback_markdown-68bfc8395a9277428216ab2525b34364.png)

Use rich text[​](#use-rich-text "Direct link to Use rich text")
---------------------------------------------------------------

```

import { reddit } from '@devvit/web/server';

const textFallbackRichtext = new RichTextBuilder()

  .heading({ level: 1 }, (h) => {

    h.rawText('Yay for text fallbacks!');

  })

  .codeBlock({}, (cb) => cb.rawText('You can read this rich text on old.reddit because you used textFallback'));

const post = await reddit.submitCustomPost({

  title: 'Rich Text',

  subredditName: subreddit.name,

  textFallback: { richtext: textFallbackRichtext },

  entry: 'default',

});

```


**Result**

![text string fallback](https://developers.reddit.com/docs/assets/images/fallback_richtext-e9b7f09de05745742fc52c84fb05d4c5.png)

Update a post’s text fallback[​](#update-a-posts-text-fallback "Direct link to Update a post’s text fallback")
--------------------------------------------------------------------------------------------------------------

The post author can edit and update text fallback content after it’s been created. To do this, call post.setTextFallback with the desired fallback content.

```

import { reddit } from '@devvit/web/server';

// from a menu action, form, scheduler, trigger, custom post click event, etc

const newTextFallback = { text: 'This is an updated text fallback' };

const post = await reddit.getPostById(context.postId);

await post.setTextFallback(newTextFallback);

```
