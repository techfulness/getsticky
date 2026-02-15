/**
 * Notification abstractions for cross-process real-time updates.
 *
 * The `NotificationChannel` interface is the swap point for future
 * Redis/NATS implementations — replace `HttpNotificationClient`
 * with a Redis-backed channel and multiple WS server instances
 * all receive broadcasts.
 */

export interface NotificationPayload {
  event: string;   // 'node_created', 'node_updated', etc.
  data: any;       // The mutation payload
  boardId: string; // Which board was affected
}

export interface NotificationChannel {
  publish(payload: NotificationPayload): Promise<void>;
  close(): Promise<void>;
}
