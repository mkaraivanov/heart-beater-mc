/**
 * In-memory server state.
 * Mutated only by the /api/bpm handler.
 * Read by the SSE broadcaster and threshold engine.
 *
 * State is lost on server restart (known v1 limitation).
 * The watch continues POSTing and the next BPM POST re-establishes the session.
 */
export const state = {
  currentBpm: null as number | null,
  activeRuleId: null as string | null,
  sessionActive: false,
  lastBpmReceivedAt: null as Date | null,
  lastSwitchAt: null as Date | null,
};
