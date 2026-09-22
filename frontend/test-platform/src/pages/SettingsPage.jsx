import React, { useState } from 'react';
import { Container, KeyRound, LayoutPanelLeft, Plug, RotateCcw, Server, Terminal } from 'lucide-react';
import {
  Button, DataState, DataTable, Grid, Page, Panel, RefreshButton, StatCard, StatGrid, StatusBadge, Tabs,
} from '../components/ui/ui';
import useApi from '../hooks/useApi';
import { API_URL, WS_URL } from '../config/api';
import { useWorkspace } from '../context/workspaceContext';

const ENV_NAME = /^[A-Z0-9_]+$/;

export default function SettingsPage() {
  const health = useApi('/');
  const integrations = useApi('/platform/integrations');
  const { context, variantLabel, environment } = useWorkspace();
  const [tab, setTab] = useState('connection');
  const [resetDone, setResetDone] = useState(false);

  const resetPreferences = () => {
    try {
      localStorage.removeItem('tap.sidebar');
      localStorage.removeItem('tap.workspace');
    } catch {
      /* storage unavailable */
    }
    setResetDone(true);
    window.location.reload();
  };

  const items = integrations.data?.integrations || [];
  const ready = items.filter((i) => ['configured', 'connected'].includes(i.status)).length;
  const missingVars = items.flatMap((i) => (i.requires || []).filter((r) => ENV_NAME.test(r) && i.missing.includes(r))).length;

  return (
    <Page
      description="Connection details, integrations, environment variables and interface preferences for this TAP workspace."
      actions={<RefreshButton onClick={() => { health.reload(); integrations.reload(); }} loading={health.loading || integrations.loading} />}
    >
      <StatGrid>
        <StatCard label="Backend" value={health.error ? 'Offline' : health.data ? 'Running' : '—'} icon={Server}
          tone={health.error ? 'danger' : health.data ? 'success' : 'muted'} hint={API_URL} />
        <StatCard label="Tools ready" value={integrations.data ? `${ready} / ${items.length}` : null} icon={Plug} tone="success" />
        <StatCard label="Env variables missing" value={integrations.data ? missingVars : null} icon={KeyRound} tone={missingVars ? 'warn' : 'success'} />
        <StatCard label="Workspace" value={variantLabel} icon={LayoutPanelLeft} tone="info"
          hint={`Environment: ${context?.environments.find((e) => e.id === environment)?.label || '—'}`} />
      </StatGrid>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'connection', label: 'Connection', icon: Server },
          { id: 'integrations', label: 'Integrations', icon: Plug, count: items.length || undefined },
          { id: 'environment', label: 'Environment', icon: KeyRound },
        ]}
      />

      {tab === 'connection' && (
        <Grid cols={2}>
          <Panel title="Backend connection" icon={Server}>
            <dl className="tap-dl">
              <dt>Status</dt>
              <dd>
                {health.error ? <StatusBadge status="offline" label="Unreachable" />
                  : health.data ? <StatusBadge status="online" label={`${health.data.service} — ${health.data.status}`} />
                  : <StatusBadge status="pending" label="Checking…" />}
              </dd>
              <dt>API URL</dt><dd className="tap-mono">{API_URL}</dd>
              <dt>WebSocket</dt><dd className="tap-mono">{WS_URL}</dd>
            </dl>
            <p className="tap-hint">
              Point the UI at another backend with <code>VITE_BACKEND_URL</code> in <code>frontend/test-platform/.env.local</code>, then restart <code>npm run dev</code>.
            </p>
          </Panel>

          <Panel title="Interface" icon={LayoutPanelLeft}>
            <p className="tap-prose">
              The sidebar remembers whether it’s collapsed and which sections you’ve folded; the top bar remembers the selected
              variant and environment. Press <kbd>/</kbd> anywhere to jump to page search.
            </p>
            <Button icon={RotateCcw} onClick={resetPreferences} disabled={resetDone}>Reset sidebar & workspace preferences</Button>
          </Panel>
        </Grid>
      )}

      {tab === 'integrations' && (
        <Panel title="Integrations" icon={Plug} flush subtitle="Detected on the backend host from .env variables and tools on PATH">
          <DataState state={integrations}>
            {(d) => (
              <DataTable
                rows={d.integrations}
                columns={[
                  { key: 'name', header: 'Integration', render: (i) => <span className="tap-cell-main">{i.name}</span> },
                  { key: 'category', header: 'Category' },
                  { key: 'requires', header: 'Needs', render: (i) => <span className="tap-cell-sub">{(i.requires || []).join(', ').replace(/`/g, '')}</span> },
                  { key: 'status', header: 'Status', render: (i) => <StatusBadge status={i.status} /> },
                ]}
              />
            )}
          </DataState>
        </Panel>
      )}

      {tab === 'environment' && (
        <DataState state={integrations}>
          {(d) => {
            const envRows = d.integrations.flatMap((i) =>
              (i.requires || []).filter((r) => ENV_NAME.test(r)).map((name) => ({
                name, integration: i.name, category: i.category, set: !i.missing.includes(name),
              })),
            );
            const toolRows = d.integrations.filter((i) => !(i.requires || []).some((r) => ENV_NAME.test(r)));
            return (
              <Grid cols="2-1">
                <Panel title="Environment variables" icon={KeyRound} flush
                  subtitle="Read from the backend’s .env at startup — values never reach the browser, only whether they are set">
                  <DataTable
                    rowKey="name"
                    rows={envRows}
                    columns={[
                      { key: 'name', header: 'Variable', render: (r) => <span className="tap-mono">{r.name}</span> },
                      { key: 'integration', header: 'Used by', render: (r) => <><div>{r.integration}</div><div className="tap-cell-sub">{r.category}</div></> },
                      { key: 'set', header: 'Status', render: (r) => <StatusBadge status={r.set ? 'configured' : 'not_configured'} label={r.set ? 'Set' : 'Missing'} /> },
                    ]}
                  />
                </Panel>
                <div className="tap-stack">
                  <Panel title="Command-line tools" icon={Terminal} flush subtitle="Looked up on the backend host’s PATH">
                    <DataTable
                      rows={toolRows}
                      columns={[
                        { key: 'name', header: 'Tool', render: (t) => <span className="tap-cell-main">{t.name}</span> },
                        { key: 'status', header: 'Status', render: (t) => <StatusBadge status={t.status} label={t.status === 'configured' ? 'Found' : undefined} /> },
                      ]}
                    />
                  </Panel>
                  <Panel title="Infrastructure" icon={Container}>
                    <p className="tap-prose">
                      Docker, Kubernetes and Selenium Grid are detected here rather than having their own pages. Web suites run on the
                      backend host’s browsers unless <code>SELENIUM_GRID_URL</code> is set.
                    </p>
                  </Panel>
                </div>
              </Grid>
            );
          }}
        </DataState>
      )}
    </Page>
  );
}
