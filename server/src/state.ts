/**
 * In-memory server state.
 * Mutated only by the /api/bpm handler.
 * Read by the SSE broadcaster and threshold engine.
 *
 * State is lost on server restart (known v1 limitation).
 * The watch continues POSTing and the next BPM POST re-establishes the session.
 */

export interface AppState {
  currentBpm: number | null;
  activeRuleId: string | null;
  sessionActive: boolean;
  lastBpmReceivedAt: Date | null;
  lastSwitchAt: Date | null;
}

export const state: AppState = {
  currentBpm: null,
  activeRuleId: null,
  sessionActive: false,
  lastBpmReceivedAt: null,
  lastSwitchAt: null,
};

export function resetState(): void {
  state.currentBpm = null;
  state.activeRuleId = null;
  state.sessionActive = false;
  state.lastBpmReceivedAt = null;
  state.lastSwitchAt = null;
}
