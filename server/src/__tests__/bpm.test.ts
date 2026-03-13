/**
 * Tests for POST /api/bpm endpoint.
 *
 * Verifies X-BPM-Key authentication, in-memory state updates,
 * threshold engine logic, and the 15-second cooldown.
 *
 * Uses vitest + supertest. Prisma, SSE broadcaster, and Spotify client are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import supertest from 'supertest';

// Set BPM_API_KEY env before any module imports
process.env['BPM_API_KEY'] = 'test-secret-key';

// Mock Prisma
vi.mock('../prisma', () => ({
  default: {
    bpmRule: {
      findMany: vi.fn(),
    },
  },
}));

// Mock SSE broadcaster so tests don't need live SSE connections
vi.mock('../sse/broadcaster', () => ({
  broadcast: vi.fn(),
}));

// Mock Spotify client so tests don't make real HTTP calls
vi.mock('../spotify/client', () => ({
  startPlayback: vi.fn().mockResolvedValue(undefined),
}));

import bpmRouter from '../routes/bpm';
import { state } from '../state';
import prisma from '../prisma';
import { startPlayback } from '../spotify/client';

const mockPrisma = prisma as unknown as {
  bpmRule: { findMany: ReturnType<typeof vi.fn> };
};
const mockStartPlayback = startPlayback as ReturnType<typeof vi.fn>;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/bpm', bpmRouter);
  return app;
}

function resetState() {
  state.currentBpm = null;
  state.activeRuleId = null;
  state.sessionActive = false;
  state.lastBpmReceivedAt = null;
  state.lastSwitchAt = null;
}

const VALID_KEY = 'test-secret-key';
const WRONG_KEY = 'wrong-key';

describe('POST /api/bpm — authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetState();
  });

  it('rejects requests with no X-BPM-Key header — returns 401', async () => {
    const res = await supertest(buildApp())
      .post('/api/bpm')
      .send({ hr: 145, active: true });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Unauthorized');
  });

  it('rejects requests with wrong X-BPM-Key — returns 401', async () => {
    const res = await supertest(buildApp())
      .post('/api/bpm')
      .set('x-bpm-key', WRONG_KEY)
      .send({ hr: 145, active: true });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Unauthorized');
  });

  it('accepts requests with correct X-BPM-Key — returns 200', async () => {
    mockPrisma.bpmRule.findMany.mockResolvedValue([]);

    const res = await supertest(buildApp())
      .post('/api/bpm')
      .set('x-bpm-key', VALID_KEY)
      .send({ hr: 80, active: true });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('POST /api/bpm — input validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetState();
  });

  it('rejects missing "active" field with 400', async () => {
    const res = await supertest(buildApp())
      .post('/api/bpm')
      .set('x-bpm-key', VALID_KEY)
      .send({ hr: 145 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('active');
  });

  it('rejects non-number hr with 400', async () => {
    const res = await supertest(buildApp())
      .post('/api/bpm')
      .set('x-bpm-key', VALID_KEY)
      .send({ hr: 'fast', active: true });

    expect(res.status).toBe(400);
  });

  it('rejects out-of-range hr (>300) with 400', async () => {
    const res = await supertest(buildApp())
      .post('/api/bpm')
      .set('x-bpm-key', VALID_KEY)
      .send({ hr: 999, active: true });

    expect(res.status).toBe(400);
  });

  it('rejects negative hr with 400', async () => {
    const res = await supertest(buildApp())
      .post('/api/bpm')
      .set('x-bpm-key', VALID_KEY)
      .send({ hr: -5, active: true });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/bpm — state updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetState();
  });

  it('sets currentBpm and sessionActive when active: true', async () => {
    mockPrisma.bpmRule.findMany.mockResolvedValue([]);

    await supertest(buildApp())
      .post('/api/bpm')
      .set('x-bpm-key', VALID_KEY)
      .send({ hr: 145, active: true });

    expect(state.currentBpm).toBe(145);
    expect(state.sessionActive).toBe(true);
    expect(state.lastBpmReceivedAt).toBeInstanceOf(Date);
  });

  it('clears currentBpm, sessionActive, and activeRuleId on session end (active: false)', async () => {
    state.currentBpm = 145;
    state.sessionActive = true;
    state.activeRuleId = 'rule-1';

    const res = await supertest(buildApp())
      .post('/api/bpm')
      .set('x-bpm-key', VALID_KEY)
      .send({ active: false });

    expect(res.status).toBe(200);
    expect(state.sessionActive).toBe(false);
    expect(state.currentBpm).toBeNull();
    expect(state.activeRuleId).toBeNull();
  });

  it('returns bpm and activeRuleId in the response body', async () => {
    mockPrisma.bpmRule.findMany.mockResolvedValue([]);

    const res = await supertest(buildApp())
      .post('/api/bpm')
      .set('x-bpm-key', VALID_KEY)
      .send({ hr: 120, active: true });

    expect(res.status).toBe(200);
    expect(res.body.bpm).toBe(120);
    expect(res.body).toHaveProperty('activeRuleId');
  });
});

describe('POST /api/bpm — threshold engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetState();
  });

  it('queries the highest rule at or below the current BPM', async () => {
    mockPrisma.bpmRule.findMany.mockResolvedValue([]);

    await supertest(buildApp())
      .post('/api/bpm')
      .set('x-bpm-key', VALID_KEY)
      .send({ hr: 150, active: true });

    expect(mockPrisma.bpmRule.findMany).toHaveBeenCalledWith({
      where: { bpm: { lte: 150 } },
      orderBy: { bpm: 'desc' },
      take: 1,
    });
  });

  it('sets activeRuleId and calls startPlayback when a rule matches', async () => {
    const matchingRule = {
      id: 'rule-140',
      bpm: 140,
      spotifyUri: 'spotify:playlist:abc',
      spotifyType: 'playlist',
      label: 'High Zone',
    };
    mockPrisma.bpmRule.findMany.mockResolvedValue([matchingRule]);

    await supertest(buildApp())
      .post('/api/bpm')
      .set('x-bpm-key', VALID_KEY)
      .send({ hr: 150, active: true });

    // Allow async startPlayback to fire
    await vi.waitFor(() => {
      expect(mockStartPlayback).toHaveBeenCalledWith(
        'spotify:playlist:abc',
        'playlist'
      );
    });
    expect(state.activeRuleId).toBe('rule-140');
  });

  it('does not call startPlayback when BPM is below all thresholds', async () => {
    mockPrisma.bpmRule.findMany.mockResolvedValue([]);

    await supertest(buildApp())
      .post('/api/bpm')
      .set('x-bpm-key', VALID_KEY)
      .send({ hr: 80, active: true });

    expect(mockStartPlayback).not.toHaveBeenCalled();
    expect(state.activeRuleId).toBeNull();
  });

  it('does not switch when the matching rule is already active', async () => {
    const rule = { id: 'rule-140', bpm: 140, spotifyUri: 'spotify:playlist:abc', spotifyType: 'playlist', label: 'High Zone' };
    mockPrisma.bpmRule.findMany.mockResolvedValue([rule]);

    // Pre-set activeRuleId to the same rule — no switch should happen
    state.activeRuleId = 'rule-140';

    await supertest(buildApp())
      .post('/api/bpm')
      .set('x-bpm-key', VALID_KEY)
      .send({ hr: 150, active: true });

    expect(mockStartPlayback).not.toHaveBeenCalled();
  });

  it('respects the 15-second cooldown — does not switch while cooldown is active', async () => {
    const newRule = { id: 'rule-140', bpm: 140, spotifyUri: 'spotify:playlist:abc', spotifyType: 'playlist', label: 'High Zone' };
    mockPrisma.bpmRule.findMany.mockResolvedValue([newRule]);

    // Simulate a switch that just happened (cooldown active)
    state.lastSwitchAt = new Date();
    state.activeRuleId = 'rule-120'; // previously active rule

    await supertest(buildApp())
      .post('/api/bpm')
      .set('x-bpm-key', VALID_KEY)
      .send({ hr: 150, active: true });

    expect(mockStartPlayback).not.toHaveBeenCalled();
    // activeRuleId must remain unchanged during cooldown
    expect(state.activeRuleId).toBe('rule-120');
  });

  it('switches after 15-second cooldown has elapsed', async () => {
    const newRule = { id: 'rule-140', bpm: 140, spotifyUri: 'spotify:playlist:abc', spotifyType: 'playlist', label: 'High Zone' };
    mockPrisma.bpmRule.findMany.mockResolvedValue([newRule]);

    // Simulate a switch that happened 16 seconds ago (cooldown expired)
    state.lastSwitchAt = new Date(Date.now() - 16_000);
    state.activeRuleId = 'rule-120';

    await supertest(buildApp())
      .post('/api/bpm')
      .set('x-bpm-key', VALID_KEY)
      .send({ hr: 150, active: true });

    await vi.waitFor(() => {
      expect(mockStartPlayback).toHaveBeenCalledWith('spotify:playlist:abc', 'playlist');
    });
    expect(state.activeRuleId).toBe('rule-140');
  });
});
