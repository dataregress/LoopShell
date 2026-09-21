import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import type { WireEvent, WireEventName } from '../../../contracts/schemas/events';

export const SUBPROTOCOL = 'json.reliable.webpubsub.azure.v1';

/**
 * Minimal Azure Web PubSub look-alike speaking the reliable JSON subprotocol
 * frames the Rust client (and the browser mock adapter) expect:
 *   client -> { type: 'joinGroup', group, ackId }      server -> { type: 'ack', ackId, success }
 *   server -> { type: 'message', from: 'group', group, dataType: 'json', data, sequenceId }
 *   client -> { type: 'sequenceAck', sequenceId }
 */
export class Realtime {
  private wss = new WebSocketServer({ noServer: true, handleProtocols: () => SUBPROTOCOL });
  private clients = new Set<WebSocket>();
  private sequenceId = 0;
  /** Recent frames for a naive replay on reconnect. */
  private history: { sequenceId: number; frame: string }[] = [];
  dropped = false;

  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    if (this.dropped) {
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.clients.add(ws);
      ws.on('message', (raw) => this.onMessage(ws, String(raw)));
      ws.on('close', () => this.clients.delete(ws));
      ws.on('error', () => this.clients.delete(ws));
    });
  }

  private onMessage(ws: WebSocket, text: string): void {
    let msg: { type?: string; ackId?: number; sequenceId?: number; group?: string };
    try {
      msg = JSON.parse(text) as typeof msg;
    } catch {
      return;
    }
    if (msg.type === 'joinGroup' || msg.type === 'leaveGroup') {
      ws.send(JSON.stringify({ type: 'ack', ackId: msg.ackId ?? 0, success: true }));
      if (msg.type === 'joinGroup') {
        // Replay anything the client may have missed while reconnecting.
        for (const h of this.history.slice(-50)) ws.send(h.frame);
      }
    }
    // sequenceAck: nothing to do in the mock.
  }

  publish(type: WireEventName, payload: unknown): WireEvent {
    const event: WireEvent = { eventId: randomUUID(), type, payload };
    this.sequenceId += 1;
    const frame = JSON.stringify({
      type: 'message',
      from: 'group',
      group: 'user:u-1001',
      dataType: 'json',
      data: event,
      sequenceId: this.sequenceId,
    });
    this.history.push({ sequenceId: this.sequenceId, frame });
    if (this.history.length > 200) this.history.shift();
    if (this.dropped) return event;
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(frame);
    }
    return event;
  }

  /** Simulate losing the connection: close every socket and refuse new ones. */
  setDropped(dropped: boolean): void {
    this.dropped = dropped;
    if (dropped) {
      for (const ws of this.clients) ws.close(1012, 'mock: realtime dropped');
      this.clients.clear();
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }
}
