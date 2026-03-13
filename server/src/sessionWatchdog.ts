/**
 * Session watchdog.
 *
 * Monitors BPM liveness during an active session. If no BPM POST arrives
 * within WATCHDOG_TIMEOUT_MS of the last update, the watchdog auto-ends the
 * session: resets in-memory state and broadcasts a `session-end` SSE event.
 *
 * This handles the case where the Garmin watch crashes, the ngrok tunnel
 * drops, or makeWebRequest failures exhaust all retries — scenarios where
 * the watch never sends `active: false`, so the server would otherwise stay
 * stuck with sessionActive=true indefinitely.
 *
 * The watchdog is started (or reset) on every successful BPM POST and stopped
 * explicitly when the watch sends a clean session-end (active: false).
 */

import { state } from './state';
import { broadcast } from './sse/broadcaster';

/**
 * How long without a BPM POST before the watchdog fires and auto-ends the
 * session. The CIQ app posts every 5 seconds; 60 seconds is 12 missed posts,
 * which gives the exponential backoff logic enough room to retry before the
 * watchdog trips.
 */
export const WATCHDOG_TIMEOUT_MS = 60_000;

let watchdogTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Start (or reset) the watchdog timer. Called on every active BPM POST.
 * If the timer fires, it means no BPM has arrived for WATCHDOG_TIMEOUT_MS
 * and the session is auto-terminated.
 */
export function resetWatchdog(): void {
  clearWatchdog();

  watchdogTimer = setTimeout(() => {
    if (!state.sessionActive) return; // already ended cleanly

    console.warn(
      `[watchdog] No BPM received for ${WATCHDOG_TIMEOUT_MS / 1000}s — auto-ending session`
    );

    state.sessionActive = false;
    state.currentBpm = null;
    state.activeRuleId = null;

    broadcast('session-end', { active: false, reason: 'watchdog_timeout' });
  }, WATCHDOG_TIMEOUT_MS);
}

/**
 * Stop the watchdog. Called when the watch sends a clean session-end
 * (active: false), so we don't fire a redundant auto-end after the fact.
 */
export function clearWatchdog(): void {
  if (watchdogTimer !== null) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
}

/**
 * Returns true if the watchdog timer is currently running.
 * Used in tests to verify timer lifecycle.
 */
export function isWatchdogActive(): boolean {
  return watchdogTimer !== null;
}
