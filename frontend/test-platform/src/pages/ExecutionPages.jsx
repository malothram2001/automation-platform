import React, { useEffect, useMemo, useRef, useState } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import clsx from 'clsx';
import {
  Activity, CalendarClock, CheckCircle2, Circle, CircleDashed, Clock, ExternalLink, FileCode2, Grid3x3, ListOrdered,
  Loader2, MonitorSmartphone, Pause, Play, Radio, Square, Target, Terminal, Trash2, XCircle,
} from 'lucide-react';
import {
  Button, DataState, DataTable, EmptyState, Grid, Page, Panel, Pill, ProgressBar, RefreshButton, StatCard, StatGrid,
  StatusBadge, Tabs,
} from '../components/ui/ui';
import ModuleScaffold from './common/ModuleScaffold';
import useApi from '../hooks/useApi';
import { WS_URL, apiFetch } from '../config/api';
import { useWorkspace } from '../context/workspaceContext';
import { formatDateTime, formatDuration, pct, timeAgo } from '../utils/format';

/* ─── Execution Matrix ───────────────────────────────────────────────────── */

const CELL_META = {
  passed:  { label: 'Passed', icon: CheckCircle2 },
  failed:  { label: 'Failed', icon: XCircle },
  partial: { label: 'Partially run', icon: CircleDashed },
  not_run: { label: 'Not run', icon: Circle },
  missing: { label: 'No test file', icon: FileCode2 },
};

export function ExecutionMatrixPage() {
  const state = useApi('/test-management/matrix');
  const { variant } = useWorkspace();

  return (
    <Page
      description="Every app variant against its planned modules (from slack/config.py APP_VARIANTS), with the outcome of each module’s tests in the latest run and the coverage still missing."
      actions={<><RefreshButton onClick={state.reload} loading={state.loading} /><Button variant="primary" icon={Play} to="/automation/mobile">Configure a run</Button></>}
    >
      <DataState state={state}>
        {(m) => {
          const shown = m.variants.filter((v) => variant === 'all' || v.id === variant);
          const missing = m.variants.flatMap((v) => v.modules.filter((c) => !c.exists).map((c) => ({ ...c, variant: v.label })));
          return (
            <>
              <StatGrid>
                <StatCard label="App variants" value={m.variants.length} icon={Grid3x3} />
                <StatCard label="Planned modules" value={m.planned_modules} icon={ListOrdered} tone="info" />
                <StatCard label="Modules with tests" value={m.implemented} icon={CheckCircle2} tone="success" />
                <StatCard label="Coverage" value={pct(m.coverage_pct)} icon={Target} tone={m.coverage_pct >= 80 ? 'success' : 'warn'} hint="Release gate: ≥ 80%" />
              </StatGrid>

              <Panel title="Variant × module matrix" icon={Grid3x3} actions={<MatrixLegend />}
                subtitle={variant === 'all' ? undefined : 'Filtered by the variant selected in the top bar'}>
                <div className="tap-matrix">
                  {shown.map((v) => (
                    <div key={v.id} className="tap-matrix-row">
                      <div className="tap-matrix-head">
                        <div className="tap-cell-main">{v.label}</div>
                        <div className="tap-inline-bar">
                          <ProgressBar value={v.coverage_pct} tone={v.coverage_pct >= 80 ? 'success' : 'warn'} label={`${v.label} coverage`} />
                          <span>{pct(v.coverage_pct)}</span>
                        </div>
                      </div>
                      <div className="tap-matrix-cells">
                        {v.modules.map((cell) => {
                          const meta = CELL_META[cell.status] || CELL_META.not_run;
                          const Icon = meta.icon;
                          return (
                            <div key={cell.module} className={clsx('tap-matrix-cell', `is-${cell.status}`)} title={`${cell.path}\n${meta.label}`}>
                              <div className="tap-matrix-cell-top">
                                <Icon size={15} aria-hidden />
                                <span>{cell.module}</span>
                              </div>
                              <div className="tap-matrix-cell-sub">
                                {cell.exists ? `${cell.test_count} test${cell.test_count === 1 ? '' : 's'} · ${meta.label}` : meta.label}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="Missing test files" icon={FileCode2} flush subtitle="Planned modules that have no pytest file yet">
                <DataTable
                  rowKey="path"
                  rows={missing}
                  empty={<EmptyState compact icon={CheckCircle2} title="Every planned module has a test file" />}
                  columns={[
                    { key: 'module', header: 'Module', render: (c) => <><div className="tap-cell-main">{c.module}</div><div className="tap-cell-sub">{c.variant}</div></> },
                    { key: 'path', header: 'Expected file', render: (c) => <span className="tap-mono">{c.path}</span> },
                  ]}
                />
              </Panel>
            </>
          );
        }}
      </DataState>
    </Page>
  );
}

function MatrixLegend() {
  return (
    <div className="tap-legend-inline">
      {Object.entries(CELL_META).map(([key, meta]) => (
        <span key={key} className={clsx('tap-legend-chip', `is-${key}`)}>{meta.label}</span>
      ))}
    </div>
  );
}

/* ─── Live Execution ─────────────────────────────────────────────────────── */

const MAX_LOG_LINES = 1000;
const now = () => new Date().toLocaleTimeString([], { hour12: false });

function ProgressRing({ value, size = 104 }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="tap-ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 110 110" role="img" aria-label={`${Math.round(v)}% complete`}>
        <circle cx="55" cy="55" r={r} fill="none" stroke="#eef2f7" strokeWidth="9" />
        <circle cx="55" cy="55" r={r} fill="none" stroke="#2563eb" strokeWidth="9" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} transform="rotate(-90 55 55)" />
      </svg>
      <span className="tap-ring-value">{Math.round(v)}%</span>
    </div>
  );
}

/** Ticks a timestamp while a run is in progress; render stays pure. */
function useNow(running) {
  const [now, setNow] = useState(null);
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return now;
}

export function LiveExecutionPage() {
  const queue = useApi('/test-management/queue', { interval: 5000 });
  const devices = useApi('/platform/devices', { interval: 15000 });

  const [modules, setModules] = useState([]);
  const [logs, setLogs] = useState([]);
  const [reportUrl, setReportUrl] = useState(null);
  const [phase, setPhase] = useState('idle');       // idle | running | complete
  const [startedAt, setStartedAt] = useState(null);
  const [finishedAt, setFinishedAt] = useState(null);
  const [filter, setFilter] = useState('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [level, setLevel] = useState('all');
  const [stopping, setStopping] = useState(false);
  const consoleRef = useRef(null);

  const push = (message, status = 'INFO') =>
    setLogs((prev) => [...prev.slice(-MAX_LOG_LINES + 1), { time: now(), message, status: String(status).toUpperCase() }]);

  const { readyState } = useWebSocket(WS_URL, {
    shouldReconnect: () => true,
    reconnectInterval: 3000,
    onMessage: (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      const p = msg.payload || {};
      switch (msg.type) {
        case 'RUN_START':
          setModules([]); setLogs([]); setReportUrl(null); setPhase('running');
          setStartedAt(Date.now()); setFinishedAt(null);
          break;
        case 'MODULES':
          setModules((p.modules || []).map((m) => ({ name: m.name, path: m.path, status: 'pending', startedAt: null, duration: null })));
          setPhase('running');
          setStartedAt((prev) => prev ?? Date.now());
          break;
        case 'MODULE': {
          if (!p.module) break;
          setPhase('running');
          setStartedAt((prev) => prev ?? Date.now());
          const stamp = Date.now();
          setModules((prev) => {
            const index = prev.findIndex((m) => m.name.toLowerCase() === p.module.toLowerCase());
            const entry = index >= 0 ? prev[index] : { name: p.module, path: null, status: 'pending', startedAt: null, duration: null };
            const updated = {
              ...entry,
              status: p.status,
              startedAt: p.status === 'running' ? stamp : entry.startedAt,
              duration: ['completed', 'passed', 'failed'].includes(p.status) && entry.startedAt ? stamp - entry.startedAt : entry.duration,
            };
            return index >= 0 ? prev.map((m, i) => (i === index ? updated : m)) : [...prev, updated];
          });
          if (p.message) push(`[${p.module}] ${p.message}`, p.status);
          break;
        }
        case 'LOG':
          if (p.message) push(p.message, p.status);
          break;
        case 'RUN_COMPLETE':
          setPhase('complete');
          setFinishedAt(Date.now());
          setReportUrl(p.report_url || null);
          break;
        default:
          break;
      }
    },
  });

  const processRunning = queue.data?.test_process_running;
  const running = phase === 'running' || Boolean(processRunning);
  const nowTs = useNow(running);
  const elapsed = startedAt ? (finishedAt ?? nowTs ?? startedAt) - startedAt : null;

  useEffect(() => {
    if (autoScroll && consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [logs, autoScroll]);

  const counts = useMemo(() => ({
    all: modules.length,
    passed: modules.filter((m) => ['completed', 'passed'].includes(m.status)).length,
    failed: modules.filter((m) => m.status === 'failed').length,
    running: modules.filter((m) => m.status === 'running').length,
    pending: modules.filter((m) => m.status === 'pending').length,
  }), [modules]);

  const done = counts.passed + counts.failed;
  const progress = modules.length ? (done * 100) / modules.length : 0;
  const currentModule = modules.find((m) => m.status === 'running');
  const activeRun = queue.data?.active?.[0];

  const visibleModules = modules.filter((m) => {
    if (filter === 'all') return true;
    if (filter === 'passed') return ['completed', 'passed'].includes(m.status);
    if (filter === 'failed') return m.status === 'failed';
    if (filter === 'running') return m.status === 'running';
    return m.status === 'pending';
  });

  const visibleLogs = useMemo(() => {
    if (level === 'all') return logs;
    if (level === 'errors') return logs.filter((l) => ['FAILED', 'ERROR', 'FAIL'].includes(l.status));
    return logs.filter((l) => l.status !== 'PROGRESS');
  }, [logs, level]);

  const stopRun = async () => {
    setStopping(true);
    try {
      await apiFetch('/test/stop-test', { method: 'POST' });
      push('Stop requested by the user', 'INFO');
    } catch (err) {
      push(`Could not stop the run: ${err.message}`, 'FAILED');
    } finally {
      setStopping(false);
      queue.reload();
    }
  };

  const socket = {
    [ReadyState.OPEN]: ['online', 'Stream connected'],
    [ReadyState.CONNECTING]: ['starting', 'Connecting…'],
  }[readyState] || ['offline', 'Stream disconnected'];

  return (
    <Page
      description="Execute and monitor the current run in real time — module progress, the runner’s log stream and the devices in use."
      meta={running && <Pill tone="danger"><span className="tap-live-dot" aria-hidden />LIVE</Pill>}
      actions={
        <>
          <StatusBadge status={socket[0]} label={socket[1]} />
          {reportUrl && <Button icon={ExternalLink} href={reportUrl}>Open report</Button>}
          {running
            ? <Button variant="danger" icon={Square} onClick={stopRun} disabled={stopping}>{stopping ? 'Stopping…' : 'Stop execution'}</Button>
            : <Button variant="primary" icon={Play} to="/automation/mobile">Configure a run</Button>}
        </>
      }
    >
      <div className="tap-live-hero">
        <div className="tap-live-progress">
          <ProgressRing value={progress} />
          <div>
            <div className="tap-live-label">Modules complete</div>
            <div className="tap-live-value">{done} / {modules.length || '—'}</div>
            <div className="tap-cell-sub">{counts.passed} passed · {counts.failed} failed</div>
          </div>
        </div>
        <div className="tap-live-facts">
          <div>
            <span className="tap-live-label"><Clock size={13} aria-hidden /> Elapsed</span>
            <strong>{elapsed == null ? '—' : formatDuration(elapsed)}</strong>
            <span className="tap-cell-sub">{finishedAt ? `Finished ${timeAgo(new Date(finishedAt).toISOString())}` : running ? 'Running now' : 'Not started'}</span>
          </div>
          <div>
            <span className="tap-live-label"><Activity size={13} aria-hidden /> Current module</span>
            <strong>{currentModule?.name || (running ? 'Preparing…' : '—')}</strong>
            <span className="tap-cell-sub tap-truncate">{currentModule?.path || 'Waiting for the runner'}</span>
          </div>
          <div>
            <span className="tap-live-label"><Radio size={13} aria-hidden /> Run</span>
            <strong>{activeRun?.app_name || (running ? 'In progress' : 'Idle')}</strong>
            <span className="tap-cell-sub">{activeRun?.variant_label || activeRun?.app_variant || 'Serial execution (one module at a time)'}</span>
          </div>
        </div>
      </div>

      <Grid cols="2-1">
        <Panel title="Modules in this run" icon={ListOrdered} flush
          actions={
            <Tabs
              active={filter}
              onChange={setFilter}
              tabs={[
                { id: 'all', label: 'All', count: counts.all },
                { id: 'passed', label: 'Passed', count: counts.passed },
                { id: 'failed', label: 'Failed', count: counts.failed },
                { id: 'running', label: 'In progress', count: counts.running },
                { id: 'pending', label: 'Pending', count: counts.pending },
              ]}
            />
          }
        >
          <DataTable
            rowKey="name"
            rows={visibleModules}
            empty={
              <EmptyState compact icon={Radio} title={modules.length ? 'No modules match this filter' : 'Waiting for a run'}>
                {modules.length ? null : <>Start one from <Button variant="ghost" to="/automation/mobile">Mobile Testing</Button> and its modules appear here as the runner reports them.</>}
              </EmptyState>
            }
            columns={[
              {
                key: 'name', header: 'Module',
                render: (m) => (
                  <div className="tap-run-row">
                    {m.status === 'running' ? <Loader2 size={15} className="tap-spin" aria-hidden />
                      : m.status === 'failed' ? <XCircle size={15} aria-hidden className="is-danger" />
                      : ['completed', 'passed'].includes(m.status) ? <CheckCircle2 size={15} aria-hidden className="is-success" />
                      : <Circle size={15} aria-hidden />}
                    <div>
                      <div className="tap-cell-main">{m.name}</div>
                      {m.path && <div className="tap-cell-sub tap-mono">{m.path}</div>}
                    </div>
                  </div>
                ),
              },
              { key: 'status', header: 'Status', render: (m) => <StatusBadge status={m.status === 'completed' ? 'passed' : m.status} /> },
              { key: 'duration', header: 'Duration', align: 'right', render: (m) => (m.duration ? formatDuration(m.duration) : '—') },
            ]}
          />
        </Panel>

        <div className="tap-stack">
          <Panel
            title="Live logs" icon={Terminal} flush
            actions={
              <>
                <select className="tap-select is-small" value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Filter log level">
                  <option value="all">All lines</option>
                  <option value="info">Hide progress</option>
                  <option value="errors">Errors only</option>
                </select>
                <Button icon={autoScroll ? Pause : Play} onClick={() => setAutoScroll((v) => !v)}>{autoScroll ? 'Pause scroll' : 'Auto scroll'}</Button>
                <Button icon={Trash2} onClick={() => setLogs([])}>Clear</Button>
              </>
            }
          >
            <div className="tap-console" ref={consoleRef} role="log" aria-live="polite">
              {visibleLogs.length ? visibleLogs.map((l, i) => (
                <div key={i} className={clsx('tap-console-line', `is-${l.status.toLowerCase()}`)}>
                  <span className="tap-console-time">{l.time}</span>
                  <span className="tap-console-level">{l.status}</span>
                  <span className="tap-console-msg">{l.message}</span>
                </div>
              )) : <div className="tap-console-empty">No log output yet.</div>}
            </div>
          </Panel>

          <Panel title="Execution devices" icon={MonitorSmartphone} flush>
            <DataState state={devices} rows={1}>
              {(d) => (
                <DataTable
                  rowKey="serial"
                  rows={d.devices}
                  empty={<EmptyState compact icon={MonitorSmartphone} title={d.adb_available ? 'No devices attached' : 'adb not available'} />}
                  columns={[
                    { key: 'model', header: 'Device', render: (x) => <><div className="tap-cell-main">{x.model || x.serial}</div><div className="tap-cell-sub tap-mono">{x.serial}</div></> },
                    { key: 'state', header: 'Status', render: (x) => <StatusBadge status={x.state} /> },
                  ]}
                />
              )}
            </DataState>
          </Panel>
        </div>
      </Grid>

      <Panel title="Runs in this backend session" icon={Radio} flush subtitle="Held in memory — cleared when the backend restarts">
        <DataState state={queue} rows={2}>
          {(q) => (
            <DataTable
              rowKey="run_id"
              rows={[...q.active, ...q.recent]}
              empty={<EmptyState compact title="No runs started yet in this session" />}
              columns={[
                { key: 'app', header: 'App', render: (r) => <><div className="tap-cell-main">{r.app_name || 'Resolving APK…'}</div><div className="tap-cell-sub">{r.variant_label || r.app_variant || '—'}</div></> },
                { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                { key: 'started', header: 'Started', render: (r) => <span title={formatDateTime(r.started_at)}>{timeAgo(r.started_at)}</span> },
                { key: 'report', header: '', align: 'right', render: (r) => r.report_url && <Button variant="ghost" icon={ExternalLink} href={r.report_url}>Report</Button> },
              ]}
            />
          )}
        </DataState>
      </Panel>
    </Page>
  );
}

/* ─── Scheduled Runs ─────────────────────────────────────────────────────── */

export function ScheduledRunsPage() {
  return (
    <ModuleScaffold
      description="Run suites on a timetable — nightly regression, pre-release smoke tests, hourly API health checks."
      recordsTitle="Schedules"
      columns={[
        { key: 'name', header: 'Schedule' },
        { key: 'suite', header: 'Suite / variant' },
        { key: 'cron', header: 'Cron' },
        { key: 'next', header: 'Next run' },
        { key: 'last', header: 'Last result' },
      ]}
      emptyIcon={CalendarClock}
      emptyTitle="No schedules yet"
      emptyBody="The backend doesn’t have a scheduler yet, so runs start from Mobile Testing or Run Tests. Until one exists, trigger the runner from CI on a cron (see Pipelines)."
      capabilities={[
        'Cron-based schedules per suite and app variant',
        'Pick the APK source: latest Google Drive build or a stored APK',
        'Skip a slot automatically if a run is already in progress',
        'Post the results to Slack and flag failures in Jira',
      ]}
      setup={`# Interim: trigger a nightly run from any CI cron
curl -X POST http://localhost:8000/test/start-test-existing \\
  -H "Content-Type: application/json" \\
  -d '{"apk_name": "farmer_app.apk"}'`}
    />
  );
}
