import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '../../dist/client');

const CONTENT_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

const CONTRACT_VERSION = 'resonance-field/v1';
const MAX_ACTIVE_NODES = 3;
const NODE_LIFESPAN_MS = 60_000;

let nodeIdCounter = 1;
let globalScore = 0;
let nodes = [];
let userActiveNodeIds = [];
let userActiveNodeCount = 0;

const fieldLayout = {
  dayKey: new Date().toISOString().slice(0, 10),
  seed: 42,
  templateId: 1,
  bounds: { x: 0, y: 0, w: 800, h: 600 },
  obstacles: [
    { x: 200, y: 400, w: 100, h: 20 },
    { x: 500, y: 300, w: 80, h: 60 },
  ],
  hazards: [
    { x: 300, y: 200, r: 40 },
    { x: 600, y: 450, r: 35 },
  ],
  sink: { x: 400, y: 520, r: 30 },
  spawnBand: { x: 0, y: 0, w: 800, h: 60 },
};

function buildSnapshot() {
  const now = Date.now();
  return {
    contractVersion: CONTRACT_VERSION,
    postId: 'e2e-test-post',
    subredditName: 'e2e-test-sub',
    username: 'e2e-test-user',
    phase: 'active',
    dailyResetAtUtc: now - (now % 86_400_000) + 86_400_000,
    globalScore,
    nodes: [...nodes],
    userActiveNodeIds: [...userActiveNodeIds],
    userActiveNodeCount,
    userMaxActiveNodes: MAX_ACTIVE_NODES,
    selectedTool: 'ATTRACTOR',
    fieldLayout,
  };
}

function jsonResponse(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

function handleApi(req, res, url) {
  const method = req.method;
  const pathname = url.pathname;

  if (method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end();
    return;
  }

  if (method === 'GET' && pathname === '/api/init') {
    jsonResponse(res, 200, {
      type: 'snapshot',
      contractVersion: CONTRACT_VERSION,
      snapshot: buildSnapshot(),
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/history') {
    jsonResponse(res, 200, { entries: [] });
    return;
  }

  if (method === 'POST' && pathname === '/api/node-deploy') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const now = Date.now();

        let removedNodeId = null;
        if (nodes.length >= MAX_ACTIVE_NODES) {
          const oldest = nodes.shift();
          removedNodeId = oldest ? oldest.id : null;
          userActiveNodeIds = userActiveNodeIds.filter((id) => id !== removedNodeId);
        }

        const node = {
          id: `node-${nodeIdCounter++}`,
          type: data.type || 'ATTRACTOR',
          x: data.x || 400,
          y: data.y || 300,
          ownerId: 'e2e-test-user',
          createdAt: now,
          expiresAt: now + NODE_LIFESPAN_MS,
        };

        nodes.push(node);
        userActiveNodeIds.push(node.id);
        userActiveNodeCount = userActiveNodeIds.length;

        jsonResponse(res, 200, {
          type: 'node_deployed',
          contractVersion: CONTRACT_VERSION,
          node,
          removedNodeId,
          snapshot: buildSnapshot(),
        });
      } catch {
        jsonResponse(res, 400, {
          type: 'error',
          contractVersion: CONTRACT_VERSION,
          message: 'Invalid JSON',
        });
      }
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/throughput') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const scoreDelta = data.count || 0;
        globalScore += scoreDelta;

        jsonResponse(res, 200, {
          type: 'throughput_accepted',
          contractVersion: CONTRACT_VERSION,
          scoreDelta,
          snapshot: buildSnapshot(),
        });
      } catch {
        jsonResponse(res, 400, {
          type: 'error',
          contractVersion: CONTRACT_VERSION,
          message: 'Invalid JSON',
        });
      }
    });
    return;
  }

  jsonResponse(res, 404, { type: 'error', contractVersion: CONTRACT_VERSION, message: 'Not found' });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url);
    return;
  }

  let filePath = path.join(DIST_DIR, url.pathname === '/' ? 'splash.html' : url.pathname);
  if (!path.extname(filePath)) {
    filePath += '.html';
  }
  serveStatic(res, filePath);
});

const PORT = 5678;
server.listen(PORT, () => {
  process.stdout.write(`E2E mock server running on http://localhost:${PORT}\n`);
});
