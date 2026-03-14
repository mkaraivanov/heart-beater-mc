/**
 * BLE control endpoints.
 *
 * POST /api/ble/start  — start the BLE HR reader at runtime
 * POST /api/ble/stop   — stop the BLE HR reader at runtime
 *
 * These endpoints let the dashboard toggle the BPM source without needing to
 * restart the server or change env vars.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { state } from '../state';
import { broadcast } from '../sse/broadcaster';

const router = Router();

// POST /api/ble/start
router.post('/start', async (_req: Request, res: Response) => {
  if (state.bpmSource === 'ble') {
    res.json({ ok: true, bpmSource: 'ble' });
    return;
  }

  try {
    const { startBleHrReader } = await import('../ble/hrReader');
    await startBleHrReader();
    state.bpmSource = 'ble';
    broadcast('source-change', { bpmSource: 'ble' });
    res.json({ ok: true, bpmSource: 'ble' });
  } catch (err) {
    console.error('[ble] Failed to start BLE reader:', err);
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/ble/stop
router.post('/stop', async (_req: Request, res: Response) => {
  if (state.bpmSource !== 'ble') {
    res.json({ ok: true, bpmSource: 'garmin' });
    return;
  }

  try {
    const { stopBleHrReader } = await import('../ble/hrReader');
    stopBleHrReader();
    state.bpmSource = 'garmin';
    broadcast('source-change', { bpmSource: 'garmin' });
    res.json({ ok: true, bpmSource: 'garmin' });
  } catch (err) {
    console.error('[ble] Failed to stop BLE reader:', err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
