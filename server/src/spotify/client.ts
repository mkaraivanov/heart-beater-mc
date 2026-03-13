/**
 * Spotify Web API client.
 *
 * All Spotify API interactions go through this module.
 * Uses standard Authorization Code flow with client_secret (NOT PKCE).
 * Automatically refreshes tokens before every API call.
 * Handles 429 rate-limit responses with Retry-After header.
 *
 * Token refresh logic lives ONLY in this file.
 */

import prisma from '../prisma';

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

function getClientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set in environment variables'
    );
  }

  return { clientId, clientSecret };
}

/**
 * Exchange authorization code for access + refresh tokens.
 * Called once during the OAuth callback flow.
 */
export async function exchangeCodeForTokens(code: string): Promise<void> {
  const { clientId, clientSecret } = getClientCredentials();
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

  if (!redirectUri) {
    throw new Error('SPOTIFY_REDIRECT_URI must be set in environment variables');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization:
        'Basic ' +
        Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  await prisma.oAuthToken.upsert({
    where: { service: 'spotify' },
    update: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
    },
    create: {
      service: 'spotify',
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
    },
  });
}

/**
 * Ensure the stored Spotify access token is fresh.
 * If it expires within 60 seconds, refresh it using the refresh token.
 * Called before EVERY Spotify API call.
 */
async function ensureFreshToken(): Promise<string> {
  const token = await prisma.oAuthToken.findUnique({
    where: { service: 'spotify' },
  });

  if (!token) {
    throw new Error(
      'Spotify not authenticated. Visit /auth/spotify/login to authorize.'
    );
  }

  // Refresh if token expires within 60 seconds
  const bufferMs = 60 * 1000;
  if (token.expiresAt.getTime() - Date.now() > bufferMs) {
    return token.accessToken;
  }

  // Token is stale — refresh it
  const { clientId, clientSecret } = getClientCredentials();

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: token.refreshToken,
  });

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization:
        'Basic ' +
        Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  await prisma.oAuthToken.update({
    where: { service: 'spotify' },
    data: {
      accessToken: data.access_token,
      // Spotify may return a new refresh token; if not, keep the existing one
      ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
      expiresAt,
    },
  });

  return data.access_token;
}

/**
 * Make an authenticated request to the Spotify API.
 * Automatically refreshes token and handles 429 rate limits.
 */
async function spotifyRequest(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const accessToken = await ensureFreshToken();

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  const response = await fetch(`${SPOTIFY_API_BASE}${path}`, {
    ...options,
    headers,
  });

  // Handle 429 rate limit: wait Retry-After seconds and retry once
  if (response.status === 429) {
    const retryAfterHeader = response.headers.get('Retry-After');
    const retryAfterSeconds = retryAfterHeader
      ? parseInt(retryAfterHeader, 10)
      : 1;
    console.warn(
      `Spotify rate limited. Waiting ${retryAfterSeconds}s before retry.`
    );

    await new Promise((resolve) =>
      setTimeout(resolve, retryAfterSeconds * 1000)
    );

    // Retry once
    const retryAccessToken = await ensureFreshToken();
    const retryResponse = await fetch(`${SPOTIFY_API_BASE}${path}`, {
      ...options,
      headers: {
        ...headers,
        Authorization: `Bearer ${retryAccessToken}`,
      },
    });

    if (retryResponse.status === 429) {
      console.error('Spotify still rate limited after retry. Skipping.');
    }

    return retryResponse;
  }

  return response;
}

/**
 * Start playback of a Spotify context (playlist/album) or tracks.
 * Requires an active Spotify Connect device.
 *
 * @param spotifyUri - e.g. "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M"
 * @param spotifyType - "playlist" | "album" | "track"
 */
export async function startPlayback(
  spotifyUri: string,
  spotifyType: string
): Promise<void> {
  let body: Record<string, unknown>;

  if (spotifyType === 'track') {
    body = { uris: [spotifyUri] };
  } else {
    body = { context_uri: spotifyUri };
  }

  const response = await spotifyRequest('/me/player/play', {
    method: 'PUT',
    body: JSON.stringify(body),
  });

  if (!response.ok && response.status !== 204) {
    const errorText = await response.text();
    if (response.status === 404) {
      console.error(
        'Spotify: No active device found. Open Spotify on a device first.'
      );
    } else {
      console.error(
        `Spotify playback error: ${response.status} ${errorText}`
      );
    }
  }
}

/**
 * Search Spotify for tracks and playlists.
 *
 * @param query - Search query string
 * @param types - Comma-separated types e.g. "track,playlist"
 * @param limit - Max results per type (default 10)
 */
export async function searchSpotify(
  query: string,
  types = 'track,playlist',
  limit = 10
): Promise<unknown> {
  const params = new URLSearchParams({
    q: query,
    type: types,
    limit: limit.toString(),
  });

  const response = await spotifyRequest(`/search?${params.toString()}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Spotify search failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

/**
 * Check if the user has authorized Spotify (has a stored token).
 */
export async function isSpotifyAuthenticated(): Promise<boolean> {
  const token = await prisma.oAuthToken.findUnique({
    where: { service: 'spotify' },
  });
  return token !== null;
}
