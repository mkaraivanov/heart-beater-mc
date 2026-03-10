/**
 * Spotify OAuth routes.
 *
 * GET /auth/spotify/login    - redirects user to Spotify authorization page
 * GET /auth/spotify/callback - exchanges authorization code for tokens
 *
 * Uses standard Authorization Code flow with client_secret (NOT PKCE).
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { exchangeCodeForTokens } from '../spotify/client';

const router = Router();

const SPOTIFY_AUTH_BASE = 'https://accounts.spotify.com/authorize';
const SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
].join(' ');

// GET /auth/spotify/login — initiate Authorization Code OAuth flow
router.get('/spotify/login', (req: Request, res: Response) => {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    res.status(500).json({
      error:
        'SPOTIFY_CLIENT_ID and SPOTIFY_REDIRECT_URI must be configured in environment variables',
    });
    return;
  }

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES,
    // state could be added for CSRF protection in production
  });

  res.redirect(`${SPOTIFY_AUTH_BASE}?${params.toString()}`);
});

// GET /auth/spotify/callback — exchange authorization code for tokens
router.get('/spotify/callback', async (req: Request, res: Response) => {
  const { code, error } = req.query as { code?: string; error?: string };

  if (error) {
    console.error('Spotify OAuth error:', error);
    res.status(400).json({ error: `Spotify authorization denied: ${error}` });
    return;
  }

  if (!code) {
    res.status(400).json({ error: 'Missing authorization code' });
    return;
  }

  try {
    await exchangeCodeForTokens(code);
    // Redirect to the dashboard after successful authentication
    res.redirect('/');
  } catch (err) {
    console.error('Token exchange error:', err);
    res.status(500).json({ error: 'Failed to exchange authorization code for tokens' });
  }
});

export default router;
