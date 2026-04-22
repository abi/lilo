declare module "ws" {
  import type { IncomingMessage } from "node:http";
  import type { EventEmitter } from "node:events";
  import type { Duplex } from "node:stream";

  export class WebSocket extends EventEmitter {
    static readonly OPEN: number;
    static readonly CONNECTING: number;
    static readonly CLOSING: number;
    static readonly CLOSED: number;
    constructor(
      address: string | URL,
      protocols?: string | string[],
    );
    readyState: number;
    protocol: string;
    send(data: string | ArrayBuffer | Buffer): void;
    close(code?: number, reason?: string): void;
    on(event: "open", listener: () => void): this;
    on(
      event: "message",
      listener: (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => void,
    ): this;
    on(event: "close", listener: (code: number, reason: Buffer) => void): this;
    on(event: "error", listener: (error: Error) => void): this;
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options: { noServer?: boolean });
    handleUpgrade(
      request: IncomingMessage,
      socket: Duplex,
      head: Buffer,
      callback: (socket: WebSocket) => void,
    ): void;
    on(
      event: "connection",
      listener: (socket: WebSocket, request: IncomingMessage) => void,
    ): this;
  }
}
