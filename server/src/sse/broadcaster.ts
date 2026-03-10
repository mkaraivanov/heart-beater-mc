/**
 * SSE broadcaster.
 *
 * Maintains a Set of active SSE Response objects.
 * The dashboard is purely observational — the BPM→Spotify pipeline
 * works without any browser tab open.
 */

import type { Response } from 'express';

const clients = new Set<Response>();

/**
 * Register a new SSE client connection.
 */
export function addClient(res: Response): void {
  clients.add(res);
}

/**
 * Remove a disconnected SSE client.
 */
export function removeClient(res: Response): void {
  clients.delete(res);
}

/**
 * Push an SSE event to all connected dashboard tabs.
 *
 * @param event - The event name (e.g. "bpm-update", "rule-change")
 * @param data - The data payload (will be JSON-serialized)
 */
export function broadcast(event: string, data: unknown): void {
  if (clients.size === 0) return;

  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  for (const client of clients) {
    try {
      client.write(message);
    } catch (err) {
      // Client disconnected — remove it
      clients.delete(client);
    }
  }
}

/**
 * Get the current count of connected SSE clients.
 */
export function getClientCount(): number {
  return clients.size;
}
