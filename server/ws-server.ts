import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
// Ensure env loaded even when launched via tsx from server directory
try { dotenv.config({ path: path.resolve(process.cwd(), '.env') }); } catch {}
// Normalize CWD to project root (one level up from server directory) if currently in server/
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const parent = path.dirname(__dirname);
if (path.basename(__dirname) === 'server' && process.cwd() !== parent) {
  try { process.chdir(parent); } catch {}
}
import { prisma } from '../lib/prisma';
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
// Debug env for database
// eslint-disable-next-line no-console
console.log('[ws-server] DATABASE_URL =', process.env.DATABASE_URL);

type Room = {
  doc: Y.Doc;
  awareness: Awareness;
  conns: Map<WebSocket, Set<number>>; // ws -> clientIDs
};

const rooms = new Map<string, Room>();
// roomId -> access code (cached); authoritative value is DB
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
  const doc = new Y.Doc({ guid: name });
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
        const { preferredId, ownerId } = body ? JSON.parse(body) : {};
        const id = preferredId && !rooms.has(preferredId) ? preferredId : generateRoomId();
        const code = generateCode();
        roomCodes.set(id, code);
        getRoom(id); // create in-memory room
        const finalOwnerId = ownerId && typeof ownerId === 'string' ? ownerId : 'anonymous-placeholder';
        prisma.whiteboard.upsert({
          where: { roomId: id },
          update: { accessCode: code, ...(ownerId ? { ownerId: finalOwnerId } : {}), lastOpenedAt: new Date() },
          create: { roomId: id, accessCode: code, ownerId: finalOwnerId, lastOpenedAt: new Date() }
        }).catch((err: unknown) => console.error('Persist whiteboard failed', err));
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
    let stored = roomCodes.get(roomId);
    if (!stored) {
      // fetch from DB
  prisma.whiteboard.findUnique({ where: { roomId } }).then((w: any) => {
        if (w) roomCodes.set(roomId, w.accessCode);
      }).catch(()=>{});
      stored = roomCodes.get(roomId);
    }
    if (stored && stored === code) {
      prisma.whiteboard.update({ where: { roomId }, data: { lastOpenedAt: new Date() } }).catch(()=>{});
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
  let requiredCode = roomCodes.get(roomId);
  const ensureLoaded = async () => {
    if (!requiredCode) {
      try {
        const w = await prisma.whiteboard.findUnique({ where: { roomId } });
        if (w) {
          requiredCode = w.accessCode; roomCodes.set(roomId, w.accessCode);
        }
      } catch {}
    }
  };
  // Since this handler isn't async, we approximate sync fetch by kicking off and closing if still missing later.
  if (!requiredCode) {
    ensureLoaded().then(()=>{
      if (!roomCodes.get(roomId)) {
        try { ws.close(1008, 'room not found'); } catch {}
      }
    });
    // Temporarily wait minimal time? We'll proceed only if code now exists; otherwise return.
    if (!roomCodes.get(roomId)) return;
  }
  requiredCode = roomCodes.get(roomId);
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
  const wasEmpty = room.conns.size === 0; // capture before adding this socket
  room.conns.set(ws, new Set());

  if (wasEmpty) {
    prisma.snapshot.findFirst({ where: { whiteboard: { roomId } }, orderBy: { createdAt: 'desc' } })
      .then((snap: any) => {
        if (snap) {
          try { Y.applyUpdate(room.doc, new Uint8Array(snap.data as any)); } catch (e) { console.error('Apply snapshot failed', e); }
        }
      })
      .finally(() => {
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, 0);
        sync.writeSyncStep1(enc, room.doc);
        try { ws.send(encoding.toUint8Array(enc)); } catch {}
      });
  } else {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, 0);
    sync.writeSyncStep1(enc, room.doc);
    try { ws.send(encoding.toUint8Array(enc)); } catch {}
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

  // Update lastOpenedAt on each connection
  prisma.whiteboard.update({ where: { roomId }, data: { lastOpenedAt: new Date() } }).catch(()=>{});

  ws.on('close', () => {
    const ids = room.conns.get(ws);
    if (ids && ids.size) {
      removeAwarenessStates(room.awareness, Array.from(ids), ws);
    }
    room.conns.delete(ws);
  });
});

// Periodic snapshot saving (debounced per room)
const snapshotTimers = new Map<string, NodeJS.Timeout>();
function scheduleSnapshot(roomId: string, room: Room) {
  if (snapshotTimers.has(roomId)) return;
  const t = setTimeout(async () => {
    snapshotTimers.delete(roomId);
    try {
  const raw = Y.encodeStateAsUpdate(room.doc);
  const update = Buffer.from(raw);
  await prisma.snapshot.create({ data: { whiteboard: { connect: { roomId } }, data: update } });
      // Limit snapshots to last 20
      const many = await prisma.snapshot.findMany({ where: { whiteboard: { roomId } }, orderBy: { createdAt: 'desc' }, skip: 20 });
      if (many.length) {
  await prisma.snapshot.deleteMany({ where: { id: { in: many.map((s: any)=>s.id) } } });
      }
    } catch (e) { console.error('Save snapshot failed', e); }
  }, 5000);
  snapshotTimers.set(roomId, t);
}

// Hook into doc updates for snapshot scheduling
const origGetRoom = getRoom;
// Re-wrap getRoom to attach listener once per room creation
(function wrap() {
  // no-op placeholder to keep original reference already used
})();
// Instead attach after creation within getRoom already (modifying original would require code restructure). Simpler: monkey patch after rooms map additions.
// We'll add a lightweight interval to check newly created docs and attach listener.
const attached = new Set<string>();
setInterval(() => {
  for (const [id, r] of rooms.entries()) {
    if (attached.has(id)) continue;
    attached.add(id);
    r.doc.on('update', () => scheduleSnapshot(id, r));
  }
}, 2000);

server.listen(PORT, () => {
  console.log('Custom Yjs WebSocket server listening on :' + PORT);
});