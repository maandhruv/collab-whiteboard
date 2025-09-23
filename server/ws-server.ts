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

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ok');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const roomName = (req.url || '/').slice(1) || 'default';
  const room = getRoom(roomName);
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