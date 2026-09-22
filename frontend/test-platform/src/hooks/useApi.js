import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../config/api';

/**
 * GET a backend path and keep the result in state.
 *   const { data, error, loading, reload } = useApi('/reports/summary', { interval: 15000 });
 * Pass `null` as the path to skip fetching. Polling pauses while the tab is hidden.
 */
export default function useApi(path, { interval = 0 } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(path));
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!path) return;
    const id = ++requestId.current;
    try {
      const body = await apiFetch(path);
      if (id === requestId.current) {
        setData(body);
        setError(null);
      }
    } catch (err) {
      if (id === requestId.current) setError(err);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    // New path: drop the previous path's result so it isn't shown as this one's.
    setData(null);
    setError(null);
    setLoading(Boolean(path));
    load();
    if (!interval || !path) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, interval);
    return () => clearInterval(timer);
  }, [load, interval, path]);

  return { data, error, loading, reload: load };
}
