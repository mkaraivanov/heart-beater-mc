/**
 * Spotify proxy routes.
 *
 * GET /api/spotify/search?q=<query>&type=<types>&limit=<n>
 *   - Proxies search to Spotify API (avoids browser CORS issues)
 *
 * GET /api/spotify/status
 *   - Returns whether Spotify is authenticated
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  searchSpotify,
  isSpotifyAuthenticated,
} from '../spotify/client';

const router = Router();

// GET /api/spotify/search — proxy Spotify search
router.get('/search', async (req: Request, res: Response) => {
  const { q, type = 'track,playlist', limit } = req.query as {
    q?: string;
    type?: string;
    limit?: string;
  };

  if (!q || q.trim() === '') {
    res.status(400).json({ error: 'Query parameter "q" is required' });
    return;
  }

  const limitNum = limit ? parseInt(limit, 10) : 10;
  if (isNaN(limitNum) || limitNum < 1 || limitNum > 50) {
    res.status(400).json({ error: 'limit must be a number between 1 and 50' });
    return;
  }

  try {
    const results = await searchSpotify(q, type, limitNum);
    res.json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('not authenticated')) {
      res.status(401).json({
        error: 'Spotify not authenticated. Visit /auth/spotify/login first.',
      });
      return;
    }
    console.error('Spotify search error:', err);
    res.status(500).json({ error: 'Spotify search failed' });
  }
});

// GET /api/spotify/status — check authentication status
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const authenticated = await isSpotifyAuthenticated();
    res.json({
      authenticated,
      loginUrl: authenticated ? null : '/auth/spotify/login',
    });
  } catch (err) {
    console.error('Spotify status error:', err);
    res.status(500).json({ error: 'Failed to check Spotify status' });
  }
});

export default router;
