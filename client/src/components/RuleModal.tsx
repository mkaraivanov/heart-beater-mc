/**
 * RuleModal — dialog for creating or editing a BPM threshold rule.
 *
 * Includes an inline Spotify search so the user can pick a playlist,
 * track, or album to link to the rule.
 */

import { useState } from 'react';
import { searchSpotify } from '../api/client.ts';
import type {
  BpmRule,
  SpotifyTrack,
  SpotifyPlaylist,
  SpotifyAlbum,
} from '../types.ts';

type SpotifyItem = SpotifyTrack | SpotifyPlaylist | SpotifyAlbum;

interface Props {
  /** If provided, the modal is in edit mode pre-populated with the rule. */
  existing?: BpmRule;
  onSave: (
    data: Omit<BpmRule, 'id' | 'createdAt'>,
    id?: string,
  ) => Promise<void>;
  onClose: () => void;
}

function itemLabel(item: SpotifyItem): string {
  if (item.type === 'track') {
    return `${item.name} — ${item.artists.map((a) => a.name).join(', ')}`;
  }
  if (item.type === 'playlist') {
    return item.name;
  }
  return `${item.name} — ${item.artists.map((a) => a.name).join(', ')}`;
}

function itemImage(item: SpotifyItem): string | undefined {
  if (item.type === 'track') return item.album.images[0]?.url;
  return item.images[0]?.url;
}

export function RuleModal({ existing, onSave, onClose }: Props) {
  const [bpm, setBpm] = useState<string>(
    existing ? String(existing.bpm) : '',
  );
  const [label, setLabel] = useState(existing?.label ?? '');
  const [spotifyUri, setSpotifyUri] = useState(existing?.spotifyUri ?? '');
  const [spotifyType, setSpotifyType] = useState<
    'playlist' | 'track' | 'album'
  >(existing?.spotifyType ?? 'playlist');

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SpotifyItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedItem, setSelectedItem] = useState<SpotifyItem | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setSearchError('');
    setSearchResults([]);
    try {
      const res = await searchSpotify(query, 'track,playlist,album', 10);
      const items: SpotifyItem[] = [
        ...(res.tracks?.items ?? []),
        ...(res.playlists?.items ?? []),
        ...(res.albums?.items ?? []),
      ];
      setSearchResults(items);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }

  function handleSelectItem(item: SpotifyItem) {
    setSelectedItem(item);
    setSpotifyUri(item.uri);
    setSpotifyType(item.type);
    setSearchResults([]);
    setQuery('');
    if (!label) setLabel(itemLabel(item).slice(0, 60));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const bpmNum = parseInt(bpm, 10);
    if (isNaN(bpmNum) || bpmNum < 1 || bpmNum > 300) {
      setError('BPM must be a number between 1 and 300');
      return;
    }
    if (!spotifyUri) {
      setError('Please select a Spotify track, playlist, or album');
      return;
    }
    if (!label.trim()) {
      setError('Label is required');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onSave(
        { bpm: bpmNum, spotifyUri, spotifyType, label: label.trim() },
        existing?.id,
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">
            {existing ? 'Edit Rule' : 'New Rule'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {/* BPM threshold */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              BPM Threshold
            </label>
            <input
              type="number"
              min={1}
              max={300}
              value={bpm}
              onChange={(e) => setBpm(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="e.g. 140"
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              This rule activates when heart rate reaches this BPM.
            </p>
          </div>

          {/* Label */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Label
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="e.g. High Intensity Zone"
              required
            />
          </div>

          {/* Spotify search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Spotify Content
            </label>
            {selectedItem && (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                {itemImage(selectedItem) && (
                  <img
                    src={itemImage(selectedItem)}
                    alt=""
                    className="h-8 w-8 rounded object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-green-900 truncate">
                    {itemLabel(selectedItem)}
                  </p>
                  <p className="text-xs text-green-700 capitalize">
                    {selectedItem.type}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedItem(null);
                    setSpotifyUri('');
                  }}
                  className="text-green-600 hover:text-green-800 text-xs"
                >
                  Change
                </button>
              </div>
            )}
            {!selectedItem && (
              <>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSearch())}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="Search for a track, playlist, or album…"
                  />
                  <button
                    type="button"
                    onClick={handleSearch}
                    disabled={searching || !query.trim()}
                    className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {searching ? '…' : 'Search'}
                  </button>
                </div>
                {searchError && (
                  <p className="mt-1 text-xs text-red-600">{searchError}</p>
                )}
                {searchResults.length > 0 && (
                  <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                    {searchResults.map((item) => (
                      <li key={item.uri}>
                        <button
                          type="button"
                          onClick={() => handleSelectItem(item)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50"
                        >
                          {itemImage(item) && (
                            <img
                              src={itemImage(item)}
                              alt=""
                              className="h-8 w-8 rounded object-cover shrink-0"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {itemLabel(item)}
                            </p>
                            <p className="text-xs text-gray-500 capitalize">
                              {item.type}
                            </p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {/* Manual URI entry fallback */}
                {spotifyUri && !selectedItem && (
                  <p className="mt-1 text-xs text-gray-500 truncate">
                    URI: {spotifyUri} ({spotifyType})
                  </p>
                )}
              </>
            )}
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : existing ? 'Save Changes' : 'Create Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
