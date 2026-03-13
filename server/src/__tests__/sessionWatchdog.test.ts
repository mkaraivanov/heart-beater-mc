/**
 * Tests for the session watchdog.
 *
 * Verifies that the watchdog auto-ends sessions after WATCHDOG_TIMEOUT_MS with
 * no BPM activity, that it is cancelled on clean session-end, and that repeated
 * BPM POSTs keep resetting the timer.
 *
 * Uses vitest fake timers so we don't need to wait real seconds.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock SSE broadcaster so tests don't need live SSE connections
vi.mock('../sse/broadcaster', () => ({
  broadcast: vi.fn(),
}));

import {
  resetWatchdog,
  clearWatchdog,
  isWatchdogActive,
  WATCHDOG_TIMEOUT_MS,
} from '../sessionWatchdog';
import { state } from '../state';
import { broadcast } from '../sse/broadcaster';

const mockBroadcast = broadcast as ReturnType<typeof vi.fn>;

function resetState() {
  state.currentBpm = null;
  state.activeRuleId = null;
  state.sessionActive = false;
  state.lastBpmReceivedAt = null;
  state.lastSwitchAt = null;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  resetState();
  clearWatchdog(); // ensure clean state between tests
});

afterEach(() => {
  clearWatchdog();
  vi.useRealTimers();
});

describe('sessionWatchdog — timer lifecycle', () => {
  it('isWatchdogActive returns false before resetWatchdog is called', () => {
    expect(isWatchdogActive()).toBe(false);
  });

  it('isWatchdogActive returns true after resetWatchdog is called', () => {
    state.sessionActive = true;
    resetWatchdog();
    expect(isWatchdogActive()).toBe(true);
  });

  it('clearWatchdog stops the timer and isWatchdogActive returns false', () => {
    state.sessionActive = true;
    resetWatchdog();
    clearWatchdog();
    expect(isWatchdogActive()).toBe(false);
  });

  it('calling resetWatchdog twice keeps only one timer active', () => {
    state.sessionActive = true;
    resetWatchdog();
    resetWatchdog();
    expect(isWatchdogActive()).toBe(true);

    // Advance past one timeout — timer should not have fired early
    vi.advanceTimersByTime(WATCHDOG_TIMEOUT_MS - 1);
    expect(state.sessionActive).toBe(true); // not yet ended

    // Advance to the second timeout (the first was cancelled)
    vi.advanceTimersByTime(WATCHDOG_TIMEOUT_MS);
    expect(state.sessionActive).toBe(false); // now ended
  });
});

describe('sessionWatchdog — auto session-end on timeout', () => {
  it('fires session-end after WATCHDOG_TIMEOUT_MS with no BPM activity', () => {
    state.sessionActive = true;
    state.currentBpm = 145;
    state.activeRuleId = 'rule-140';

    resetWatchdog();

    // Just before timeout — nothing should have happened
    vi.advanceTimersByTime(WATCHDOG_TIMEOUT_MS - 1);
    expect(state.sessionActive).toBe(true);
    expect(mockBroadcast).not.toHaveBeenCalled();

    // At timeout — session should be auto-ended
    vi.advanceTimersByTime(1);
    expect(state.sessionActive).toBe(false);
    expect(state.currentBpm).toBeNull();
    expect(state.activeRuleId).toBeNull();
  });

  it('broadcasts session-end with watchdog_timeout reason when it fires', () => {
    state.sessionActive = true;
    resetWatchdog();

    vi.advanceTimersByTime(WATCHDOG_TIMEOUT_MS);

    expect(mockBroadcast).toHaveBeenCalledWith('session-end', {
      active: false,
      reason: 'watchdog_timeout',
    });
  });

  it('does not broadcast if session was already ended when watchdog fires', () => {
    state.sessionActive = true;
    resetWatchdog();

    // Session ends cleanly before watchdog fires
    state.sessionActive = false;

    vi.advanceTimersByTime(WATCHDOG_TIMEOUT_MS);

    expect(mockBroadcast).not.toHaveBeenCalled();
  });
});

describe('sessionWatchdog — timer is reset on each BPM POST', () => {
  it('does not fire if resetWatchdog is called again before timeout elapses', () => {
    state.sessionActive = true;
    resetWatchdog();

    // Simulate two BPM POSTs, each resetting the timer
    vi.advanceTimersByTime(WATCHDOG_TIMEOUT_MS - 1_000);
    resetWatchdog(); // second BPM POST resets the clock

    vi.advanceTimersByTime(WATCHDOG_TIMEOUT_MS - 1_000);
    resetWatchdog(); // third BPM POST resets the clock

    // Should still be active — last reset was recent
    expect(state.sessionActive).toBe(true);
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it('fires if enough time passes after the last reset', () => {
    state.sessionActive = true;
    resetWatchdog();

    // Reset a couple of times
    vi.advanceTimersByTime(5_000);
    resetWatchdog();
    vi.advanceTimersByTime(5_000);
    resetWatchdog();

    // Now go quiet for a full timeout
    vi.advanceTimersByTime(WATCHDOG_TIMEOUT_MS);
    expect(state.sessionActive).toBe(false);
  });
});

describe('sessionWatchdog — clearWatchdog prevents auto-end', () => {
  it('does not auto-end the session when clearWatchdog is called before timeout', () => {
    state.sessionActive = true;
    resetWatchdog();

    // Clean session-end comes in before watchdog fires
    clearWatchdog();

    vi.advanceTimersByTime(WATCHDOG_TIMEOUT_MS * 2);
    // Session was ended manually (by the caller) — watchdog should not interfere
    expect(mockBroadcast).not.toHaveBeenCalled();
  });
});
