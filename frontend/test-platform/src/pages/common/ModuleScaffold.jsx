import React from 'react';
import { CheckCircle2, ListChecks, Plug, Wrench } from 'lucide-react';
import { CodeBlock, EmptyState, Grid, IntegrationStatus, Page, Panel } from '../../components/ui/ui';

/**
 * Layout for modules whose backend integration isn't wired up yet.
 * Shows the integration status, the record shape the page will list, what
 * the module does, and how to set it up — no placeholder data.
 */
export default function ModuleScaffold({
  description,
  integrations = [],
  columns = [],
  recordsTitle = 'Records',
  emptyTitle,
  emptyBody,
  emptyIcon,
  capabilities = [],
  setup,
  actions,
  children,
}) {
  return (
    <Page description={description} actions={actions}>
      {integrations.length > 0 && <IntegrationStatus ids={integrations} />}
      {children}
      <Grid cols="2-1">
        <Panel title={recordsTitle} icon={ListChecks} flush>
          <div className="tap-table-wrap">
            <table className="tap-table">
              <thead>
                <tr>{columns.map((c) => <th key={c.key}>{c.header}</th>)}</tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={Math.max(columns.length, 1)} className="tap-table-empty">
                    <EmptyState title={emptyTitle} icon={emptyIcon}>{emptyBody}</EmptyState>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>
        <div className="tap-stack">
          {capabilities.length > 0 && (
            <Panel title="What this module does" icon={Plug}>
              <ul className="tap-checklist">
                {capabilities.map((c) => (
                  <li key={c}><CheckCircle2 size={15} aria-hidden />{c}</li>
                ))}
              </ul>
            </Panel>
          )}
          {setup && (
            <Panel title="Setup" icon={Wrench}>
              {typeof setup === 'string' ? <CodeBlock>{setup}</CodeBlock> : setup}
            </Panel>
          )}
        </div>
      </Grid>
    </Page>
  );
}
