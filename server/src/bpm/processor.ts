/**
 * Shared BPM processor.
 *
 * Encapsulates the session state update + threshold evaluation that must run
 * on every heart rate reading, regardless of whether the reading arrived via
 * the Garmin CIQ HTTP POST or the direct BLE reader.
 *
 * The /api/bpm route handler calls this after validating authentication.
 * The BLE reader calls this directly (it runs inside the trusted server process
 * and bypasses HTTP entirely — no X-BPM-Key check needed for BLE mode).
 */

import { state } from '../state';
import { broadcast } from '../sse/broadcaster';
import { evaluateThreshold } from '../thresholdEngine';
import { resetWatchdog, clearWatchdog } from '../sessionWatchdog';

/**
 * Process a single heart rate reading.
 *
 * @param hr     - Heart rate in BPM (ignored when active is false)
 * @param active - true = session active / reading valid; false = session ended
 */
export async function processBpm(hr: number, active: boolean): Promise<void> {
  // Session end
  if (!active) {
    clearWatchdog();

    state.sessionActive = false;
    state.currentBpm = null;
    state.activeRuleId = null;
    state.lastBpmReceivedAt = new Date();

    broadcast('session-end', { active: false });
    return;
  }

  // Active reading — update state
  state.sessionActive = true;
  state.currentBpm = hr;
  state.lastBpmReceivedAt = new Date();

  // Reset watchdog — if no further reading arrives within WATCHDOG_TIMEOUT_MS,
  // the session will be auto-ended (handles watch crash / network drop / BLE dropout)
  resetWatchdog();

  // Evaluate thresholds — updates state.activeRuleId and triggers Spotify if needed
  try {
    await evaluateThreshold();
  } catch (err) {
    console.error('Error evaluating threshold:', err);
    // Don't abort — BPM state is already updated
  }

  broadcast('bpm-update', {
    bpm: hr,
    activeRuleId: state.activeRuleId,
    sessionActive: true,
    bpmSource: state.bpmSource,
  });
}
