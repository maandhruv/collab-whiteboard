// types/y-websocket-utils.d.ts
declare module 'y-websocket/bin/utils.js' {
  import type { IncomingMessage } from 'http';
  import type { WebSocket } from 'ws';
  export function setupWSConnection(
    ws: WebSocket,
    req: IncomingMessage,
    opts?: { gc?: boolean; [k: string]: unknown }
  ): void;
}
