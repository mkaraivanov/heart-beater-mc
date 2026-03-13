/**
 * Tests for /server/src/spotify/client.ts
 *
 * Verifies:
 *  - ensureFreshToken() is called before every Spotify API request
 *  - A token within 60 seconds of expiry is automatically refreshed
 *  - A valid (non-expiring) token is returned as-is
 *  - 429 responses trigger a Retry-After wait and a single retry
 *  - If still 429 after retry, the error is logged and the response returned
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoist mocks to avoid TDZ issues with vi.mock factory ────────────────────

const { mockFindUnique, mockUpdate, mockUpsert, mockSleepFn } = vi.hoisted(() => {
  return {
    mockFindUnique: vi.fn(),
    mockUpdate: vi.fn().mockResolvedValue(undefined),
    mockUpsert: vi.fn().mockResolvedValue(undefined),
    mockSleepFn: vi.fn().mockResolvedValue(undefined),
  };
});

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

vi.mock('../prisma', () => ({
  default: {
    oAuthToken: {
      findUnique: mockFindUnique,
      update: mockUpdate,
      upsert: mockUpsert,
    },
  },
}));

// ─── Mock sleep so tests don't actually wait ─────────────────────────────────

vi.mock('../utils', () => ({
  sleep: mockSleepFn,
}));


// ─── Mock global fetch ────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ─── Import after mocks are in place ─────────────────────────────────────────

import { startPlayback, searchSpotify } from '../spotify/client';

// ─── Base token fixture ───────────────────────────────────────────────────────

const mockPrismaToken = {
  service: 'spotify',
  accessToken: 'access-token-fresh',
  refreshToken: 'refresh-token',
  expiresAt: new Date(Date.now() + 3600 * 1000),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeResponse(status: number, body: unknown = {}, headers: Record<string, string> = {}): Response {
  const headerMap = new Map(Object.entries(headers));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (key: string) => headerMap.get(key) ?? null,
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ensureFreshToken — token lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['SPOTIFY_CLIENT_ID'] = 'test-client-id';
    process.env['SPOTIFY_CLIENT_SECRET'] = 'test-client-secret';
  });

  afterEach(() => {
    delete process.env['SPOTIFY_CLIENT_ID'];
    delete process.env['SPOTIFY_CLIENT_SECRET'];
  });

  it('returns the current access token when it is not near expiry', async () => {
    // Token expires in 1 hour — no refresh needed
    mockFindUnique.mockResolvedValueOnce({
      ...mockPrismaToken,
      expiresAt: new Date(Date.now() + 3600 * 1000),
    });

    // 204 No Content — success without body
    mockFetch.mockResolvedValueOnce(makeResponse(204));

    await startPlayback('spotify:playlist:abc', 'playlist');

    // fetch should have been called exactly once (the playback PUT)
    // and NOT the token URL
    const calls = mockFetch.mock.calls as [string, ...unknown[]][];
    const tokenCalls = calls.filter(([url]) =>
      (url as string).includes('accounts.spotify.com')
    );
    expect(tokenCalls).toHaveLength(0);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('automatically refreshes the token when it expires within 60 seconds', async () => {
    // Token expires in 30 seconds — within the 60s refresh buffer
    mockFindUnique.mockResolvedValueOnce({
      ...mockPrismaToken,
      accessToken: 'stale-token',
      expiresAt: new Date(Date.now() + 30 * 1000),
    });

    // First fetch: Spotify token endpoint returns new tokens
    mockFetch.mockResolvedValueOnce(
      makeResponse(200, {
        access_token: 'fresh-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
      })
    );

    // Second fetch: playback PUT succeeds
    mockFetch.mockResolvedValueOnce(makeResponse(204));

    await startPlayback('spotify:playlist:abc', 'playlist');

    // The token refresh endpoint must have been called
    const calls = mockFetch.mock.calls as [string, ...unknown[]][];
    const tokenCalls = calls.filter(([url]) =>
      (url as string).includes('accounts.spotify.com')
    );
    expect(tokenCalls).toHaveLength(1);

    // prisma.update must have been called to persist the new tokens
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { service: 'spotify' },
        data: expect.objectContaining({
          accessToken: 'fresh-access-token',
          refreshToken: 'new-refresh-token',
        }),
      })
    );
  });

  it('uses the new access token from the refresh response for the actual API call', async () => {
    // Expiring token
    mockFindUnique.mockResolvedValueOnce({
      ...mockPrismaToken,
      accessToken: 'stale-token',
      expiresAt: new Date(Date.now() + 10 * 1000),
    });

    mockFetch
      // Token refresh
      .mockResolvedValueOnce(
        makeResponse(200, {
          access_token: 'brand-new-token',
          expires_in: 3600,
        })
      )
      // Playback PUT
      .mockResolvedValueOnce(makeResponse(204));

    await startPlayback('spotify:playlist:abc', 'playlist');

    const calls = mockFetch.mock.calls as [string, RequestInit][];
    const playbackCall = calls.find(([url]) =>
      (url as string).includes('/me/player/play')
    );
    expect(playbackCall).toBeDefined();
    const authHeader = (playbackCall![1].headers as Record<string, string>)['Authorization'];
    expect(authHeader).toBe('Bearer brand-new-token');
  });

  it('throws when no Spotify token exists in the database', async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    await expect(
      startPlayback('spotify:playlist:abc', 'playlist')
    ).rejects.toThrow(/not authenticated/i);
  });
});

describe('429 rate-limit handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['SPOTIFY_CLIENT_ID'] = 'test-client-id';
    process.env['SPOTIFY_CLIENT_SECRET'] = 'test-client-secret';

    // Fresh token — no refresh needed
    mockFindUnique.mockResolvedValue({
      ...mockPrismaToken,
      expiresAt: new Date(Date.now() + 3600 * 1000),
    });
  });

  it('waits Retry-After seconds and retries once on 429', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(429, {}, { 'Retry-After': '3' }))
      .mockResolvedValueOnce(makeResponse(204));

    await startPlayback('spotify:playlist:abc', 'playlist');

    expect(mockSleepFn).toHaveBeenCalledWith(3000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('defaults to 1 second wait when Retry-After header is absent', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(429, {}, {}))
      .mockResolvedValueOnce(makeResponse(204));

    await startPlayback('spotify:playlist:abc', 'playlist');

    expect(mockSleepFn).toHaveBeenCalledWith(1000);
  });

  it('logs a warning when 429 is received', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetch
      .mockResolvedValueOnce(makeResponse(429, {}, { 'Retry-After': '5' }))
      .mockResolvedValueOnce(makeResponse(204));

    await startPlayback('spotify:playlist:abc', 'playlist');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('rate limited')
    );
    warnSpy.mockRestore();
  });

  it('logs an error and returns if still 429 after the single retry', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch
      .mockResolvedValueOnce(makeResponse(429, {}, { 'Retry-After': '2' }))
      .mockResolvedValueOnce(makeResponse(429, {}, { 'Retry-After': '2' }));

    // Should not throw — the pipeline must continue
    await expect(
      startPlayback('spotify:playlist:abc', 'playlist')
    ).resolves.not.toThrow();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('rate limited')
    );
    errorSpy.mockRestore();
  });

  it('handles 429 in searchSpotify the same way', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(429, {}, { 'Retry-After': '1' }))
      .mockResolvedValueOnce(makeResponse(200, { tracks: { items: [] } }));

    await searchSpotify('test query');

    expect(mockSleepFn).toHaveBeenCalledWith(1000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
