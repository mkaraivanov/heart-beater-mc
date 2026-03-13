/**
 * Tests for /api/rules CRUD endpoints.
 *
 * Uses vitest + supertest. Prisma client is mocked so no real DB is needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import supertest from 'supertest';

// Mock Prisma before importing routes
vi.mock('../prisma', () => ({
  default: {
    bpmRule: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import rulesRouter from '../routes/rules';
import prisma from '../prisma';

const mockPrisma = prisma as unknown as {
  bpmRule: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/rules', rulesRouter);
  return app;
}

describe('GET /api/rules', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns rules ordered by bpm ASC', async () => {
    const mockRules = [
      {
        id: '1',
        bpm: 120,
        spotifyUri: 'spotify:playlist:abc',
        spotifyType: 'playlist',
        label: 'Zone 1',
        createdAt: new Date().toISOString(),
      },
      {
        id: '2',
        bpm: 150,
        spotifyUri: 'spotify:playlist:def',
        spotifyType: 'playlist',
        label: 'Zone 2',
        createdAt: new Date().toISOString(),
      },
    ];
    mockPrisma.bpmRule.findMany.mockResolvedValue(mockRules);

    const res = await supertest(buildApp()).get('/api/rules');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockRules);
    expect(mockPrisma.bpmRule.findMany).toHaveBeenCalledWith({
      orderBy: { bpm: 'asc' },
    });
  });

  it('returns empty array when no rules exist', async () => {
    mockPrisma.bpmRule.findMany.mockResolvedValue([]);

    const res = await supertest(buildApp()).get('/api/rules');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 500 on database error', async () => {
    mockPrisma.bpmRule.findMany.mockRejectedValue(new Error('DB error'));

    const res = await supertest(buildApp()).get('/api/rules');

    expect(res.status).toBe(500);
    expect(res.body.error).toContain('Failed to fetch rules');
  });
});

describe('POST /api/rules', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a rule with valid data and returns 201', async () => {
    const newRule = {
      id: 'abc123',
      bpm: 140,
      spotifyUri: 'spotify:playlist:xyz',
      spotifyType: 'playlist',
      label: 'High Intensity',
      createdAt: new Date().toISOString(),
    };
    mockPrisma.bpmRule.create.mockResolvedValue(newRule);

    const res = await supertest(buildApp())
      .post('/api/rules')
      .send({ bpm: 140, spotifyUri: 'spotify:playlist:xyz', spotifyType: 'playlist', label: 'High Intensity' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(newRule);
    expect(mockPrisma.bpmRule.create).toHaveBeenCalledWith({
      data: { bpm: 140, spotifyUri: 'spotify:playlist:xyz', spotifyType: 'playlist', label: 'High Intensity' },
    });
  });

  it('accepts spotifyType "track"', async () => {
    mockPrisma.bpmRule.create.mockResolvedValue({ id: '1', bpm: 160, spotifyUri: 'spotify:track:abc', spotifyType: 'track', label: 'Sprint', createdAt: new Date().toISOString() });

    const res = await supertest(buildApp())
      .post('/api/rules')
      .send({ bpm: 160, spotifyUri: 'spotify:track:abc', spotifyType: 'track', label: 'Sprint' });

    expect(res.status).toBe(201);
  });

  it('accepts spotifyType "album"', async () => {
    mockPrisma.bpmRule.create.mockResolvedValue({ id: '1', bpm: 160, spotifyUri: 'spotify:album:abc', spotifyType: 'album', label: 'Album Zone', createdAt: new Date().toISOString() });

    const res = await supertest(buildApp())
      .post('/api/rules')
      .send({ bpm: 160, spotifyUri: 'spotify:album:abc', spotifyType: 'album', label: 'Album Zone' });

    expect(res.status).toBe(201);
  });

  it('rejects missing bpm with 400', async () => {
    const res = await supertest(buildApp())
      .post('/api/rules')
      .send({ spotifyUri: 'spotify:playlist:xyz', spotifyType: 'playlist', label: 'Test' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing or invalid');
  });

  it('rejects non-number bpm with 400', async () => {
    const res = await supertest(buildApp())
      .post('/api/rules')
      .send({ bpm: 'fast', spotifyUri: 'spotify:playlist:xyz', spotifyType: 'playlist', label: 'Test' });

    expect(res.status).toBe(400);
  });

  it('rejects invalid spotifyType with 400', async () => {
    const res = await supertest(buildApp())
      .post('/api/rules')
      .send({ bpm: 140, spotifyUri: 'spotify:playlist:xyz', spotifyType: 'video', label: 'Test' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('spotifyType must be one of');
  });

  it('returns 409 when BPM already exists', async () => {
    mockPrisma.bpmRule.create.mockRejectedValue(
      new Error('Unique constraint failed on the fields: (`bpm`)')
    );

    const res = await supertest(buildApp())
      .post('/api/rules')
      .send({ bpm: 140, spotifyUri: 'spotify:playlist:xyz', spotifyType: 'playlist', label: 'Duplicate' });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already exists');
  });
});

describe('PUT /api/rules/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates a rule with partial fields', async () => {
    const updated = {
      id: 'rule-1',
      bpm: 145,
      spotifyUri: 'spotify:playlist:new',
      spotifyType: 'playlist',
      label: 'Updated Label',
      createdAt: new Date().toISOString(),
    };
    mockPrisma.bpmRule.update.mockResolvedValue(updated);

    const res = await supertest(buildApp())
      .put('/api/rules/rule-1')
      .send({ label: 'Updated Label' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updated);
    expect(mockPrisma.bpmRule.update).toHaveBeenCalledWith({
      where: { id: 'rule-1' },
      data: { label: 'Updated Label' },
    });
  });

  it('returns 400 when no fields are provided', async () => {
    const res = await supertest(buildApp())
      .put('/api/rules/rule-1')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('No fields to update');
  });

  it('returns 404 when rule not found', async () => {
    mockPrisma.bpmRule.update.mockRejectedValue(
      new Error('Record to update not found.')
    );

    const res = await supertest(buildApp())
      .put('/api/rules/nonexistent')
      .send({ label: 'New Label' });

    expect(res.status).toBe(404);
  });

  it('returns 400 when bpm is not a number', async () => {
    const res = await supertest(buildApp())
      .put('/api/rules/rule-1')
      .send({ bpm: 'fast' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when spotifyType is invalid', async () => {
    const res = await supertest(buildApp())
      .put('/api/rules/rule-1')
      .send({ spotifyType: 'podcast' });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/rules/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 204 on successful delete', async () => {
    mockPrisma.bpmRule.delete.mockResolvedValue({});

    const res = await supertest(buildApp()).delete('/api/rules/abc123');

    expect(res.status).toBe(204);
    expect(mockPrisma.bpmRule.delete).toHaveBeenCalledWith({ where: { id: 'abc123' } });
  });

  it('returns 404 when rule not found', async () => {
    mockPrisma.bpmRule.delete.mockRejectedValue(
      new Error('Record to delete does not exist.')
    );

    const res = await supertest(buildApp()).delete('/api/rules/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Rule not found');
  });

  it('returns 500 on unexpected database error', async () => {
    mockPrisma.bpmRule.delete.mockRejectedValue(new Error('Connection failed'));

    const res = await supertest(buildApp()).delete('/api/rules/some-id');

    expect(res.status).toBe(500);
  });
});
