/**
 * The platform's test types (GET /test-management/test-types).
 *
 * The list is configurable on the backend, so no screen hard-codes it: filters,
 * pickers, badges and reports all read it from here. Every badge in a table calls
 * this hook, so the catalogue is fetched once per session and shared — components
 * subscribe to the cached value instead of each firing their own request.
 */
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../config/api';

const EMPTY = { types: [], default: 'functional' };

let cache = null;          // last successful payload
let error = null;
let inFlight = null;
const listeners = new Set();

function publish() {
  listeners.forEach((fn) => fn({ data: cache, error }));
}

function load(force = false) {
  if (inFlight && !force) return inFlight;
  inFlight = apiFetch('/test-management/test-types')
    .then((data) => {
      cache = data;
      error = null;
      return data;
    })
    .catch((err) => {
      error = err;
      throw err;
    })
    .finally(() => {
      inFlight = null;
      publish();
    });
  return inFlight.catch(() => {});      // callers read state, not the promise
}

/** Re-read the catalogue (after editing new_backend/data/test_types.json). */
export function reloadTestTypes() {
  return load(true);
}

export default function useTestTypes() {
  const [state, setState] = useState({ data: cache, error });

  useEffect(() => {
    listeners.add(setState);
    if (!cache && !inFlight) load();
    return () => listeners.delete(setState);
  }, []);

  return useMemo(() => {
    const payload = state.data || EMPTY;
    const types = payload.types || [];
    const byId = Object.fromEntries(types.map((t) => [t.id, t]));
    return {
      types,
      byId,
      loading: !state.data && !state.error,
      error: state.error,
      reload: reloadTestTypes,
      defaultType: payload.default || 'functional',
      label: (id) => byId[id]?.label || (id ? String(id).replace(/_/g, ' ') : '—'),
      short: (id) => byId[id]?.short || byId[id]?.label || (id ? String(id).replace(/_/g, ' ') : '—'),
      color: (id) => byId[id]?.color || '#64748b',
    };
  }, [state]);
}

/** Count of the cases in `counts` that belong to the selected types (all when none selected). */
export function countForTypes(counts = {}, selected = []) {
  const entries = Object.entries(counts);
  if (!selected.length) return entries.reduce((sum, [, n]) => sum + n, 0);
  return entries.reduce((sum, [id, n]) => (selected.includes(id) ? sum + n : sum), 0);
}
