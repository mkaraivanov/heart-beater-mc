/**
 * SpotifyAuthBanner — shown at the top of all views when Spotify is not
 * authenticated. Provides a one-click link to begin the OAuth flow.
 */

import { useEffect, useState } from 'react';
import { getSpotifyStatus } from '../api/client.ts';

export function SpotifyAuthBanner() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    getSpotifyStatus()
      .then((s) => setAuthenticated(s.authenticated))
      .catch(() => setAuthenticated(false));
  }, []);

  if (authenticated === null || authenticated === true) return null;

  return (
    <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-3 flex items-center justify-between">
      <p className="text-sm text-yellow-800">
        Spotify is not connected. Threshold rules will not trigger playback
        until you authorise.
      </p>
      <a
        href="/auth/spotify/login"
        className="ml-4 shrink-0 rounded bg-green-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-600"
      >
        Connect Spotify
      </a>
    </div>
  );
}
