/**
 * Dashboard — Live view showing current BPM, active rule, and session status.
 *
 * Connects to GET /api/stream via the useServerEvents hook.
 * The BPM→Spotify pipeline works with or without this view open.
 */

import { useEffect, useState } from 'react';
import { useServerEvents } from '../hooks/useServerEvents.ts';
import { getRules, getSpotifyStatus } from '../api/client.ts';
import type { BpmRule } from '../types.ts';

function bpmColor(bpm: number | null): string {
  if (bpm === null) return 'text-gray-400';
  if (bpm < 100) return 'text-blue-400';
  if (bpm < 130) return 'text-green-400';
  if (bpm < 160) return 'text-yellow-400';
  return 'text-red-400';
}

function staleness(lastReceived: Date | null): string | null {
  if (!lastReceived) return null;
  const diffSec = Math.floor((Date.now() - lastReceived.getTime()) / 1000);
  if (diffSec < 30) return null;
  if (diffSec < 60) return `Last update ${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  return `Last update ${diffMin}m ago — watch may have disconnected`;
}

export function Dashboard() {
  const live = useServerEvents();
  const [rules, setRules] = useState<BpmRule[]>([]);
  const [spotifyConnected, setSpotifyConnected] = useState<boolean | null>(null);

  useEffect(() => {
    getRules().then(setRules).catch(console.error);
    getSpotifyStatus()
      .then((s) => setSpotifyConnected(s.authenticated))
      .catch(() => setSpotifyConnected(false));
  }, []);

  const activeRule = rules.find((r) => r.id === live.activeRuleId) ?? null;
  const staleWarning = staleness(live.lastBpmReceivedAt);

  return (
    <div className="space-y-6">
      {/* Connection / session banner */}
      <div
        className={`rounded-xl px-4 py-3 flex items-center gap-3 ${
          live.connected
            ? live.sessionActive
              ? 'bg-green-50 border border-green-200'
              : 'bg-gray-50 border border-gray-200'
            : 'bg-red-50 border border-red-200'
        }`}
      >
        <span
          className={`h-3 w-3 rounded-full shrink-0 ${
            live.connected
              ? live.sessionActive
                ? 'bg-green-500 animate-pulse'
                : 'bg-gray-400'
              : 'bg-red-500'
          }`}
        />
        <p
          className={`text-sm font-medium ${
            live.connected
              ? live.sessionActive
                ? 'text-green-800'
                : 'text-gray-600'
              : 'text-red-800'
          }`}
        >
          {!live.connected
            ? 'Disconnected from server — reconnecting…'
            : live.sessionActive
            ? 'Workout active — receiving heart rate'
            : 'Connected — no active session'}
        </p>
      </div>

      {/* Stale data warning */}
      {staleWarning && (
        <div className="rounded-xl bg-orange-50 border border-orange-200 px-4 py-3">
          <p className="text-sm text-orange-800">{staleWarning}</p>
        </div>
      )}

      {/* Spotify status */}
      {spotifyConnected === false && (
        <div className="rounded-xl bg-yellow-50 border border-yellow-200 px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-yellow-800">
            Spotify is not connected — music switching is paused.
          </p>
          <a
            href="/auth/spotify/login"
            className="ml-4 shrink-0 rounded-lg bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-900 hover:bg-yellow-200 transition-colors"
          >
            Connect Spotify
          </a>
        </div>
      )}

      {/* Informational note */}
      <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
        <p className="text-sm text-blue-700">
          Music switching works even if you close this tab.
        </p>
      </div>

      {/* BPM display */}
      <div className="rounded-xl bg-white border border-gray-200 p-8 text-center shadow-sm">
        <p className="text-sm font-medium text-gray-500 mb-2 uppercase tracking-widest">
          Heart Rate
        </p>
        <p
          className={`text-8xl font-bold tabular-nums leading-none ${bpmColor(live.bpm)}`}
        >
          {live.bpm ?? '--'}
        </p>
        <p className="mt-2 text-sm text-gray-400">BPM</p>
      </div>

      {/* Active rule */}
      <div className="rounded-xl bg-white border border-gray-200 p-6 shadow-sm">
        <p className="text-sm font-medium text-gray-500 mb-3 uppercase tracking-widest">
          Active Rule
        </p>
        {activeRule ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-semibold text-gray-900">
                {activeRule.label}
              </p>
              <p className="text-sm text-gray-500">
                Threshold: {activeRule.bpm} BPM &middot;{' '}
                <span className="capitalize">{activeRule.spotifyType}</span>
              </p>
              <p className="text-xs text-gray-400 mt-1 truncate max-w-xs">
                {activeRule.spotifyUri}
              </p>
            </div>
            <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-700">
              Playing
            </span>
          </div>
        ) : (
          <p className="text-gray-400">
            {live.sessionActive
              ? 'No rule matched — BPM is below all thresholds. Music continues.'
              : 'No active session'}
          </p>
        )}
      </div>

      {/* All rules — quick reference */}
      {rules.length > 0 && (
        <div className="rounded-xl bg-white border border-gray-200 p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-500 mb-3 uppercase tracking-widest">
            All Rules
          </p>
          <ul className="space-y-2">
            {rules.map((rule) => (
              <li
                key={rule.id}
                className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                  rule.id === live.activeRuleId
                    ? 'bg-indigo-50 border border-indigo-200'
                    : 'bg-gray-50'
                }`}
              >
                <span className="text-sm font-medium text-gray-800">
                  {rule.label}
                </span>
                <span
                  className={`text-sm font-semibold tabular-nums ${
                    rule.id === live.activeRuleId
                      ? 'text-indigo-700'
                      : 'text-gray-500'
                  }`}
                >
                  ≥ {rule.bpm} BPM
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
