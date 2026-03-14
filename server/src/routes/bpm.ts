/**
 * BPM receiver endpoint.
 *
 * POST /api/bpm
 *   - Receives { hr: number, active: boolean } from the Garmin watch
 *   - MUST validate X-BPM-Key header against BPM_API_KEY env var
 *   - Delegates all state/threshold/SSE work to processBpm()
 *
 * This handler is intentionally a thin wrapper. The core logic lives in
 * src/bpm/processor.ts so it can be shared with the BLE reader (FR-24–FR-27).
 *
 * The X-BPM-Key check stays here — BLE mode bypasses HTTP entirely and runs
 * inside the trusted server process, so it needs no equivalent.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { state } from '../state';
import { processBpm } from '../bpm/processor';

const router = Router();

// POST /api/bpm — receive heart rate from Garmin watch
router.post('/', async (req: Request, res: Response) => {
  // Validate X-BPM-Key header (non-removable per architectural constraint)
  const bpmKey = req.headers['x-bpm-key'];
  const expectedKey = process.env.BPM_API_KEY;

  if (!expectedKey) {
    console.error('BPM_API_KEY is not configured in environment variables');
    res.status(500).json({ error: 'Server misconfigured: BPM_API_KEY not set' });
    return;
  }

  if (!bpmKey || bpmKey !== expectedKey) {
    res.status(401).json({ error: 'Unauthorized: invalid or missing X-BPM-Key' });
    return;
  }

  const { hr, active } = req.body as { hr?: unknown; active?: unknown };

  if (typeof active !== 'boolean') {
    res.status(400).json({ error: 'active must be a boolean' });
    return;
  }

  // Session end — hr is not required when active is false
  if (!active) {
    await processBpm(0, false);
    res.json({ ok: true, message: 'Session ended' });
    return;
  }

  // Active session — validate hr
  if (typeof hr !== 'number' || hr < 0 || hr > 300) {
    res.status(400).json({ error: 'hr must be a number between 0 and 300' });
    return;
  }

  await processBpm(hr, true);

  res.json({ ok: true, bpm: hr, activeRuleId: state.activeRuleId });
});

export default router;
