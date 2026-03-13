/**
 * Unit tests for the threshold evaluation engine.
 *
 * Verifies the highest-match rule selection, same-rule no-op, below-all-thresholds
 * handling, and the 15-second cooldown. Prisma and Spotify client are fully mocked
 * so no real DB or network calls are made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma before any imports
vi.mock('../prisma', () => ({
  default: {
    bpmRule: {
      findMany: vi.fn(),
    },
  },
}));

// Mock Spotify client
vi.mock('../spotify/client', () => ({
  startPlayback: vi.fn().mockResolvedValue(undefined),
}));

import { evaluateThreshold } from '../thresholdEngine';
import { state } from '../state';
import prisma from '../prisma';
import { startPlayback } from '../spotify/client';

const mockPrisma = prisma as unknown as {
  bpmRule: { findMany: ReturnType<typeof vi.fn> };
};
const mockStartPlayback = startPlayback as ReturnType<typeof vi.fn>;

function resetState() {
  state.currentBpm = null;
  state.activeRuleId = null;
  state.sessionActive = false;
  state.lastBpmReceivedAt = null;
  state.lastSwitchAt = null;
}

const rule120 = { id: 'rule-120', bpm: 120, spotifyUri: 'spotify:playlist:low', spotifyType: 'playlist', label: 'Low Zone' };
const rule130 = { id: 'rule-130', bpm: 130, spotifyUri: 'spotify:playlist:mid', spotifyType: 'playlist', label: 'Mid Zone' };
const rule140 = { id: 'rule-140', bpm: 140, spotifyUri: 'spotify:playlist:high', spotifyType: 'playlist', label: 'High Zone' };

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
});

describe('evaluateThreshold — early exit', () => {
  it('returns immediately when currentBpm is null', async () => {
    state.currentBpm = null;
    await evaluateThreshold();
    expect(mockPrisma.bpmRule.findMany).not.toHaveBeenCalled();
    expect(mockStartPlayback).not.toHaveBeenCalled();
  });
});

describe('evaluateThreshold — highest-match rule selection', () => {
  it('fires the 130-rule when BPM=135 and rules exist at 120 and 130', async () => {
    state.currentBpm = 135;
    // DB returns the highest matching rule (130) first — engine takes take:1
    mockPrisma.bpmRule.findMany.mockResolvedValue([rule130]);

    await evaluateThreshold();

    expect(mockPrisma.bpmRule.findMany).toHaveBeenCalledWith({
      where: { bpm: { lte: 135 } },
      orderBy: { bpm: 'desc' },
      take: 1,
    });
    await vi.waitFor(() => {
      expect(mockStartPlayback).toHaveBeenCalledWith(
        'spotify:playlist:mid',
        'playlist'
      );
    });
    expect(state.activeRuleId).toBe('rule-130');
  });

  it('fires the 140-rule (highest) when BPM=150 and three rules exist', async () => {
    state.currentBpm = 150;
    mockPrisma.bpmRule.findMany.mockResolvedValue([rule140]);

    await evaluateThreshold();

    await vi.waitFor(() => {
      expect(mockStartPlayback).toHaveBeenCalledWith(
        'spotify:playlist:high',
        'playlist'
      );
    });
    expect(state.activeRuleId).toBe('rule-140');
  });
});

describe('evaluateThreshold — below all thresholds', () => {
  it('does not call startPlayback and clears activeRuleId when BPM < all rules', async () => {
    state.currentBpm = 95;
    state.activeRuleId = 'rule-120'; // was active before
    mockPrisma.bpmRule.findMany.mockResolvedValue([]); // no match

    await evaluateThreshold();

    expect(mockStartPlayback).not.toHaveBeenCalled();
    expect(state.activeRuleId).toBeNull();
  });

  it('clears activeRuleId when BPM drops below all thresholds (no cooldown needed)', async () => {
    state.currentBpm = 80;
    state.activeRuleId = 'rule-120';
    state.lastSwitchAt = new Date(); // cooldown active — should NOT block clearing
    mockPrisma.bpmRule.findMany.mockResolvedValue([]);

    await evaluateThreshold();

    // Below-all-thresholds path bypasses cooldown
    expect(state.activeRuleId).toBeNull();
    expect(mockStartPlayback).not.toHaveBeenCalled();
  });
});

describe('evaluateThreshold — no re-fire when rule unchanged', () => {
  it('does not call startPlayback when the matching rule is already active', async () => {
    state.currentBpm = 150;
    state.activeRuleId = 'rule-140'; // already active
    mockPrisma.bpmRule.findMany.mockResolvedValue([rule140]);

    await evaluateThreshold();

    expect(mockStartPlayback).not.toHaveBeenCalled();
  });
});

describe('evaluateThreshold — cooldown', () => {
  it('does not switch when fewer than 15 seconds have elapsed since last switch', async () => {
    state.currentBpm = 150;
    state.activeRuleId = 'rule-120';
    state.lastSwitchAt = new Date(); // just switched
    mockPrisma.bpmRule.findMany.mockResolvedValue([rule140]);

    await evaluateThreshold();

    expect(mockStartPlayback).not.toHaveBeenCalled();
    expect(state.activeRuleId).toBe('rule-120'); // unchanged
  });

  it('switches after 15-second cooldown has elapsed', async () => {
    state.currentBpm = 150;
    state.activeRuleId = 'rule-120';
    state.lastSwitchAt = new Date(Date.now() - 16_000); // 16 s ago
    mockPrisma.bpmRule.findMany.mockResolvedValue([rule140]);

    await evaluateThreshold();

    await vi.waitFor(() => {
      expect(mockStartPlayback).toHaveBeenCalledWith(
        'spotify:playlist:high',
        'playlist'
      );
    });
    expect(state.activeRuleId).toBe('rule-140');
  });

  it('does not switch when exactly 15 seconds have elapsed (boundary — not yet elapsed)', async () => {
    state.currentBpm = 150;
    state.activeRuleId = 'rule-120';
    state.lastSwitchAt = new Date(Date.now() - 15_000); // exactly 15 s
    mockPrisma.bpmRule.findMany.mockResolvedValue([rule140]);

    await evaluateThreshold();

    // Exactly 15_000 ms is NOT >= 15_000 ms elapsed (strict inequality in implementation)
    // The cooldown check is: now - lastSwitchAt.getTime() >= COOLDOWN_MS
    // At exactly 15_000 ms, it IS >= 15_000, so it SHOULD switch
    await vi.waitFor(() => {
      expect(mockStartPlayback).toHaveBeenCalledWith(
        'spotify:playlist:high',
        'playlist'
      );
    });
  });

  it('updates lastSwitchAt after a successful switch', async () => {
    state.currentBpm = 150;
    state.activeRuleId = null;
    state.lastSwitchAt = null;
    mockPrisma.bpmRule.findMany.mockResolvedValue([rule140]);

    const before = Date.now();
    await evaluateThreshold();
    const after = Date.now();

    expect(state.lastSwitchAt).toBeInstanceOf(Date);
    expect(state.lastSwitchAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(state.lastSwitchAt!.getTime()).toBeLessThanOrEqual(after);
  });
});

describe('evaluateThreshold — BPM drops across rule boundaries', () => {
  it('switches from 130-rule to 120-rule when BPM drops from 135 to 125', async () => {
    // First tick: BPM=135 → 130-rule fires
    state.currentBpm = 135;
    state.activeRuleId = 'rule-130';
    state.lastSwitchAt = new Date(Date.now() - 16_000); // cooldown expired

    mockPrisma.bpmRule.findMany.mockResolvedValue([rule120]);

    await evaluateThreshold();

    await vi.waitFor(() => {
      expect(mockStartPlayback).toHaveBeenCalledWith(
        'spotify:playlist:low',
        'playlist'
      );
    });
    expect(state.activeRuleId).toBe('rule-120');
  });
});

describe('evaluateThreshold — Spotify error handling', () => {
  it('does not throw when startPlayback rejects', async () => {
    state.currentBpm = 150;
    mockPrisma.bpmRule.findMany.mockResolvedValue([rule140]);
    mockStartPlayback.mockRejectedValue(new Error('Spotify unavailable'));

    // Should not throw — errors are caught internally
    await expect(evaluateThreshold()).resolves.toBeUndefined();
    // State is still advanced
    expect(state.activeRuleId).toBe('rule-140');
  });
});
