/**
 * BPM rule CRUD endpoints.
 *
 * GET    /api/rules       - list all rules, ordered by bpm ASC
 * POST   /api/rules       - create a new rule
 * PUT    /api/rules/:id   - update an existing rule
 * DELETE /api/rules/:id   - delete a rule
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import prisma from '../prisma';

const router = Router();

// GET /api/rules — list all BPM rules ordered by BPM ascending
router.get('/', async (_req: Request, res: Response) => {
  try {
    const rules = await prisma.bpmRule.findMany({
      orderBy: { bpm: 'asc' },
    });
    res.json(rules);
  } catch (err) {
    console.error('GET /api/rules error:', err);
    res.status(500).json({ error: 'Failed to fetch rules' });
  }
});

// POST /api/rules — create a new rule
router.post('/', async (req: Request, res: Response) => {
  const { bpm, spotifyUri, spotifyType, label } = req.body as {
    bpm?: unknown;
    spotifyUri?: unknown;
    spotifyType?: unknown;
    label?: unknown;
  };

  if (
    typeof bpm !== 'number' ||
    typeof spotifyUri !== 'string' ||
    typeof spotifyType !== 'string' ||
    typeof label !== 'string'
  ) {
    res.status(400).json({
      error:
        'Missing or invalid fields. Required: bpm (number), spotifyUri (string), spotifyType (string), label (string)',
    });
    return;
  }

  const validTypes = ['playlist', 'track', 'album'];
  if (!validTypes.includes(spotifyType)) {
    res.status(400).json({
      error: `spotifyType must be one of: ${validTypes.join(', ')}`,
    });
    return;
  }

  try {
    const rule = await prisma.bpmRule.create({
      data: { bpm, spotifyUri, spotifyType, label },
    });
    res.status(201).json(rule);
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message.includes('Unique constraint failed')
    ) {
      res
        .status(409)
        .json({ error: `A rule at ${bpm} BPM already exists` });
      return;
    }
    console.error('POST /api/rules error:', err);
    res.status(500).json({ error: 'Failed to create rule' });
  }
});

// PUT /api/rules/:id — update an existing rule
router.put('/:id', async (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  const { bpm, spotifyUri, spotifyType, label } = req.body as {
    bpm?: unknown;
    spotifyUri?: unknown;
    spotifyType?: unknown;
    label?: unknown;
  };

  // Build partial update — only include fields that were provided
  const updateData: {
    bpm?: number;
    spotifyUri?: string;
    spotifyType?: string;
    label?: string;
  } = {};

  if (bpm !== undefined) {
    if (typeof bpm !== 'number') {
      res.status(400).json({ error: 'bpm must be a number' });
      return;
    }
    updateData.bpm = bpm;
  }

  if (spotifyUri !== undefined) {
    if (typeof spotifyUri !== 'string') {
      res.status(400).json({ error: 'spotifyUri must be a string' });
      return;
    }
    updateData.spotifyUri = spotifyUri;
  }

  if (spotifyType !== undefined) {
    const validTypes = ['playlist', 'track', 'album'];
    if (typeof spotifyType !== 'string' || !validTypes.includes(spotifyType)) {
      res.status(400).json({
        error: `spotifyType must be one of: ${validTypes.join(', ')}`,
      });
      return;
    }
    updateData.spotifyType = spotifyType;
  }

  if (label !== undefined) {
    if (typeof label !== 'string') {
      res.status(400).json({ error: 'label must be a string' });
      return;
    }
    updateData.label = label;
  }

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  try {
    const rule = await prisma.bpmRule.update({
      where: { id },
      data: updateData,
    });
    res.json(rule);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('Record to update not found')) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }
    if (
      err instanceof Error &&
      err.message.includes('Unique constraint failed')
    ) {
      res
        .status(409)
        .json({ error: `A rule at ${updateData.bpm} BPM already exists` });
      return;
    }
    console.error(`PUT /api/rules/${id} error:`, err);
    res.status(500).json({ error: 'Failed to update rule' });
  }
});

// DELETE /api/rules/:id — delete a rule
router.delete('/:id', async (req: Request, res: Response) => {
  const id = req.params['id'] as string;

  try {
    await prisma.bpmRule.delete({ where: { id } });
    res.status(204).send();
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('Record to delete does not exist')) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }
    console.error(`DELETE /api/rules/${id} error:`, err);
    res.status(500).json({ error: 'Failed to delete rule' });
  }
});

export default router;
