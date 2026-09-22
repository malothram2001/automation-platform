import { createContext, useContext } from 'react';

/**
 * Workspace context = the top bar selection (application / variant / environment).
 * Pages read it to scope what they show; the provider lives in WorkspaceProvider.jsx.
 */
export const WorkspaceContext = createContext({
  context: null,          // GET /platform/context payload
  application: 'krishivaas',
  variant: 'all',         // 'all' or an APP_VARIANTS id
  environment: 'staging',
  variantLabel: 'All variants',
  setSelection: () => {},
});

export function useWorkspace() {
  return useContext(WorkspaceContext);
}

/** Does a case / suite / result belong to the selected variant? */
export function matchesVariant(variant, value) {
  return variant === 'all' || !value || value === variant;
}
