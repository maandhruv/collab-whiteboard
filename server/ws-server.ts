import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import * as sync from 'y-protocols/sync';
import {
  Awareness,
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
  removeAwarenessStates
} from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

const PORT = Number(process.env.PORT) || 1234;

type Room = {
  doc: Y.Doc;
  awareness: Awareness;
  conns: Map<WebSocket, Set<number>>; // ws -> clientIDs
};

const rooms = new Map<string, Room>();
// roomId -> access code
const roomCodes = new Map<string, string>();

function generateRoomId() {
  return Math.random().toString(36).slice(2, 10);
}
function generateCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function getRoom(name: string): Room {
  let room = rooms.get(name);
  if (!room) {
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    room = { doc, awareness, conns: new Map() };
    rooms.set(name, room);

    // Broadcast document updates
    doc.on('update', (update, origin) => {
      for (const ws of room!.conns.keys()) {
        if (ws === origin || ws.readyState !== WebSocket.OPEN) continue;
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, 0); // sync
        sync.writeUpdate(enc, update);
        ws.send(encoding.toUint8Array(enc));
      }
    });

    // Broadcast awareness changes
        interface AwarenessUpdatePayload {
          added: number[];
          updated: number[];
          removed: number[];
        }

        awareness.on(
          'update',
          (
            { added, updated, removed }: AwarenessUpdatePayload,
            origin: unknown
          ): void => {
            const changed: number[] = added.concat(updated, removed);
            if (!changed.length) return;
            const update: Uint8Array = encodeAwarenessUpdate(awareness, changed);
            for (const ws of room!.conns.keys() as Iterable<WebSocket>) {
              if (ws === origin || ws.readyState !== WebSocket.OPEN) continue;
              const enc = encoding.createEncoder();
              encoding.writeVarUint(enc, 1); // awareness
              encoding.writeVarUint8Array(enc, update);
              ws.send(encoding.toUint8Array(enc));
            }
            // Track which clientIDs belong to a socket
            if (origin instanceof WebSocket) {
              const set: Set<number> | undefined = room!.conns.get(origin);
              if (set) {
          added.forEach((id: number) => set.add(id));
          removed.forEach((id: number) => set.delete(id));
              }
            }
          }
        );
  }
  return room;
}

const server = http.createServer((req, res) => {
  // Simple CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (!req.url) { res.writeHead(404); res.end(); return; }
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'POST' && url.pathname === '/rooms') {
    // Create new room with code
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const { preferredId } = body ? JSON.parse(body) : {};
        const id = preferredId && !rooms.has(preferredId) ? preferredId : generateRoomId();
        const code = generateCode();
        roomCodes.set(id, code);
        // Pre-create room structure for quicker first connection
        getRoom(id);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ roomId: id, code }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid json' }));
      }
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/rooms/validate') {
    const roomId = url.searchParams.get('roomId') || '';
    const code = url.searchParams.get('code') || '';
    const stored = roomCodes.get(roomId);
    if (stored && stored === code) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } else {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'invalid' }));
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const rawUrl = req.url || '/';
  // Expected path: /roomId or /roomId/code or /roomId?code=XXX
  const tmp = new URL(rawUrl.startsWith('ws') ? rawUrl : `http://localhost:${PORT}${rawUrl}`);
  const pathname = tmp.pathname.replace(/^\//, '');
  let roomId = pathname;
  let providedCode = tmp.searchParams.get('code') || '';
  if (pathname.includes('/')) {
    const parts = pathname.split('/');
    roomId = parts[0];
    if (!providedCode && parts[1]) providedCode = parts[1];
  }
  const requiredCode = roomCodes.get(roomId);
  if (requiredCode) {
    if (providedCode !== requiredCode) {
      try { ws.close(1008, 'invalid code'); } catch {}
      return;
    }
  } else {
    // If room not registered yet, reject unless no code system used (enforce creation first)
    try { ws.close(1008, 'room not found'); } catch {}
    return;
  }
  const room = getRoom(roomId);
  room.conns.set(ws, new Set());

  // Send sync step1
  {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, 0);
    sync.writeSyncStep1(enc, room.doc);
    ws.send(encoding.toUint8Array(enc));
  }
  // Send full awareness snapshot
  {
    const ids = Array.from(room.awareness.getStates().keys());
    if (ids.length) {
      const aw = encodeAwarenessUpdate(room.awareness, ids);
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, 1);
      encoding.writeVarUint8Array(enc, aw);
      ws.send(encoding.toUint8Array(enc));
    }
  }

  ws.on('message', (data: Buffer) => {
    const dec = decoding.createDecoder(new Uint8Array(data));
    const type = decoding.readVarUint(dec);
    if (type === 0) {
      // sync
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, 0);
      sync.readSyncMessage(dec, enc, room.doc, ws);
      if (encoding.length(enc) > 1) ws.send(encoding.toUint8Array(enc));
    } else if (type === 1) {
      // awareness
      const update = decoding.readVarUint8Array(dec);
      applyAwarenessUpdate(room.awareness, update, ws);
    }
  });

  ws.on('close', () => {
    const ids = room.conns.get(ws);
    if (ids && ids.size) {
      removeAwarenessStates(room.awareness, Array.from(ids), ws);
    }
    room.conns.delete(ws);
  });
});

server.listen(PORT, () => {
  console.log('Custom Yjs WebSocket server listening on :' + PORT);
});