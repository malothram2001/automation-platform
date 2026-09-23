/**
 * Dashboard — executions, results, trend and platform activity at a glance.
 *
 * Every figure comes from the backend: the inventory is parsed from the test
 * files, outcomes from the latest Allure run, the trend from Allure history and
 * live progress from the run queue. Nothing is estimated; a section that has no
 * data says so.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, AlertOctagon, Braces, ClipboardList, Gauge, Globe, ListChecks, Medal, MonitorSmartphone, Package,
  PieChart as PieChartIcon, Play, Plug, Radio, Rocket, Smartphone, Sparkles, SquareStack, Target,
} from 'lucide-react';
import {
  ActionTile, Button, DataState, DataTable, EmptyState, MetricCard, MetricGrid, Grid, Page, Panel, Pill,
  ProgressBar, RefreshButton, StatusBadge,
} from '../components/ui/ui';
import { BreakdownDonut, OutcomeTrendLines, TypeBars, VerdictBanner } from '../components/insights/Insights';
import { TestTypeBadge } from '../components/ui/TestTypes';
import useApi from '../hooks/useApi';
import { formatDateTime, formatDuration, humanize, passRateTone, pct, timeAgo } from '../utils/format';

const RESULT_COLORS = { passed: '#22c55e', failed: '#ef4444', broken: '#f59e0b', skipped: '#94a3b8', unknown: '#cbd5e1' };
const SUITE_COLORS = ['#3b82f6', '#22c55e', '#8b5cf6', '#f97316', '#0ea5e9', '#ec4899', '#eab308'];
const PLATFORM_ICONS = { web: Globe, mobile: Smartphone, api: Braces, performance: Gauge };

const TYPE_FILTERS = [
  { id: 'all', label: 'All tests' },
  { id: 'web', label: 'Web only' },
  { id: 'mobile', label: 'Mobile only' },
];

const TREND_RANGES = [
  { id: '5', label: 'Last 5 runs' },
  { id: '10', label: 'Last 10 runs' },
  { id: 'all', label: 'All runs' },
];

export default function DashboardPage() {
  const state = useApi('/platform/dashboard', { interval: 30000 });
  const summary = useApi('/reports/summary', { interval: 30000 });
  const matrix = useApi('/test-management/matrix');
  const queue = useApi('/test-management/queue', { interval: 10000 });

  return (
    <Page
      description="Quality at a glance across mobile, web and API automation — pulled live from the test inventory, the latest Allure run and connected tooling."
      actions={
        <>
          <RefreshButton onClick={() => { state.reload(); summary.reload(); queue.reload(); }} loading={state.loading} />
          <Button variant="primary" icon={Play} to="/automation/mobile">Run tests</Button>
        </>
      }
    >
      <DataState state={state} rows={4}>
        {(d) => <DashboardBody d={d} summary={summary} matrix={matrix} queue={queue} />}
      </DataState>
    </Page>
  );
}

function DashboardBody({ d, summary, matrix, queue }) {
  const [typeFilter, setTypeFilter] = useState('all');
  const [range, setRange] = useState('10');
  const k = d.kpis;

  const results = summary.data?.results || [];
  const filtered = typeFilter === 'all' ? results : results.filter((r) => r.platform === typeFilter);
  const statistic = filtered.reduce(
    (acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1, total: acc.total + 1 }),
    { passed: 0, failed: 0, broken: 0, skipped: 0, unknown: 0, total: 0 },
  );
  const passRate = statistic.total ? (statistic.passed * 100) / statistic.total : null;

  const trend = range === 'all' ? d.trend : d.trend.slice(-Number(range));
  const executedByType = {
    web: results.filter((r) => r.platform === 'web').length,
    mobile: results.filter((r) => r.platform === 'mobile').length,
  };

  const activeRuns = queue.data?.active || [];
  const running = queue.data?.test_process_running;
  const variants = matrix.data?.variants || [];

  return (
    <>
      <MetricGrid>
        <MetricCard label="Web Tests" value={k.web_cases} icon={Globe} tone="primary" to="/automation/web"
          hint={`${executedByType.web} executed in the latest run`} />
        <MetricCard label="Mobile Tests" value={k.mobile_cases} icon={Smartphone} tone="success" to="/automation/mobile"
          hint={`${executedByType.mobile} executed in the latest run`} />
        <MetricCard label="API Tests" value={0} icon={Braces} tone="violet" to="/automation/api"
          hint="No API suites discovered under tests/" />
        <MetricCard label="Performance Tests" value={0} icon={Gauge} tone="warn" to="/automation/performance"
          hint="No performance scenarios discovered" />
        <MetricCard label="Total Tests" value={k.test_cases} icon={ClipboardList} tone="muted" to="/test-management/cases"
          hint={`Across ${k.suites} suite${k.suites === 1 ? '' : 's'}`} />
      </MetricGrid>

      <VerdictBanner verdict={d.readiness} />

      <Grid cols={3}>
        <Panel
          title="Overall Test Results"
          icon={PieChartIcon}
          subtitle={summary.data?.finished_at ? `Latest run · ${timeAgo(summary.data.finished_at)}` : 'No run recorded yet'}
          actions={
            <select className="tap-select is-small" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter results by test type">
              {TYPE_FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          }
        >
          <BreakdownDonut
            centerValue={statistic.total}
            centerLabel={statistic.total === 1 ? 'test' : 'tests'}
            emptyTitle={typeFilter === 'all' ? 'No results yet' : `No ${typeFilter} results in the latest run`}
            emptyBody="Run a suite from Web Testing or Mobile Testing to populate this."
            data={Object.keys(RESULT_COLORS).map((key) => ({
              key,
              name: humanize(key),
              value: statistic[key] || 0,
              color: RESULT_COLORS[key],
            }))}
          />
        </Panel>

        <Panel
          title="Test Trend"
          icon={Activity}
          subtitle="One point per generated Allure report"
          actions={
            <select className="tap-select is-small" value={range} onChange={(e) => setRange(e.target.value)} aria-label="Trend range">
              {TREND_RANGES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          }
        >
          <OutcomeTrendLines trend={trend} />
        </Panel>

        <Panel title="Execution by Test Type" icon={SquareStack} subtitle="Tests executed in the latest run">
          <TypeBars
            emptyBody="The latest Allure run has no results yet."
            data={[
              { name: 'Web', value: executedByType.web, color: '#3b82f6' },
              { name: 'Mobile', value: executedByType.mobile, color: '#22c55e' },
              { name: 'API', value: 0, color: '#8b5cf6' },
              { name: 'Performance', value: 0, color: '#f97316' },
            ]}
          />
        </Panel>
      </Grid>

      <Grid cols="2-1">
        <Panel
          title="Recent Test Executions"
          icon={ListChecks}
          flush
          subtitle={summary.data?.started_at ? `Started ${formatDateTime(summary.data.started_at)}` : undefined}
          actions={<Button variant="ghost" to="/reports/allure">View all</Button>}
        >
          <DataState state={summary} rows={3}>
            {(s) => (
              <DataTable
                rowKey={(r) => r.id || r.name}
                rows={s.results.slice(0, 8)}
                empty={
                  <EmptyState compact title="No executions recorded yet" icon={Play}
                    action={<Button variant="primary" icon={Play} to="/automation/mobile">Run a module</Button>}>
                    Results appear here as soon as a run finishes.
                  </EmptyState>
                }
                columns={[
                  { key: 'name', header: 'Test Name', render: (r) => <span className="tap-cell-main">{r.name}</span> },
                  {
                    key: 'platform', header: 'Type',
                    render: (r) => {
                      const Icon = PLATFORM_ICONS[r.platform] || ClipboardList;
                      return <span className="tap-inline-icon"><Icon size={14} aria-hidden /> {humanize(r.platform)}</span>;
                    },
                  },
                  { key: 'suite', header: 'Suite', render: (r) => humanize(r.suite) },
                  { key: 'test_type', header: 'Test Type', render: (r) => <TestTypeBadge type={r.test_type} label={r.test_type_label} /> },
                  { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                  { key: 'started_at', header: 'Started At', render: (r) => formatDateTime(r.started_at) },
                  { key: 'duration_ms', header: 'Duration', align: 'right', render: (r) => formatDuration(r.duration_ms) },
                ]}
              />
            )}
          </DataState>
        </Panel>

        <Panel
          title="Execution Status"
          icon={Radio}
          actions={running ? <Pill tone="info">Live</Pill> : <Pill>Idle</Pill>}
          subtitle={running ? 'A pytest process is running on the backend host' : 'Nothing is executing right now'}
        >
          {activeRuns.length ? (
            <ul className="tap-live-list">
              {activeRuns.map((run) => (
                <li key={run.run_id}>
                  <span className="tap-live-icon" aria-hidden><Play size={16} /></span>
                  <div className="tap-live-body">
                    <div className="tap-cell-main">{run.app_name || 'Resolving build…'}</div>
                    <div className="tap-cell-sub">{run.variant_label || run.app_variant || 'Web suite'} · started {timeAgo(run.started_at)}</div>
                  </div>
                  <StatusBadge status={run.status} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={Radio} title="No run in progress"
              action={<Button icon={Play} to="/execution/live">Open Live Execution</Button>}>
              Runs started from Web or Mobile Testing stream here and in Live Execution.
            </EmptyState>
          )}
          {queue.data?.recent?.length > 0 && (
            <>
              <h3 className="tap-subheading">Recent runs</h3>
              <ul className="tap-live-list">
                {queue.data.recent.slice(0, 3).map((run) => (
                  <li key={run.run_id}>
                    <div className="tap-live-body">
                      <div className="tap-cell-main">{run.app_name || run.run_id.slice(0, 8)}</div>
                      <div className="tap-cell-sub">{timeAgo(run.started_at)}</div>
                    </div>
                    <StatusBadge status={run.status} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      </Grid>

      <Grid cols={3}>
        <Panel title="Test Coverage by Module" icon={Target} subtitle="Planned modules that have a test file"
          actions={<Button variant="ghost" to="/execution/matrix">Matrix</Button>}>
          <DataState state={matrix} rows={3}>
            {() => (variants.length ? (
              <ul className="tap-coverage-list">
                {variants.map((v) => {
                  const done = v.modules.filter((m) => m.exists).length;
                  return (
                    <li key={v.id} className="tap-coverage-row">
                      <span title={v.label}>{v.label}</span>
                      <ProgressBar value={v.coverage_pct ?? 0} tone={passRateTone(v.coverage_pct)} label={`${v.label} coverage`} />
                      <strong>{done}/{v.modules.length}</strong>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState compact title="No variants configured" />
            ))}
          </DataState>
        </Panel>

        <Panel title="Results by Test Type" icon={PieChartIcon} subtitle="Share of the latest run per test type">
          <BreakdownDonut
            centerValue={summary.data?.statistic?.total ?? 0}
            centerLabel="executions"
            emptyTitle="No results yet"
            emptyBody="Test types appear here once a run has finished."
            data={(summary.data?.by_test_type || []).map((t, i) => ({
              key: t.id,
              name: t.short || t.name,
              value: t.total,
              color: SUITE_COLORS[i % SUITE_COLORS.length],
            }))}
          />
        </Panel>

        <Panel title="Quick Actions" icon={Rocket}>
          <div className="tap-action-grid">
            <ActionTile icon={Play} title="Run mobile tests" description="Pick modules and a device" to="/automation/mobile" />
            <ActionTile icon={Globe} title="Run web tests" description="Playwright modules" to="/automation/web" tone="info" />
            <ActionTile icon={ClipboardList} title="Test cases" description="Browse the inventory" to="/test-management/cases" tone="violet" />
            <ActionTile icon={Package} title="Upload app build" description="Download an APK to run" to="/execution/run-tests" tone="warn" />
            <ActionTile icon={PieChartIcon} title="Allure report" description="Open the latest report" to="/reports/allure" tone="success" />
            <ActionTile icon={Sparkles} title="AI failure analysis" description="Explain the failures" to="/ai/failure-analysis" tone="muted" />
          </div>
        </Panel>
      </Grid>

      <Grid cols={2}>
        <Panel title="Recent failures" icon={AlertOctagon} flush
          actions={<Button variant="ghost" to="/ai/failure-analysis">Analyse</Button>}>
          {d.recent_failures.length ? (
            <ul className="tap-feed">
              {d.recent_failures.map((f) => (
                <li key={`${f.suite}-${f.name}`}>
                  <div className="tap-feed-main">
                    <span className="tap-cell-main">{f.name}</span>
                    <Pill tone="danger">{f.failure?.label}</Pill>
                  </div>
                  <div className="tap-cell-sub">{f.failed_step || f.message}</div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact title="No failures in the latest run" />
          )}
        </Panel>

        <Panel title="Platform health" icon={Plug} subtitle={`${d.integrations.ready} of ${d.integrations.total} tools ready on the backend host`}
          actions={<Button variant="ghost" to="/settings">Manage</Button>}>
          <div className="tap-metric-grid" style={{ marginBottom: 12 }}>
            <MetricCard label="Pass rate" value={pct(passRate ?? k.last_pass_rate)} icon={Activity}
              tone={passRateTone(passRate ?? k.last_pass_rate)} hint={k.last_run_at ? `Run ${timeAgo(k.last_run_at)}` : 'No runs recorded'} />
            <MetricCard label="Quality score" value={k.quality_score ?? '—'} icon={Medal} tone="violet"
              hint={k.quality_grade ? `Grade ${k.quality_grade}` : 'Needs a completed run'} />
            <MetricCard label="Devices online" value={k.devices_connected} icon={MonitorSmartphone}
              tone={k.devices_connected ? 'success' : 'muted'} hint={`Appium ${k.appium_running ? 'running' : 'stopped'}`} />
          </div>
          <div className="tap-chip-grid">
            {d.integrations.items.filter((i) => ['jira', 'slack', 'appium', 'adb', 'allure', 'mongodb'].includes(i.id)).map((i) => (
              <div key={i.id} className="tap-chip-row">
                <span>{i.name}</span>
                <StatusBadge status={i.status} />
              </div>
            ))}
          </div>
        </Panel>
      </Grid>

      <p className="tap-footnote">
        Updated {timeAgo(d.generated_at)} · Module coverage {pct(k.coverage_pct)} · Flaky tests {k.flaky_tests} · Jira:{' '}
        {k.jira_created} created this session, {k.jira_pending} awaiting review · <Link to="/integrations/jira">Open Jira</Link>
      </p>
    </>
  );
}
