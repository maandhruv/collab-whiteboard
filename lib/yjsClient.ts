import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

export function connectY(roomId: string) {
  const doc = new Y.Doc();
  const url = (process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:1234').replace(/\/+$/,'');
  const provider = new WebsocketProvider(url, roomId, doc, { connect: true });
  const awareness = provider.awareness;
  return { doc, provider, awareness };
}