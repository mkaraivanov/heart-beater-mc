/**
 * Threshold evaluation engine.
 *
 * Determines which Spotify playlist/track to play based on the current BPM.
 * Called on every incoming BPM POST after state is updated.
 *
 * Rules:
 *   - Picks the HIGHEST rule where rule.bpm <= currentBpm (FR-14)
 *   - Does not re-trigger the same rule if BPM stays in the same band (FR-15)
 *   - Below all thresholds: clears activeRuleId, does NOT pause Spotify (FR-22)
 *   - Enforces a 15-second cooldown between Spotify switches (FR-23)
 */

import prisma from './prisma';
import { state } from './state';
import { startPlayback } from './spotify/client';

const COOLDOWN_MS = 15 * 1000;

export async function evaluateThreshold(): Promise<void> {
  const { currentBpm, activeRuleId, lastSwitchAt } = state;
  if (currentBpm === null) return;

  // Find the highest matching rule (bpm <= currentBpm)
  const rules = await prisma.bpmRule.findMany({
    where: { bpm: { lte: currentBpm } },
    orderBy: { bpm: 'desc' },
    take: 1,
  });
  const matchedRule = rules[0] ?? null;
  const newRuleId = matchedRule?.id ?? null;

  // No change if the same rule is already active
  if (newRuleId === activeRuleId) return;

  // Below all thresholds — clear active rule, do NOT pause Spotify (FR-22)
  if (matchedRule === null) {
    state.activeRuleId = null;
    return;
  }

  // Cooldown check — skip if < 15 seconds since last switch (FR-23)
  const now = Date.now();
  const cooldownElapsed =
    !lastSwitchAt || now - lastSwitchAt.getTime() >= COOLDOWN_MS;
  if (!cooldownElapsed) return;

  // Advance state before async Spotify call (prevents double-firing on next tick)
  state.activeRuleId = matchedRule.id;
  state.lastSwitchAt = new Date();

  // Trigger Spotify playback — fire-and-forget so we don't block the BPM response
  startPlayback(matchedRule.spotifyUri, matchedRule.spotifyType).catch((err) =>
    console.error('Spotify playback error:', err)
  );
}
