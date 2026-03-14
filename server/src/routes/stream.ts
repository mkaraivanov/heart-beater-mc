/**
 * SSE endpoint for live dashboard updates.
 *
 * GET /api/stream
 *   - Establishes an SSE connection
 *   - Sends current state immediately on connect
 *   - Receives pushed updates via the broadcaster module
 *
 * The dashboard is purely observational — the BPM→Spotify pipeline
 * works without any browser tab open.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { addClient, removeClient } from '../sse/broadcaster';
import { state } from '../state';

const router = Router();

// GET /api/stream — SSE endpoint
router.get('/', (req: Request, res: Response) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering if behind proxy
  res.flushHeaders();

  // Register this client
  addClient(res);

  // Send current state immediately on connect
  const initialEvent = `event: connected\ndata: ${JSON.stringify({
    bpm: state.currentBpm,
    activeRuleId: state.activeRuleId,
    sessionActive: state.sessionActive,
    lastBpmReceivedAt: state.lastBpmReceivedAt?.toISOString() ?? null,
    bpmSource: state.bpmSource,
  })}\n\n`;
  res.write(initialEvent);

  // Heartbeat to keep connection alive (every 30 seconds)
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 30_000);

  // Clean up on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(res);
  });
});

export default router;
