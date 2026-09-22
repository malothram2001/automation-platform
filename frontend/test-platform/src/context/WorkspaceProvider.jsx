import React, { useCallback, useMemo, useState } from 'react';
import { WorkspaceContext } from './workspaceContext';
import useApi from '../hooks/useApi';

const PREFS_KEY = 'tap.workspace';

function readPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
  } catch {
    return {};
  }
}

export default function WorkspaceProvider({ children }) {
  const { data: context } = useApi('/platform/context');
  const [selection, setSelection] = useState(() => ({
    application: 'krishivaas',
    variant: 'all',
    environment: null,
    ...readPrefs(),
  }));

  const update = useCallback((patch) => {
    setSelection((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable — the selection just won't persist */
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({
    context,
    ...selection,
    // Until the user picks one, follow the backend's default environment.
    environment: selection.environment ?? context?.default_environment ?? null,
    variantLabel: selection.variant === 'all'
      ? 'All variants'
      : context?.variants.find((v) => v.id === selection.variant)?.label || selection.variant,
    setSelection: update,
  }), [context, selection, update]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
