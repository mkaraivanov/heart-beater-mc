/**
 * In-memory server state.
 * Mutated only by processBpm() (called from the /api/bpm handler or the BLE reader).
 * Read by the SSE broadcaster and threshold engine.
 *
 * State is lost on server restart (known v1 limitation).
 * The watch continues POSTing and the next BPM reading re-establishes the session.
 */

export type BpmSource = 'garmin' | 'ble';

export interface AppState {
  currentBpm: number | null;
  activeRuleId: string | null;
  sessionActive: boolean;
  lastBpmReceivedAt: Date | null;
  lastSwitchAt: Date | null;
  /** Which input source is actively supplying BPM data (FR-28). */
  bpmSource: BpmSource;
}

export const state: AppState = {
  currentBpm: null,
  activeRuleId: null,
  sessionActive: false,
  lastBpmReceivedAt: null,
  lastSwitchAt: null,
  bpmSource: (process.env['BPM_SOURCE'] as BpmSource | undefined) === 'ble' ? 'ble' : 'garmin',
};

export function resetState(): void {
  state.currentBpm = null;
  state.activeRuleId = null;
  state.sessionActive = false;
  state.lastBpmReceivedAt = null;
  state.lastSwitchAt = null;
  // bpmSource is set from env var on startup — do not reset it here
}
