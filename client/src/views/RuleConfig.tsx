/**
 * RuleConfig — manage BPM threshold rules.
 *
 * Lists all rules ordered by BPM (lowest → highest).
 * Supports add, edit, and delete.
 */

import { useEffect, useState, useCallback } from 'react';
import { getRules, createRule, updateRule, deleteRule } from '../api/client.ts';
import { RuleModal } from '../components/RuleModal.tsx';
import type { BpmRule } from '../types.ts';

export function RuleConfig() {
  const [rules, setRules] = useState<BpmRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<BpmRule | undefined>();

  const loadRules = useCallback(() => {
    setLoading(true);
    getRules()
      .then(setRules)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load rules'),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  async function handleSave(
    data: Omit<BpmRule, 'id' | 'createdAt'>,
    id?: string,
  ) {
    if (id) {
      await updateRule(id, data);
    } else {
      await createRule(data);
    }
    loadRules();
  }

  async function handleDelete(rule: BpmRule) {
    if (
      !window.confirm(
        `Delete rule "${rule.label}" (${rule.bpm} BPM)? This cannot be undone.`,
      )
    )
      return;
    try {
      await deleteRule(rule.id);
      loadRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  function openAdd() {
    setEditingRule(undefined);
    setModalOpen(true);
  }

  function openEdit(rule: BpmRule) {
    setEditingRule(rule);
    setModalOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            BPM Threshold Rules
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Each rule links a heart rate zone to a Spotify playlist, album, or
            track. The highest matching rule activates when your BPM crosses
            its threshold.
          </p>
        </div>
        <button
          onClick={openAdd}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 shrink-0"
        >
          + Add Rule
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl bg-white border border-gray-200 p-8 text-center">
          <p className="text-gray-400">Loading rules…</p>
        </div>
      ) : rules.length === 0 ? (
        <div className="rounded-xl bg-white border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-lg mb-4">No rules yet</p>
          <p className="text-sm text-gray-400 mb-6">
            Add your first rule to start controlling Spotify with your heart
            rate.
          </p>
          <button
            onClick={openAdd}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Add your first rule
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="rounded-xl bg-white border border-gray-200 px-5 py-4 shadow-sm flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-4 min-w-0">
                <span className="shrink-0 rounded-full bg-indigo-100 px-3 py-1 text-sm font-bold text-indigo-700 tabular-nums">
                  {rule.bpm} BPM
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {rule.label}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    <span className="capitalize">{rule.spotifyType}</span>
                    {' · '}
                    {rule.spotifyUri}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => openEdit(rule)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(rule)}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {modalOpen && (
        <RuleModal
          existing={editingRule}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
