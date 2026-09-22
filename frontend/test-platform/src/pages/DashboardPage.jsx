import React from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, AlertOctagon, ClipboardList, Gauge, History, Medal, MonitorSmartphone, Play, Plug, Shuffle, Target,
} from 'lucide-react';
import {
  Button, DataState, DataTable, EmptyState, Grid, Page, Panel, Pill, ProgressBar, RefreshButton, StatCard, StatGrid, StatusBadge,
} from '../components/ui/ui';
import { PassRateTrend, ResultDonut, VerdictBanner } from '../components/insights/Insights';
import useApi from '../hooks/useApi';
import { formatDuration, humanize, passRateTone, pct, timeAgo } from '../utils/format';

export default function DashboardPage() {
  const state = useApi('/platform/dashboard', { interval: 30000 });

  return (
    <Page
      description="Quality at a glance across mobile, web and API automation — pulled live from the test inventory, the latest Allure run and connected tooling."
      actions={
        <>
          <RefreshButton onClick={state.reload} loading={state.loading} />
          <Button variant="primary" icon={Play} to="/automation/mobile">Run tests</Button>
        </>
      }
    >
      <DataState state={state} rows={4}>
        {(d) => <DashboardBody d={d} />}
      </DataState>
    </Page>
  );
}

function DashboardBody({ d }) {
  const k = d.kpis;
  const lastRun = d.latest_run;

  return (
    <>
      <StatGrid>
        <StatCard label="Test cases" value={k.test_cases} icon={ClipboardList} to="/test-management/cases"
          hint={`${k.mobile_cases} mobile · ${k.web_cases} web · ${k.suites} suites`} />
        <StatCard label="Last pass rate" value={pct(k.last_pass_rate)} icon={Activity} tone={passRateTone(k.last_pass_rate)} to="/reports/mobile"
          hint={k.last_run_at ? `Finished ${timeAgo(k.last_run_at)}` : 'No runs recorded'} />
        <StatCard label="Quality score" value={k.quality_score ?? '—'} icon={Medal} tone="violet" to="/reports/quality-score"
          hint={k.quality_grade ? `Grade ${k.quality_grade}` : 'Needs a completed run'} />
        <StatCard label="Module coverage" value={pct(k.coverage_pct)} icon={Target} tone="info" to="/execution/matrix"
          hint="Planned modules with a test file" />
        <StatCard label="Flaky tests" value={k.flaky_tests} icon={Shuffle} tone={k.flaky_tests ? 'warn' : 'success'} to="/reports/quality-score"
          hint="Pass/fail flips across runs" />
        <StatCard label="Devices online" value={k.devices_connected} icon={MonitorSmartphone} tone={k.devices_connected ? 'success' : 'muted'} to="/automation/mobile"
          hint={`Appium ${k.appium_running ? 'running' : 'stopped'}`} />
      </StatGrid>

      <VerdictBanner verdict={d.readiness} />

      <Grid cols="2-1">
        <Panel title="Pass rate trend" icon={Activity} subtitle="From Allure history, one point per generated report"
          actions={<Button variant="ghost" to="/reports/quality-score">Quality score</Button>}>
          <PassRateTrend trend={d.trend} />
        </Panel>
        <Panel title="Latest run" icon={Gauge}
          subtitle={lastRun.finished_at ? `${timeAgo(lastRun.finished_at)} · ${formatDuration(lastRun.duration_ms)}` : 'No run yet'}>
          <ResultDonut statistic={lastRun.statistic} passRate={lastRun.pass_rate} />
        </Panel>
      </Grid>

      <Grid cols={2}>
        <Panel title="Suites in the latest run" icon={ClipboardList} flush
          actions={<Button variant="ghost" to="/reports/mobile">Mobile report</Button>}>
          <DataTable
            rowKey="name"
            rows={d.by_suite}
            empty={<EmptyState compact title="No suite results yet" />}
            columns={[
              { key: 'name', header: 'Suite', render: (r) => <span className="tap-cell-main">{humanize(r.name)}</span> },
              { key: 'total', header: 'Tests', align: 'right' },
              { key: 'failed', header: 'Failed', align: 'right', render: (r) => r.failed + r.broken },
              {
                key: 'pass_rate', header: 'Pass rate', width: '34%',
                render: (r) => (
                  <div className="tap-inline-bar">
                    <ProgressBar value={r.pass_rate} tone={passRateTone(r.pass_rate)} label={`${r.name} pass rate`} />
                    <span>{pct(r.pass_rate)}</span>
                  </div>
                ),
              },
            ]}
          />
        </Panel>

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
      </Grid>

      <Grid cols={2}>
        <Panel title="Runs this session" icon={History} flush subtitle="Runs started from Run Tests since the backend started"
          actions={<Button variant="ghost" to="/test-management/runs">All runs</Button>}>
          <DataTable
            rowKey="run_id"
            rows={d.recent_runs}
            empty={
              <EmptyState compact title="No runs yet" action={<Button variant="primary" icon={Play} to="/execution/run-tests">Start a run</Button>}>
                Runs are tracked in memory by the backend, so this resets when it restarts.
              </EmptyState>
            }
            columns={[
              { key: 'app', header: 'App', render: (r) => <><div className="tap-cell-main">{r.app_name || 'Resolving APK…'}</div><div className="tap-cell-sub">{r.variant_label || r.app_variant || '—'}</div></> },
              { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'started_at', header: 'Started', render: (r) => timeAgo(r.started_at) },
            ]}
          />
        </Panel>

        <Panel title="Integrations" icon={Plug} subtitle={`${d.integrations.ready} of ${d.integrations.total} tools ready on the backend host`}
          actions={<Button variant="ghost" to="/settings">Manage</Button>}>
          <div className="tap-chip-grid">
            {d.integrations.items.map((i) => (
              <div key={i.id} className="tap-chip-row">
                <span>{i.name}</span>
                <StatusBadge status={i.status} />
              </div>
            ))}
          </div>
        </Panel>
      </Grid>

      <p className="tap-footnote">
        Updated {timeAgo(d.generated_at)} · Jira: {k.jira_created} created this session, {k.jira_pending} awaiting review ·{' '}
        <Link to="/integrations/jira">Open Jira</Link>
      </p>
    </>
  );
}
