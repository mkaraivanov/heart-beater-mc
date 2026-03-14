/**
 * Shared TypeScript types for the Heart Beater MC client.
 */

export interface BpmRule {
  id: string;
  bpm: number;
  spotifyUri: string;
  spotifyType: 'playlist' | 'track' | 'album';
  label: string;
  createdAt: string;
}

/** Active BPM input source label (FR-28). */
export type BpmSource = 'garmin' | 'ble';

/** Payload sent by the SSE broadcaster on bpm-update events. */
export interface BpmUpdateEvent {
  bpm: number;
  activeRuleId: string | null;
  sessionActive: boolean;
  bpmSource: BpmSource;
}

/** Payload sent by the SSE broadcaster on the initial connected event. */
export interface ConnectedEvent {
  bpm: number | null;
  activeRuleId: string | null;
  sessionActive: boolean;
  lastBpmReceivedAt: string | null;
  bpmSource: BpmSource;
}

/** Live state derived from SSE events. */
export interface LiveState {
  connected: boolean;
  bpm: number | null;
  activeRuleId: string | null;
  sessionActive: boolean;
  lastBpmReceivedAt: Date | null;
  bpmSource: BpmSource;
}

export interface SpotifySearchResult {
  tracks?: {
    items: SpotifyTrack[];
  };
  playlists?: {
    items: SpotifyPlaylist[];
  };
  albums?: {
    items: SpotifyAlbum[];
  };
}

export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  artists: Array<{ name: string }>;
  album: { name: string; images: Array<{ url: string }> };
  type: 'track';
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  uri: string;
  description: string;
  images: Array<{ url: string }>;
  type: 'playlist';
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  uri: string;
  artists: Array<{ name: string }>;
  images: Array<{ url: string }>;
  type: 'album';
}
