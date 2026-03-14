/**
 * Typed API client for the Heart Beater MC server.
 * All calls target /api/* — proxied to http://localhost:3001 in dev.
 */

import type {
  BpmRule,
  SpotifySearchResult,
} from '../types.ts';

const BASE = '/api';

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${options.method ?? 'GET'} ${path} failed (${res.status}): ${body}`);
  }

  // 204 No Content — return void cast
  if (res.status === 204) return undefined as unknown as T;

  return res.json() as Promise<T>;
}

// ── Rules ────────────────────────────────────────────────────────────────────

export async function getRules(): Promise<BpmRule[]> {
  return request<BpmRule[]>('/rules');
}

export async function createRule(
  data: Omit<BpmRule, 'id' | 'createdAt'>,
): Promise<BpmRule> {
  return request<BpmRule>('/rules', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateRule(
  id: string,
  data: Partial<Omit<BpmRule, 'id' | 'createdAt'>>,
): Promise<BpmRule> {
  return request<BpmRule>(`/rules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteRule(id: string): Promise<void> {
  return request<void>(`/rules/${id}`, { method: 'DELETE' });
}

// ── BLE ──────────────────────────────────────────────────────────────────────

export async function startBle(): Promise<{ ok: boolean; bpmSource: string }> {
  return request('/ble/start', { method: 'POST' });
}

export async function stopBle(): Promise<{ ok: boolean; bpmSource: string }> {
  return request('/ble/stop', { method: 'POST' });
}

// ── Spotify ──────────────────────────────────────────────────────────────────

export async function getSpotifyStatus(): Promise<{
  authenticated: boolean;
  loginUrl: string | null;
}> {
  return request('/spotify/status');
}

export async function searchSpotify(
  q: string,
  type = 'track,playlist,album',
  limit = 10,
): Promise<SpotifySearchResult> {
  const params = new URLSearchParams({ q, type, limit: limit.toString() });
  return request(`/spotify/search?${params.toString()}`);
}
