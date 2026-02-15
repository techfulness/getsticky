/**
 * HTTP-based notification client.
 *
 * Sends POST requests to the WebSocket server's /notify endpoint
 * so that MCP mutations are broadcast to connected frontends.
 *
 * Fire-and-forget with a 5s timeout — silently fails if the
 * WS server isn't running (the frontend will pick up changes
 * from the DB on next connect).
 */

import type { NotificationPayload, NotificationChannel } from './types.js';

export class HttpNotificationClient implements NotificationChannel {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl || 'http://localhost:8080').replace(/\/$/, '');
  }

  async publish(payload: NotificationPayload): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Silently ignore — WS server may not be running
    }
  }

  async close(): Promise<void> {
    // Nothing to clean up for HTTP
  }
}
