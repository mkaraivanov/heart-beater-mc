/**
 * Tests for the shared processBpm() function.
 *
 * Verifies that session state updates, watchdog management, threshold
 * evaluation, and SSE broadcasts work correctly when called directly
 * (as the BLE reader does) rather than via the HTTP handler.
 *
 * Prisma, SSE broadcaster, Spotify client, and session watchdog are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set env before any module imports
process.env['BPM_API_KEY'] = 'test-key';
process.env['BPM_SOURCE'] = 'garmin';

vi.mock('../prisma', () => ({
  default: {
    bpmRule: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../sse/broadcaster', () => ({
  broadcast: vi.fn(),
}));

vi.mock('../spotify/client', () => ({
  startPlayback: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../sessionWatchdog', () => ({
  resetWatchdog: vi.fn(),
  clearWatchdog: vi.fn(),
}));

import { processBpm } from '../bpm/processor';
import { state } from '../state';
import { broadcast } from '../sse/broadcaster';
import { resetWatchdog, clearWatchdog } from '../sessionWatchdog';
import prisma from '../prisma';
import { startPlayback } from '../spotify/client';

const mockPrisma = prisma as unknown as {
  bpmRule: { findMany: ReturnType<typeof vi.fn> };
};
const mockBroadcast = broadcast as ReturnType<typeof vi.fn>;
const mockResetWatchdog = resetWatchdog as ReturnType<typeof vi.fn>;
const mockClearWatchdog = clearWatchdog as ReturnType<typeof vi.fn>;
const mockStartPlayback = startPlayback as ReturnType<typeof vi.fn>;

function resetState() {
  state.currentBpm = null;
  state.activeRuleId = null;
  state.sessionActive = false;
  state.lastBpmReceivedAt = null;
  state.lastSwitchAt = null;
}

describe('processBpm — session end (active: false)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetState();
  });

  it('clears session state and broadcasts session-end', async () => {
    state.currentBpm = 140;
    state.sessionActive = true;
    state.activeRuleId = 'rule-1';

    await processBpm(0, false);

    expect(state.sessionActive).toBe(false);
    expect(state.currentBpm).toBeNull();
    expect(state.activeRuleId).toBeNull();
    expect(mockClearWatchdog).toHaveBeenCalled();
    expect(mockBroadcast).toHaveBeenCalledWith('session-end', { active: false });
  });

  it('does not call resetWatchdog when ending session', async () => {
    await processBpm(0, false);
    expect(mockResetWatchdog).not.toHaveBeenCalled();
  });
});

describe('processBpm — active reading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetState();
    mockPrisma.bpmRule.findMany.mockResolvedValue([]);
  });

  it('updates state and sets sessionActive true', async () => {
    await processBpm(130, true);

    expect(state.currentBpm).toBe(130);
    expect(state.sessionActive).toBe(true);
    expect(state.lastBpmReceivedAt).toBeInstanceOf(Date);
  });

  it('resets the watchdog on every active reading', async () => {
    await processBpm(120, true);
    expect(mockResetWatchdog).toHaveBeenCalledOnce();
  });

  it('broadcasts bpm-update with bpmSource in the payload', async () => {
    await processBpm(115, true);

    expect(mockBroadcast).toHaveBeenCalledWith(
      'bpm-update',
      expect.objectContaining({
        bpm: 115,
        sessionActive: true,
        bpmSource: state.bpmSource,
      })
    );
  });

  it('calls startPlayback when a rule matches and switches', async () => {
    const rule = {
      id: 'rule-120',
      bpm: 120,
      spotifyUri: 'spotify:playlist:xyz',
      spotifyType: 'playlist',
      label: 'Zone 3',
    };
    mockPrisma.bpmRule.findMany.mockResolvedValue([rule]);

    await processBpm(135, true);

    await vi.waitFor(() => {
      expect(mockStartPlayback).toHaveBeenCalledWith('spotify:playlist:xyz', 'playlist');
    });
    expect(state.activeRuleId).toBe('rule-120');
  });

  it('does not call startPlayback when BPM is below all rules', async () => {
    mockPrisma.bpmRule.findMany.mockResolvedValue([]);

    await processBpm(90, true);

    expect(mockStartPlayback).not.toHaveBeenCalled();
    expect(state.activeRuleId).toBeNull();
  });
});
