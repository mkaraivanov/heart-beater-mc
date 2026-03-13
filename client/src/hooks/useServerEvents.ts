/**
 * useServerEvents — subscribes to the SSE /api/stream endpoint and maintains
 * live state (BPM, active rule, session status, connection health).
 *
 * The dashboard is purely observational: the BPM→Spotify pipeline works
 * without any browser tab open.
 */

import { useEffect, useRef, useState } from 'react';
import type { LiveState, BpmUpdateEvent, ConnectedEvent } from '../types.ts';

const SSE_URL = '/api/stream';

/** How long without an event before we consider the connection stale (ms). */
const STALE_THRESHOLD_MS = 35_000;

export function useServerEvents(): LiveState {
  const [state, setState] = useState<LiveState>({
    connected: false,
    bpm: null,
    activeRuleId: null,
    sessionActive: false,
    lastBpmReceivedAt: null,
  });

  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let es: EventSource;
    let destroyed = false;

    function resetStaleTimer() {
      if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
      staleTimerRef.current = setTimeout(() => {
        // Mark disconnected if no event received in STALE_THRESHOLD_MS
        setState((prev) => ({ ...prev, connected: false }));
      }, STALE_THRESHOLD_MS);
    }

    function connect() {
      if (destroyed) return;

      es = new EventSource(SSE_URL);

      es.addEventListener('connected', (e) => {
        const data = JSON.parse(e.data) as ConnectedEvent;
        setState({
          connected: true,
          bpm: data.bpm,
          activeRuleId: data.activeRuleId,
          sessionActive: data.sessionActive,
          lastBpmReceivedAt: data.lastBpmReceivedAt
            ? new Date(data.lastBpmReceivedAt)
            : null,
        });
        resetStaleTimer();
      });

      es.addEventListener('bpm-update', (e) => {
        const data = JSON.parse(e.data) as BpmUpdateEvent;
        setState((prev) => ({
          ...prev,
          connected: true,
          bpm: data.bpm,
          activeRuleId: data.activeRuleId,
          sessionActive: data.sessionActive,
          lastBpmReceivedAt: new Date(),
        }));
        resetStaleTimer();
      });

      es.addEventListener('session-end', () => {
        setState((prev) => ({
          ...prev,
          connected: true,
          bpm: null,
          activeRuleId: null,
          sessionActive: false,
        }));
        resetStaleTimer();
      });

      es.onerror = () => {
        setState((prev) => ({ ...prev, connected: false }));
        es.close();
        // Reconnect after 3 seconds
        if (!destroyed) {
          setTimeout(connect, 3_000);
        }
      };
    }

    connect();

    return () => {
      destroyed = true;
      if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
      if (es) es.close();
    };
  }, []);

  return state;
}
