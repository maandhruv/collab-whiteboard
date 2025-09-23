import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

export function connectY(roomId: string, code?: string) {
  const doc = new Y.Doc();
  const url = (process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:1234').replace(/\/+$/,'');
  // If code present, append as path segment, else simple roomId
  const roomName = code ? `${roomId}/${code}` : roomId;
  const provider = new WebsocketProvider(url, roomName, doc, { connect: true });
  const awareness = provider.awareness;
  return { doc, provider, awareness };
}