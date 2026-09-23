import React, { useMemo, useState } from 'react';
import {
  Activity, AlertOctagon, Award, BarChart3, CheckCircle2, ClipboardList, Cpu, Download, ExternalLink, FileBarChart,
  FileText, Gauge, Globe, Loader2, Medal, PieChart, RefreshCw, Rocket, Server, Shuffle, Smartphone, Tag, Timer,
  Webhook, XCircle,
} from 'lucide-react';
import {
  Button, DataState, DataTable, EmptyState, ErrorNotice, Grid, Page, Panel, Pill, ProgressBar, RefreshButton,
  StatCard, StatGrid, StatusBadge, Tabs,
} from '../components/ui/ui';
import {
  CategoryBars, OutcomeBars, PassRateTrend, ReadinessGates, ResultDonut, ScoreRing, VerdictBanner,
} from '../components/insights/Insights';
import { TestTypeBadge, TestTypeFilter } from '../components/ui/TestTypes';
import ResultsTable from './common/ResultsTable';
import useApi from '../hooks/useApi';
import { apiFetch } from '../config/api';
import { downloadCsv, formatDateTime, formatDuration, humanize, passRateTone, pct, timeAgo } from '../utils/format';

function useSummary() {
  return useApi('/reports/summary');
}

const GROUP_COLUMNS = (label) => [
  { key: 'name', header: label, render: (g) => <span className="tap-cell-main">{humanize(g.name)}</span> },
  { key: 'total', header: 'Tests', align: 'right' },
  { key: 'passed', header: 'Passed', align: 'right' },
  { key: 'failed', header: 'Failed', align: 'right', render: (g) => g.failed + g.broken },
  {
    key: 'pass_rate', header: 'Pass rate', width: '30%',
    render: (g) => (
      <div className="tap-inline-bar">
        <ProgressBar value={g.pass_rate} tone={passRateTone(g.pass_rate)} label={`${g.name} pass rate`} />
        <span>{pct(g.pass_rate)}</span>
      </div>
    ),
  },
  { key: 'duration_ms', header: 'Duration', align: 'right', render: (g) => formatDuration(g.duration_ms) },
];

function groupBy(results, key) {
  const groups = {};
  for (const r of results) {
    const name = r[key] || 'Unspecified';
    groups[name] ||= { name, total: 0, passed: 0, failed: 0, broken: 0, skipped: 0, duration_ms: 0 };
    groups[name].total += 1;
    groups[name][r.status] = (groups[name][r.status] || 0) + 1;
    groups[name].duration_ms += r.duration_ms || 0;
  }
  return Object.values(groups).map((g) => ({ ...g, pass_rate: g.total ? Math.round((g.passed * 1000) / g.total) / 10 : null }));
}

/** Counts per test type for the type filter's dropdown. */
function typeCounts(results) {
  return results.reduce((acc, r) => ({ ...acc, [r.test_type]: (acc[r.test_type] || 0) + 1 }), {});
}

function statOf(results) {
  const stat = { passed: 0, failed: 0, broken: 0, skipped: 0, unknown: 0, total: results.length };
  for (const r of results) stat[r.status in stat ? r.status : 'unknown'] += 1;
  return { ...stat, pass_rate: results.length ? Math.round((stat.passed * 1000) / results.length) / 10 : null };
}

/* ─── Platform reports (Mobile / Web) ────────────────────────────────────── */

function PlatformReport({ platform, description, icon, emptyTitle, emptyBody, workspacePath, workspaceLabel }) {
  const state = useSummary();
  const [tab, setTab] = useState('overview');
  const [typeFilter, setTypeFilter] = useState('all');

  const exportCsv = (rows) => downloadCsv(`tap-${platform}-results.csv`, [
    { key: 'name', header: 'Test' },
    { key: 'suite', header: 'Suite' },
    { key: 'test_type_label', header: 'Test Type' },
    { key: 'feature', header: 'Feature' },
    { key: 'status', header: 'Result' },
    { key: 'started_at', header: 'Started' },
    { key: 'duration_ms', header: 'Duration (ms)' },
    { key: 'message', header: 'Message' },
  ], rows);

  return (
    <Page
      description={description}
      actions={
        <>
          <RefreshButton onClick={state.reload} loading={state.loading} />
          <Button icon={ExternalLink} to={workspacePath}>{workspaceLabel}</Button>
        </>
      }
    >
      <DataState state={state}>
        {(s) => {
          const platformResults = s.results.filter((r) => r.platform === platform);
          const results = typeFilter === 'all'
            ? platformResults
            : platformResults.filter((r) => r.test_type === typeFilter);
          const stat = statOf(results);
          const suites = groupBy(results, 'suite');
          const features = groupBy(results, 'feature');
          const hosts = groupBy(results, 'host');
          const failures = results.filter((r) => ['failed', 'broken'].includes(r.status));

          if (!platformResults.length) {
            return (
              <Panel>
                <EmptyState icon={icon} title={emptyTitle} action={<Button variant="primary" to={workspacePath}>{workspaceLabel}</Button>}>
                  {emptyBody}
                </EmptyState>
              </Panel>
            );
          }

          return (
            <>
              <StatGrid>
                <StatCard label="Tests" value={stat.total} icon={ClipboardList} />
                <StatCard label="Passed" value={stat.passed} icon={CheckCircle2} tone="success" />
                <StatCard label="Failed" value={stat.failed + stat.broken} icon={XCircle} tone={stat.failed + stat.broken ? 'danger' : 'muted'} />
                <StatCard label="Pass rate" value={pct(stat.pass_rate)} icon={Activity} tone={passRateTone(stat.pass_rate)} />
                <StatCard label="Duration" value={formatDuration(results.reduce((sum, r) => sum + (r.duration_ms || 0), 0))} icon={Timer} tone="muted"
                  hint={s.finished_at ? `Run finished ${timeAgo(s.finished_at)}` : undefined} />
              </StatGrid>

              <div className="tap-report-toolbar">
                <Tabs
                  active={tab}
                  onChange={setTab}
                  tabs={[
                    { id: 'overview', label: 'Overview', icon: PieChart },
                    { id: 'results', label: 'Results', icon: FileText, count: results.length },
                    { id: 'failures', label: 'Failures', icon: AlertOctagon, count: failures.length },
                  ]}
                />
                <div className="tap-report-tools">
                  <TestTypeFilter value={typeFilter} counts={typeCounts(platformResults)} onChange={setTypeFilter} />
                  <Button icon={Download} onClick={() => exportCsv(results)} disabled={!results.length}>Export CSV</Button>
                </div>
              </div>

              {typeFilter !== 'all' && (
                <p className="tap-hint">
                  Showing {results.length} of {platformResults.length} result(s) for <TestTypeBadge type={typeFilter} />.
                </p>
              )}

              {tab === 'overview' && (
                <>
                  <Grid cols="1-2">
                    <Panel title="Outcome" icon={PieChart}><ResultDonut statistic={stat} passRate={stat.pass_rate} /></Panel>
                    <Panel title="Outcomes by suite" icon={BarChart3}>
                      <OutcomeBars data={suites.map((g) => ({ ...g, label: humanize(g.name) }))} />
                    </Panel>
                  </Grid>
                  <Grid cols={2}>
                    <Panel title="By suite" icon={FileBarChart} flush><DataTable rowKey="name" rows={suites} columns={GROUP_COLUMNS('Suite')} /></Panel>
                    <Panel title="By test type" icon={Tag} flush>
                      <DataTable
                        rowKey="name"
                        rows={groupBy(results, 'test_type_label')}
                        empty={<EmptyState compact title="No results to group" />}
                        columns={GROUP_COLUMNS('Test type')}
                      />
                    </Panel>
                  </Grid>
                  <Grid cols={2}>
                    <Panel title={platform === 'mobile' ? 'By execution host' : 'By feature'} icon={platform === 'mobile' ? Server : FileBarChart} flush>
                      <DataTable rowKey="name" rows={platform === 'mobile' ? hosts : features} columns={GROUP_COLUMNS(platform === 'mobile' ? 'Host' : 'Feature')} />
                    </Panel>
                    <Panel title="Test type mix" icon={BarChart3}>
                      <OutcomeBars data={groupBy(results, 'test_type_label').map((g) => ({ ...g, label: g.name }))} />
                    </Panel>
                  </Grid>
                </>
              )}

              {tab === 'results' && (
                <Panel title="All results" icon={FileText} flush><ResultsTable results={results} /></Panel>
              )}

              {tab === 'failures' && (
                <Panel title="Failures" icon={AlertOctagon} flush
                  actions={<Button variant="ghost" to="/ai/failure-analysis">Analyse causes</Button>}>
                  <DataTable
                    rows={failures}
                    empty={<EmptyState compact icon={CheckCircle2} title="No failures in this run" />}
                    columns={[
                      { key: 'name', header: 'Test', render: (r) => <><div className="tap-cell-main">{r.name}</div><div className="tap-cell-sub">{humanize(r.suite)}</div></> },
                      { key: 'test_type', header: 'Test Type', render: (r) => <TestTypeBadge type={r.test_type} label={r.test_type_label} /> },
                      { key: 'failed_step', header: 'Failed step', render: (r) => r.failed_step || '—' },
                      { key: 'cause', header: 'Likely cause', render: (r) => <Pill tone="danger">{r.failure?.label}</Pill> },
                      { key: 'message', header: 'Message', render: (r) => <span className="tap-cell-sub tap-clamp">{r.message}</span> },
                    ]}
                  />
                </Panel>
              )}
            </>
          );
        }}
      </DataState>
    </Page>
  );
}

export function MobileReportPage() {
  return (
    <PlatformReport
      platform="mobile"
      icon={Smartphone}
      description="Results of the Appium suites in the latest run, by suite, feature and execution host."
      emptyTitle="No mobile results in the latest run"
      emptyBody="Run an Appium suite and its results appear here as soon as it finishes."
      workspacePath="/automation/mobile"
      workspaceLabel="Mobile Testing"
    />
  );
}

export function WebReportPage() {
  return (
    <PlatformReport
      platform="web"
      icon={Globe}
      description="Results of the Playwright web suites in the latest run, by suite and feature."
      emptyTitle="No web results in the latest run"
      emptyBody="The most recent Allure run only contains mobile suites. Run a web suite from the Web Testing workspace; its results land here automatically."
      workspacePath="/automation/web"
      workspaceLabel="Web Testing"
    />
  );
}

/* ─── API & Performance reports (k6 runs from api_testing) ───────────────── */

function useK6Runs() {
  return useApi('/api-testing/runs?limit=100');
}

function K6Error({ state }) {
  return (
    <ErrorNotice
      error={{ message: /failed to fetch/i.test(state.error.message) ? state.error.message : `${state.error.message} — the API testing module stores runs in MongoDB (MONGO_URL); check it is reachable.` }}
      onRetry={state.reload}
    />
  );
}

export function ApiReportPage() {
  const state = useK6Runs();
  const runs = state.data?.runs || [];
  const totals = runs.reduce((a, r) => ({
    req: a.req + (r.summary?.totalRequests || 0),
    failed: a.failed + (r.summary?.failedRequests || 0),
  }), { req: 0, failed: 0 });

  return (
    <Page
      description="Every API run recorded by the API Testing and Performance Testing workspaces, with request volume and success rate."
      actions={<><RefreshButton onClick={state.reload} loading={state.loading} /><Button icon={Webhook} to="/automation/api">API Testing</Button></>}
    >
      {state.error && !state.data ? <K6Error state={state} /> : (
        <>
          <StatGrid>
            <StatCard label="Runs" value={state.data?.count} icon={Webhook} />
            <StatCard label="Requests sent" value={state.data ? totals.req.toLocaleString() : null} icon={Activity} tone="info" />
            <StatCard label="Failed requests" value={state.data ? totals.failed.toLocaleString() : null} icon={XCircle} tone={totals.failed ? 'danger' : 'muted'} />
            <StatCard label="Overall success" value={state.data && totals.req ? pct(((totals.req - totals.failed) * 100) / totals.req) : '—'} icon={CheckCircle2} tone="success" />
          </StatGrid>
          <Panel title="API runs" icon={Webhook} flush>
            <DataState state={state}>
              {() => (
                <DataTable
                  rows={runs}
                  empty={<EmptyState compact icon={Webhook} title="No API runs yet" action={<Button to="/automation/api">Open API Testing</Button>}>
                    Runs are recorded when a k6 script is executed from the API or Performance workspace.
                  </EmptyState>}
                  columns={[
                    { key: 'scriptName', header: 'Script', render: (r) => <><div className="tap-cell-main">{r.scriptName}</div><div className="tap-cell-sub">{formatDateTime(r.startTime)}</div></> },
                    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                    { key: 'requests', header: 'Requests', align: 'right', render: (r) => (r.summary?.totalRequests ?? 0).toLocaleString() },
                    { key: 'failed', header: 'Failed', align: 'right', render: (r) => (r.summary?.failedRequests ?? 0).toLocaleString() },
                    { key: 'success', header: 'Success', align: 'right', render: (r) => pct(r.summary?.successRate) },
                    { key: 'duration', header: 'Duration', align: 'right', render: (r) => (r.duration != null ? formatDuration(r.duration * 1000) : '—') },
                  ]}
                />
              )}
            </DataState>
          </Panel>
        </>
      )}
    </Page>
  );
}

export function PerformanceReportPage() {
  const state = useK6Runs();
  const runs = (state.data?.runs || []).filter((r) => r.summary);
  const withP95 = runs.filter((r) => r.summary.p95 != null);

  return (
    <Page
      description="Latency percentiles from k6 load runs. Detailed time series live in Grafana (InfluxDB) — open a run’s dashboard from the table."
      actions={<><RefreshButton onClick={state.reload} loading={state.loading} /><Button icon={Gauge} to="/automation/performance">Performance Testing</Button></>}
    >
      {state.error && !state.data ? <K6Error state={state} /> : (
        <>
          <StatGrid>
            <StatCard label="Load runs" value={state.data?.count} icon={Gauge} />
            <StatCard label="Best p95" value={withP95.length ? `${Math.min(...withP95.map((r) => r.summary.p95)).toFixed(0)} ms` : '—'} icon={Timer} tone="success" />
            <StatCard label="Worst p95" value={withP95.length ? `${Math.max(...withP95.map((r) => r.summary.p95)).toFixed(0)} ms` : '—'} icon={Timer} tone="warn" />
            <StatCard label="Avg response" value={runs.length ? `${(runs.reduce((a, r) => a + (r.summary.avgResponseTime || 0), 0) / runs.length).toFixed(0)} ms` : '—'} icon={Activity} tone="info" />
          </StatGrid>
          <Panel title="Load runs" icon={Gauge} flush>
            <DataState state={state}>
              {() => (
                <DataTable
                  rows={runs}
                  empty={<EmptyState compact icon={Gauge} title="No load runs yet" action={<Button to="/automation/performance">Start a load test</Button>} />}
                  columns={[
                    { key: 'scriptName', header: 'Script', render: (r) => <><div className="tap-cell-main">{r.scriptName}</div><div className="tap-cell-sub">{formatDateTime(r.startTime)}</div></> },
                    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                    { key: 'avg', header: 'Avg', align: 'right', render: (r) => `${(r.summary.avgResponseTime || 0).toFixed(0)} ms` },
                    { key: 'p95', header: 'p95', align: 'right', render: (r) => (r.summary.p95 != null ? `${r.summary.p95.toFixed(0)} ms` : '—') },
                    { key: 'p99', header: 'p99', align: 'right', render: (r) => (r.summary.p99 != null ? `${r.summary.p99.toFixed(0)} ms` : '—') },
                    { key: 'grafana', header: '', align: 'right', render: (r) => r.outputUrl && <Button variant="ghost" icon={ExternalLink} href={r.outputUrl}>Grafana</Button> },
                  ]}
                />
              )}
            </DataState>
          </Panel>
        </>
      )}
    </Page>
  );
}

/* ─── Quality Score ──────────────────────────────────────────────────────── */

export function QualityScorePage() {
  const intel = useApi('/reports/intelligence');
  const summary = useSummary();
  const [tab, setTab] = useState('score');

  return (
    <Page
      description="A 0–100 quality score for the latest run, with the gates, trends, flaky tests and risk ranking behind it."
      actions={<RefreshButton onClick={() => { intel.reload(); summary.reload(); }} loading={intel.loading} />}
    >
      <DataState state={intel}>
        {(d) => (
          <>
            <StatGrid>
              <StatCard label="Quality score" value={d.quality_score.score ?? '—'} icon={Medal} tone="violet"
                hint={d.quality_score.grade ? `Grade ${d.quality_score.grade} · A ≥ 90 · B ≥ 75 · C ≥ 60` : undefined} />
              <StatCard label="Latest pass rate" value={pct(d.pass_rate)} icon={Activity} tone={passRateTone(d.pass_rate)} />
              <StatCard label="Flaky tests" value={d.flaky.length} icon={Shuffle} tone={d.flaky.length ? 'warn' : 'success'} hint={`${d.tests_tracked} tests tracked`} />
              <StatCard label="High-risk tests" value={d.risk.filter((r) => r.level === 'high').length} icon={AlertOctagon} tone="danger" />
            </StatGrid>

            <VerdictBanner verdict={d.readiness.verdict} />

            <Tabs
              active={tab}
              onChange={setTab}
              tabs={[
                { id: 'score', label: 'Score', icon: Medal },
                { id: 'trend', label: 'Trends', icon: Activity },
                { id: 'flaky', label: 'Flaky tests', icon: Shuffle, count: d.flaky.length },
                { id: 'risk', label: 'Risk', icon: AlertOctagon, count: d.risk.length },
                { id: 'gates', label: 'Gates', icon: Rocket },
              ]}
            />

            {tab === 'score' && (
              <Grid cols="1-2">
                <Panel title="Score" icon={Medal}>
                  <div className="tap-score-hero">
                    <ScoreRing score={d.quality_score.score} grade={d.quality_score.grade} size={170} />
                    <p className="tap-cell-sub">Inputs without data are left out and the weights rebalance.</p>
                  </div>
                </Panel>
                <Panel title="Components" icon={Award} flush>
                  <DataTable
                    rowKey="name"
                    rows={d.quality_score.components}
                    columns={[
                      { key: 'name', header: 'Component', render: (c) => <span className="tap-cell-main">{c.name}</span> },
                      { key: 'weight', header: 'Weight', align: 'right', render: (c) => `${Math.round(c.weight * 100)}%` },
                      {
                        key: 'value', header: 'Value', width: '40%',
                        render: (c) => (c.value == null ? <Pill>No data</Pill> : (
                          <div className="tap-inline-bar">
                            <ProgressBar value={c.value} tone={passRateTone(c.value)} label={c.name} />
                            <span>{pct(c.value)}</span>
                          </div>
                        )),
                      },
                    ]}
                  />
                </Panel>
              </Grid>
            )}

            {tab === 'trend' && (
              <Grid cols={2}>
                <Panel title="Pass rate by run" icon={Activity} subtitle="From Allure history — one point per generated report">
                  <PassRateTrend trend={d.trend} height={260} />
                </Panel>
                <Panel title="Outcomes by run" icon={BarChart3}><OutcomeBars data={d.trend} /></Panel>
                <Panel title="Failure causes (latest run)" icon={AlertOctagon}
                  actions={<Button variant="ghost" to="/ai/failure-analysis">Analyse</Button>}>
                  {d.failure_categories.length
                    ? <CategoryBars categories={d.failure_categories} />
                    : <EmptyState compact icon={CheckCircle2} title="No failures in the latest run" />}
                </Panel>
                <Panel title="By suite" icon={FileBarChart} flush>
                  <DataState state={summary} rows={2}>
                    {(s) => <DataTable rowKey="name" rows={s.by_suite} columns={GROUP_COLUMNS('Suite')} />}
                  </DataState>
                </Panel>
              </Grid>
            )}

            {tab === 'flaky' && (
              <Panel title="Flaky tests" icon={Shuffle} flush
                subtitle="Tests that both passed and failed across report generations; flip rate is how often the outcome changed">
                <DataTable
                  rows={d.flaky}
                  empty={<EmptyState icon={CheckCircle2} title={`No flaky tests across ${d.tests_tracked} tracked test${d.tests_tracked === 1 ? '' : 's'}`}>
                    Detection needs several generated reports; each run adds one entry to every test’s history.
                  </EmptyState>}
                  columns={[
                    { key: 'name', header: 'Test', render: (t) => <span className="tap-cell-main">{t.name}</span> },
                    { key: 'history', header: 'History (old → new)', render: (t) => (
                      <span className="tap-strip" aria-label={t.statuses.join(', ')}>
                        {[...t.statuses].reverse().map((s, i) => <span key={i} className={`tap-strip-cell is-${s}`} title={s} />)}
                      </span>
                    ) },
                    { key: 'flip_rate', header: 'Flip rate', align: 'right', render: (t) => pct(t.flip_rate) },
                    { key: 'fail_rate', header: 'Fail rate', align: 'right', render: (t) => pct(t.fail_rate) },
                    { key: 'last', header: 'Last', render: (t) => <StatusBadge status={t.last_status} /> },
                  ]}
                />
              </Panel>
            )}

            {tab === 'risk' && (
              <Panel title="Risk ranking" icon={AlertOctagon} flush
                subtitle="Heuristic blend of failure rate (50%), instability (30%) and whether the latest run failed (+20)">
                <DataTable
                  rows={d.risk}
                  empty={<EmptyState compact title="No test history to score yet" />}
                  columns={[
                    { key: 'name', header: 'Test', render: (r) => <><div className="tap-cell-main">{r.name}</div><div className="tap-cell-sub">{[humanize(r.suite), r.feature].filter(Boolean).join(' · ') || '—'}</div></> },
                    {
                      key: 'score', header: 'Risk score', width: '28%',
                      render: (r) => (
                        <div className="tap-inline-bar">
                          <ProgressBar value={r.score} tone={{ high: 'danger', medium: 'warn', low: 'success' }[r.level]} label={`${r.name} risk`} />
                          <span>{r.score}</span>
                        </div>
                      ),
                    },
                    { key: 'level', header: 'Level', render: (r) => <StatusBadge status={r.level} /> },
                    { key: 'fail_rate', header: 'Fail rate', align: 'right', render: (r) => pct(r.fail_rate) },
                    { key: 'last', header: 'Last result', render: (r) => <StatusBadge status={r.last_status} /> },
                  ]}
                />
              </Panel>
            )}

            {tab === 'gates' && (
              <Grid cols="2-1">
                <Panel title="Quality gates" icon={Rocket}><ReadinessGates gates={d.readiness.gates} /></Panel>
                <Panel title="Blocking failures" icon={AlertOctagon} flush subtitle="Failed tests tagged blocker or critical">
                  {d.readiness.blocking_failures.length ? (
                    <ul className="tap-feed">
                      {d.readiness.blocking_failures.map((name) => <li key={name}><span className="tap-cell-main">{name}</span></li>)}
                    </ul>
                  ) : (
                    <EmptyState compact icon={CheckCircle2} title="None">
                      Tag critical tests with <code>@allure.severity(allure.severity_level.CRITICAL)</code> so this gate can catch them.
                    </EmptyState>
                  )}
                </Panel>
              </Grid>
            )}
          </>
        )}
      </DataState>
    </Page>
  );
}

/* ─── Allure Report ──────────────────────────────────────────────────────── */

const GROUP_BY = { suite: 'Suite', feature: 'Feature', epic: 'Epic', severity: 'Severity', status: 'Result', platform: 'Platform' };

export function AllureReportPage() {
  const state = useSummary();
  const [tab, setTab] = useState('overview');
  const [groupKey, setGroupKey] = useState('suite');
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  const grouped = useMemo(() => (state.data ? groupBy(state.data.results, groupKey) : []), [state.data, groupKey]);

  const openReport = async () => {
    setBusy('open');
    setMessage(null);
    try {
      const { url } = await apiFetch('/test/allure/start', { method: 'POST' });
      setMessage({ tone: 'info', text: 'Allure is starting…', url });
      setTimeout(() => window.open(url, '_blank', 'noopener'), 2500);
    } catch (err) {
      setMessage({ tone: 'danger', text: `Couldn’t start Allure: ${err.message}` });
    } finally {
      setBusy(null);
    }
  };

  const generate = async () => {
    setBusy('generate');
    setMessage(null);
    try {
      await apiFetch('/test/generate-report', { method: 'POST' });
      setMessage({ tone: 'info', text: 'Report generation started — refresh in a few seconds.' });
    } catch (err) {
      setMessage({ tone: 'danger', text: `Couldn’t generate the report: ${err.message}` });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page
      description="The Allure report for the latest run. Generating writes allure-report/ from allure-results/ and updates the history behind the trends."
      actions={
        <>
          <Button icon={busy === 'generate' ? Loader2 : RefreshCw} onClick={generate} disabled={Boolean(busy)} className={busy === 'generate' ? 'is-spinning' : undefined}>Generate report</Button>
          <Button variant="primary" icon={busy === 'open' ? Loader2 : ExternalLink} onClick={openReport} disabled={Boolean(busy)}>Open Allure</Button>
        </>
      }
    >
      {message && (
        <div className={`tap-notice tone-${message.tone}`}>
          {message.text}
          {message.url && <> If it doesn’t open, go to <a href={message.url} target="_blank" rel="noreferrer">{message.url}</a>.</>}
        </div>
      )}
      <DataState state={state}>
        {(s) => (
          <>
            <StatGrid>
              <StatCard label="Tests" value={s.statistic.total} icon={ClipboardList} />
              <StatCard label="Passed" value={s.statistic.passed} icon={CheckCircle2} tone="success" />
              <StatCard label="Failed / broken" value={s.statistic.failed + s.statistic.broken} icon={XCircle} tone={s.statistic.failed + s.statistic.broken ? 'danger' : 'muted'} />
              <StatCard label="Pass rate" value={pct(s.pass_rate)} icon={Activity} tone={passRateTone(s.pass_rate)} />
              <StatCard label="Duration" value={formatDuration(s.duration_ms)} icon={Timer} tone="muted" hint={s.finished_at ? `Finished ${timeAgo(s.finished_at)}` : undefined} />
            </StatGrid>

            <Tabs
              active={tab}
              onChange={setTab}
              tabs={[
                { id: 'overview', label: 'Overview', icon: PieChart },
                { id: 'results', label: 'All results', icon: FileText, count: s.results.length },
                { id: 'custom', label: 'Custom view', icon: BarChart3 },
              ]}
            />

            {tab === 'overview' && (
              <Grid cols="1-2">
                <Panel title="Outcome" icon={PieChart} subtitle={s.report_available ? 'Generated report found in allure-report/' : 'No generated report yet — use Generate report'}>
                  <ResultDonut statistic={s.statistic} passRate={s.pass_rate} />
                </Panel>
                <Panel title="By suite" icon={FileBarChart} flush><DataTable rowKey="name" rows={s.by_suite} columns={GROUP_COLUMNS('Suite')} /></Panel>
                <Panel title="By severity" icon={Award} flush><DataTable rowKey="name" rows={s.by_severity} columns={GROUP_COLUMNS('Severity')} /></Panel>
                <Panel title="By feature" icon={FileBarChart} flush><DataTable rowKey="name" rows={s.by_feature} columns={GROUP_COLUMNS('Feature')} /></Panel>
              </Grid>
            )}

            {tab === 'results' && <Panel title="All results" icon={FileText} flush><ResultsTable results={s.results} /></Panel>}

            {tab === 'custom' && (
              <>
                <Panel>
                  <div className="tap-toolbar is-plain">
                    <label className="tap-field">
                      <span>Group results by</span>
                      <select className="tap-select" value={groupKey} onChange={(e) => setGroupKey(e.target.value)}>
                        {Object.entries(GROUP_BY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </label>
                    <Button icon={Download} onClick={() => downloadCsv(`tap-allure-by-${groupKey}.csv`, [
                      { key: 'name', header: GROUP_BY[groupKey] }, { key: 'total', header: 'Tests' }, { key: 'passed', header: 'Passed' },
                      { key: 'failed', header: 'Failed' }, { key: 'pass_rate', header: 'Pass rate %' }, { key: 'duration_ms', header: 'Duration (ms)' },
                    ], grouped)} disabled={!grouped.length}>Export CSV</Button>
                  </div>
                </Panel>
                <Panel title={`Outcomes by ${GROUP_BY[groupKey].toLowerCase()}`} icon={BarChart3}>
                  <OutcomeBars data={grouped.map((g) => ({ ...g, label: humanize(g.name) }))} />
                </Panel>
                <Panel title="Report table" icon={FileText} flush>
                  <DataTable rowKey="name" rows={grouped} columns={GROUP_COLUMNS(GROUP_BY[groupKey])} empty={<EmptyState compact title="No results" />} />
                </Panel>
              </>
            )}
          </>
        )}
      </DataState>
    </Page>
  );
}
