/**
 * BPM receiver endpoint.
 *
 * POST /api/bpm
 *   - Receives { hr: number, active: boolean } from the Garmin watch
 *   - MUST validate X-BPM-Key header against BPM_API_KEY env var
 *   - Updates in-memory state
 *   - Evaluates threshold rules and triggers Spotify if needed
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { state } from '../state';
import { broadcast } from '../sse/broadcaster';
import prisma from '../prisma';
import { startPlayback } from '../spotify/client';

const router = Router();

const COOLDOWN_MS = 15 * 1000; // 15-second cooldown between Spotify switches

// POST /api/bpm — receive heart rate from Garmin watch
router.post('/', async (req: Request, res: Response) => {
  // Validate X-BPM-Key header
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

  // Session end
  if (!active) {
    state.sessionActive = false;
    state.currentBpm = null;
    state.activeRuleId = null;
    state.lastBpmReceivedAt = new Date();

    broadcast('session-end', { active: false });
    res.json({ ok: true, message: 'Session ended' });
    return;
  }

  // Active session — validate hr
  if (typeof hr !== 'number' || hr < 0 || hr > 300) {
    res.status(400).json({ error: 'hr must be a number between 0 and 300' });
    return;
  }

  // Update state
  state.sessionActive = true;
  state.currentBpm = hr;
  state.lastBpmReceivedAt = new Date();

  // Threshold engine: find highest rule where rule.bpm <= currentBpm
  let matchedRule: { id: string; bpm: number; spotifyUri: string; spotifyType: string; label: string } | null = null;

  try {
    const rules = await prisma.bpmRule.findMany({
      where: { bpm: { lte: hr } },
      orderBy: { bpm: 'desc' },
      take: 1,
    });

    matchedRule = rules[0] ?? null;
  } catch (err) {
    console.error('Error fetching rules:', err);
    // Don't fail the request — just skip Spotify switching
    broadcast('bpm-update', {
      bpm: hr,
      activeRuleId: state.activeRuleId,
      sessionActive: true,
    });
    res.json({ ok: true, bpm: hr });
    return;
  }

  const newRuleId = matchedRule?.id ?? null;
  const ruleChanged = newRuleId !== state.activeRuleId;

  // Check cooldown before switching
  const now = Date.now();
  const cooldownElapsed =
    !state.lastSwitchAt ||
    now - state.lastSwitchAt.getTime() >= COOLDOWN_MS;

  if (ruleChanged && cooldownElapsed) {
    state.activeRuleId = newRuleId;
    state.lastSwitchAt = new Date();

    if (matchedRule) {
      // Trigger Spotify playback asynchronously (don't block the BPM response)
      startPlayback(matchedRule.spotifyUri, matchedRule.spotifyType).catch(
        (err) => console.error('Spotify playback error:', err)
      );
    }
    // Below all thresholds (matchedRule === null): do NOT pause Spotify
  }

  broadcast('bpm-update', {
    bpm: hr,
    activeRuleId: state.activeRuleId,
    activeRuleLabel: matchedRule?.label ?? null,
    sessionActive: true,
  });

  res.json({ ok: true, bpm: hr, activeRuleId: state.activeRuleId });
});

export default router;
