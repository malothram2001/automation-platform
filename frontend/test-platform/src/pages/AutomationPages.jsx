/**
 * Automation workspaces: configure, execute, monitor and analyse one type of
 * testing. These are not test-case lists — the inventory lives in
 * Test Management → Test Cases.
 */
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  AppWindow, Boxes, CheckCircle2, CircleDashed, ClipboardList, Copy, Cpu, FileCode2, FileJson, FolderGit2, Globe,
  LayoutDashboard, MonitorSmartphone, Package, Play, Power, Server, Settings2, Smartphone, Workflow, XCircle,
} from 'lucide-react';
import {
  Button, CodeBlock, DataState, DataTable, EmptyState, Field, Grid, Page, Panel, Pill, ProgressBar, RefreshButton,
  StatCard, StatGrid, StatusBadge, Tabs, Toggle,
} from '../components/ui/ui';
import CaseTable from './common/CaseTable';
import useApi from '../hooks/useApi';
import { apiFetch } from '../config/api';
import { useWorkspace } from '../context/workspaceContext';
import { formatDuration, humanize, passRateTone, pct, timeAgo } from '../utils/format';

/* ─── Shared bits ────────────────────────────────────────────────────────── */

function useCopy() {
  const [copied, setCopied] = useState(false);
  return [copied, async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }];
}

function WorkerSlider({ value, max, onChange }) {
  return (
    <Field label={`Parallel workers — ${value}`} hint={`Up to ${max} on this machine`}>
      <input className="tap-range" type="range" min="1" max={Math.max(max, 1)} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
    </Field>
  );
}

function outcomeStats(results) {
  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => ['failed', 'broken'].includes(r.status)).length;
  return { passed, failed, total: results.length, passRate: results.length ? (passed * 100) / results.length : null };
}

/* ─── Web Testing ────────────────────────────────────────────────────────── */

const WEB_TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'specs', label: 'Test Specs', icon: FileCode2 },
  { id: 'browsers', label: 'Browsers', icon: AppWindow },
  { id: 'execution', label: 'Execution', icon: Play },
];

export function WebTestingPage() {
  const cases = useApi('/test-management/cases?platform=web');
  const browsers = useApi('/platform/browsers');
  const summary = useApi('/reports/summary');
  const [tab, setTab] = useState('overview');
  const [scope, setScope] = useState('all');
  const [workers, setWorkers] = useState(2);
  const [options, setOptions] = useState({ screenshots: true, video: false, traces: false });
  const [copied, copy] = useCopy();
  const { environment } = useWorkspace();

  const webCases = useMemo(() => cases.data?.cases || [], [cases.data]);
  const suites = useMemo(
    () => [...new Map(webCases.map((c) => [c.suite, { id: c.suite, label: c.suite_label, path: c.file.split('/').slice(0, -1).join('/') }])).values()],
    [webCases],
  );
  const results = (summary.data?.results || []).filter((r) => r.platform === 'web');
  const stats = outcomeStats(results);
  const installed = browsers.data?.browsers.filter((b) => b.installed) || [];
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;

  const target = scope === 'all' ? suites.map((s) => s.path).join(' ') || 'tests/web_automation' : suites.find((s) => s.id === scope)?.path;
  const command = [
    `pytest ${target}`,
    workers > 1 ? `-n ${workers} --dist loadfile` : '',
    '--alluredir=allure-results',
    options.traces ? '--tracing=retain-on-failure' : '',
  ].filter(Boolean).join(' ');

  const runPanel = (
    <Panel title="Run web tests" icon={Play} subtitle={`Environment: ${humanize(environment || 'not set')}`}>
      <div className="tap-form-grid">
        <Field label="Test selection" wide>
          <select className="tap-select" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="all">All web suites ({webCases.length} tests)</option>
            {suites.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Browser" hint="Set in tests/web_automation/conftest.py" wide>
          <select className="tap-select" value="chromium" disabled>
            <option value="chromium">Chromium (Playwright, headed)</option>
          </select>
        </Field>
        <div className="tap-form-field is-wide">
          <WorkerSlider value={workers} max={cores} onChange={setWorkers} />
        </div>
      </div>
      <div className="tap-toggle-row">
        <Toggle label="Take screenshots" checked={options.screenshots} onChange={(v) => setOptions({ ...options, screenshots: v })} />
        <Toggle label="Record video" checked={options.video} onChange={(v) => setOptions({ ...options, video: v })} />
        <Toggle label="Retain traces on failure" checked={options.traces} onChange={(v) => setOptions({ ...options, traces: v })} />
      </div>
      <p className="tap-hint">
        The backend runner drives Appium, so web suites are started from a terminal. Copy the command for the configuration above:
      </p>
      <CodeBlock>{command}</CodeBlock>
      <div className="tap-panel-footer-actions">
        <Button variant="primary" icon={Copy} onClick={() => copy(command)}>{copied ? 'Copied' : 'Copy command'}</Button>
      </div>
    </Panel>
  );

  return (
    <Page
      description="Playwright web automation: specs in the repository, the browsers available to run them, and the execution configuration."
      meta={<StatusBadge status={installed.length ? 'connected' : 'not_configured'} label={installed.length ? 'Browsers ready' : 'No browsers'} />}
      actions={<RefreshButton onClick={() => { cases.reload(); browsers.reload(); summary.reload(); }} loading={cases.loading} />}
    >
      <StatGrid>
        <StatCard label="Test specs" value={cases.data?.total} icon={FileCode2} to="/test-management/cases" />
        <StatCard label="Passed (last run)" value={stats.passed} icon={CheckCircle2} tone="success" />
        <StatCard label="Failed (last run)" value={stats.failed} icon={XCircle} tone={stats.failed ? 'danger' : 'muted'} />
        <StatCard label="Pass rate" value={pct(stats.passRate)} icon={Globe} tone={passRateTone(stats.passRate)} hint={stats.total ? undefined : 'No web results yet'} />
        <StatCard label="Browsers" value={browsers.data ? installed.length : null} icon={AppWindow} tone="violet"
          hint={installed.map((b) => b.name.split(' ').pop()).join(', ') || undefined} />
      </StatGrid>

      <Tabs tabs={WEB_TABS} active={tab} onChange={setTab} />

      {tab === 'overview' && (
        <Grid cols="2-1">
          <div className="tap-stack">
            <Panel title="Repository" icon={FolderGit2} subtitle="Specs discovered from the working tree">
              <dl className="tap-dl is-compact">
                <dt>Suites</dt>
                <dd>{suites.map((s) => <div key={s.id}><span className="tap-cell-main">{s.label}</span> <span className="tap-mono">{s.path}</span></div>)}</dd>
                <dt>Framework</dt><dd>Playwright (sync API) via pytest fixtures</dd>
                <dt>Results</dt><dd>Written to <span className="tap-mono">allure-results/</span></dd>
              </dl>
            </Panel>
            <Panel title="Last run — web specs" icon={Globe} flush>
              <DataTable
                rows={results}
                empty={<EmptyState compact icon={CircleDashed} title="No web results in the latest Allure run">
                  The most recent run only contains mobile suites. Run a web suite with the command in Execution.
                </EmptyState>}
                columns={[
                  { key: 'name', header: 'Spec', render: (r) => <><div className="tap-cell-main">{r.name}</div>{r.message && <div className="tap-cell-sub tap-clamp">{r.message}</div>}</> },
                  { key: 'status', header: 'Result', render: (r) => <StatusBadge status={r.status} /> },
                  { key: 'duration', header: 'Duration', align: 'right', render: (r) => formatDuration(r.duration_ms) },
                ]}
              />
            </Panel>
          </div>
          {runPanel}
        </Grid>
      )}

      {tab === 'specs' && (
        <Panel title="Web test specs" icon={FileCode2} flush>
          <DataState state={cases}>{(d) => <CaseTable cases={d.cases} />}</DataState>
        </Panel>
      )}

      {tab === 'browsers' && (
        <DataState state={browsers}>
          {(d) => (
            <>
              <div className="tap-card-grid">
                {d.browsers.map((b) => (
                  <Panel key={b.name} title={b.name} icon={AppWindow}
                    actions={<StatusBadge status={b.installed ? 'installed' : 'not_run'} label={b.installed ? 'Available' : 'Not found'} />}>
                    <dl className="tap-dl is-compact">
                      <dt>Path</dt><dd className="tap-mono tap-truncate" title={b.path || ''}>{b.path || '—'}</dd>
                      <dt>Driver</dt>
                      <dd>
                        <span className="tap-mono">{b.driver}</span>{' '}
                        {b.driver_on_path ? <Pill tone="success">on PATH</Pill>
                          : d.selenium_manager && b.installed ? <Pill tone="primary">auto-managed</Pill>
                          : <Pill>not found</Pill>}
                      </dd>
                    </dl>
                  </Panel>
                ))}
              </div>
              <Panel title="Driver management" icon={Cpu}>
                <dl className="tap-dl is-compact">
                  <dt>Selenium</dt><dd>{d.selenium_version || 'Not installed'}</dd>
                  <dt>Selenium Manager</dt><dd>{d.selenium_manager ? 'Resolves drivers automatically' : 'Drivers must be on PATH'}</dd>
                  <dt>Remote grid</dt><dd>{d.grid_url_configured ? 'SELENIUM_GRID_URL is set' : 'Local browsers only (set SELENIUM_GRID_URL to use a grid)'}</dd>
                </dl>
              </Panel>
            </>
          )}
        </DataState>
      )}

      {tab === 'execution' && (
        <Grid cols="1-2">
          {runPanel}
          <Panel title="How web runs reach the reports" icon={Workflow}>
            <ol className="tap-steps-list">
              <li><Play size={15} aria-hidden />Run the command above from the project root.</li>
              <li><FileJson size={15} aria-hidden />pytest writes results into <code>allure-results/</code>.</li>
              <li><Globe size={15} aria-hidden />They appear in Web Report and Allure Report as soon as the run finishes.</li>
            </ol>
            <p className="tap-hint">
              A backend endpoint that starts web suites from this screen would remove the copy-paste step; the runner currently only
              exposes an Appium flow.
            </p>
          </Panel>
        </Grid>
      )}
    </Page>
  );
}

/* ─── Mobile Testing ─────────────────────────────────────────────────────── */

const MOBILE_TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'devices', label: 'Devices', icon: MonitorSmartphone },
  { id: 'builds', label: 'App Builds', icon: Package },
  { id: 'specs', label: 'Test Specs', icon: FileCode2 },
];

export function MobileTestingPage() {
  const navigate = useNavigate();
  const { variant: contextVariant } = useWorkspace();
  const cases = useApi('/test-management/cases?platform=mobile');
  const devices = useApi('/platform/devices', { interval: 10000 });
  const appium = useApi('/test/appium/status', { interval: 10000 });
  const apks = useApi('/test/apk-list');
  const matrix = useApi('/test-management/matrix');
  const summary = useApi('/reports/summary');

  const [tab, setTab] = useState('overview');
  const [variant, setVariant] = useState(null);
  const [modules, setModules] = useState(null);      // null = every module of the variant
  const [apk, setApk] = useState('');
  const [workers, setWorkers] = useState(1);
  const [options, setOptions] = useState({ screenshots: true, video: false, logs: true, network: false });
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  const variants = matrix.data?.variants || [];
  const activeVariant = variants.find((v) => v.id === (variant ?? (contextVariant !== 'all' ? contextVariant : variants[0]?.id)));
  const runnable = (activeVariant?.modules || []).filter((m) => m.exists);
  const selectedModules = modules ?? runnable.map((m) => m.module);

  const online = devices.data?.devices.filter((d) => d.state === 'device') || [];
  const appiumUp = appium.data?.status === 'running';
  const results = (summary.data?.results || []).filter((r) => r.platform === 'mobile');
  const stats = outcomeStats(results);

  const toggleAppium = async () => {
    setBusy('appium');
    setMessage(null);
    try {
      await apiFetch(`/test/appium/${appiumUp ? 'stop' : 'start'}`, { method: 'POST' });
      setTimeout(appium.reload, 1500);   // Appium needs a moment to bind its port
    } catch (err) {
      setMessage({ tone: 'danger', text: `Appium: ${err.message}` });
    } finally {
      setBusy(null);
    }
  };

  const blockers = [
    !appiumUp && 'the Appium server is stopped',
    !online.length && 'no device is connected',
    !apk && 'no APK build is selected',
    !selectedModules.length && 'no module is selected',
  ].filter(Boolean);

  const runTests = async () => {
    setBusy('run');
    setMessage(null);
    try {
      const tests_to_run = runnable
        .filter((m) => selectedModules.includes(m.module))
        .map((m) => ({ name: m.module, path: m.path }));
      await apiFetch('/test/start-test-existing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apk_name: apk, tests_to_run }),
      });
      navigate('/execution/live');
    } catch (err) {
      setMessage({ tone: 'danger', text: `Couldn’t start the run: ${err.message}` });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page
      description="Appium automation for the Krishivaas Android apps: variants, builds, the device farm and the run configuration."
      meta={<StatusBadge status={appiumUp ? 'connected' : 'not_configured'} label={appiumUp ? 'Appium connected' : 'Appium stopped'} />}
      actions={
        <>
          <Button icon={Power} onClick={toggleAppium} disabled={busy === 'appium'}>{appiumUp ? 'Stop Appium' : 'Start Appium'}</Button>
          <Button variant="primary" icon={Play} onClick={runTests} disabled={Boolean(busy) || blockers.length}
            title={blockers.length ? `Can’t run yet: ${blockers.join(', ')}` : 'Start the selected modules'}>
            {busy === 'run' ? 'Starting…' : 'Run Tests'}
          </Button>
        </>
      }
    >
      {message && <div className={`tap-notice tone-${message.tone}`}>{message.text}</div>}

      <StatGrid>
        <StatCard label="Mobile test cases" value={cases.data?.total} icon={ClipboardList} to="/test-management/cases" />
        <StatCard label="Passed (last run)" value={stats.passed} icon={CheckCircle2} tone="success" />
        <StatCard label="Failed (last run)" value={stats.failed} icon={XCircle} tone={stats.failed ? 'danger' : 'muted'} />
        <StatCard label="Devices online" value={devices.data ? online.length : null} icon={Smartphone} tone={online.length ? 'success' : 'muted'}
          hint={devices.data && !devices.data.adb_available ? 'adb not on PATH' : undefined} />
        <StatCard label="App builds" value={apks.data?.apks.length} icon={Package} tone="violet" hint="backend/temp_apks" />
      </StatGrid>

      <Tabs tabs={MOBILE_TABS} active={tab} onChange={setTab} />

      {tab === 'overview' && (
        <Grid cols="2-1">
          <div className="tap-stack">
            <Panel title="Application & variants" icon={Boxes} subtitle="Pick the variant and the modules to run">
              <DataState state={matrix} rows={2}>
                {() => (
                  <>
                    <div className="tap-chip-choices">
                      {variants.map((v) => (
                        <button key={v.id} type="button"
                          className={clsx('tap-choice', activeVariant?.id === v.id && 'is-selected')}
                          onClick={() => { setVariant(v.id); setModules(null); }}>
                          <span className="tap-cell-main">{v.label}</span>
                          <span className="tap-cell-sub">{v.modules.filter((m) => m.exists).length} of {v.modules.length} modules ready</span>
                        </button>
                      ))}
                    </div>
                    <div className="tap-module-picker">
                      {(activeVariant?.modules || []).map((m) => {
                        const checked = selectedModules.includes(m.module);
                        return (
                          <label key={m.module} className={clsx('tap-check', checked && m.exists && 'is-checked', !m.exists && 'is-disabled')}>
                            <input type="checkbox" checked={checked && m.exists} disabled={!m.exists}
                              onChange={(e) => setModules(
                                e.target.checked ? [...selectedModules, m.module] : selectedModules.filter((x) => x !== m.module),
                              )} />
                            <span className="tap-check-body">
                              <span className="tap-cell-main">{m.module}</span>
                              <span className="tap-cell-sub tap-mono">{m.exists ? `${m.test_count} test${m.test_count === 1 ? '' : 's'}` : 'no test file'}</span>
                            </span>
                            {m.exists && <StatusBadge status={m.status} />}
                          </label>
                        );
                      })}
                    </div>
                  </>
                )}
              </DataState>
            </Panel>

            <Panel title="App builds" icon={Package} flush subtitle="APKs downloaded to the backend host">
              <DataState state={apks} rows={2}>
                {(d) => (
                  <DataTable
                    rowKey={(name) => name}
                    rows={d.apks}
                    empty={<EmptyState compact icon={Package} title="No APK builds yet">
                      Download one from a Google Drive link in <Button variant="ghost" to="/execution/run-tests">Run Tests</Button>.
                    </EmptyState>}
                    columns={[
                      { key: 'name', header: 'Build', render: (name) => <span className="tap-mono">{name}</span> },
                      {
                        key: 'select', header: '', align: 'right',
                        render: (name) => (
                          <Button variant={apk === name ? 'primary' : 'secondary'} onClick={() => setApk(name)}>
                            {apk === name ? 'Selected' : 'Select'}
                          </Button>
                        ),
                      },
                    ]}
                  />
                )}
              </DataState>
            </Panel>
          </div>

          <div className="tap-stack">
            <Panel title="Automation framework" icon={Server}>
              <dl className="tap-dl is-compact">
                <dt>Framework</dt><dd>Appium (UiAutomator2)</dd>
                <dt>Server</dt><dd><span className="tap-mono">http://127.0.0.1:{appium.data?.port || 4723}</span></dd>
                <dt>Status</dt><dd><StatusBadge status={appiumUp ? 'connected' : 'not_run'} label={appiumUp ? 'Running' : 'Stopped'} /></dd>
              </dl>
              <div className="tap-panel-footer-actions">
                <Button icon={Power} onClick={toggleAppium} disabled={busy === 'appium'}>{appiumUp ? 'Stop server' : 'Start server'}</Button>
                <Button onClick={appium.reload}>Test connection</Button>
              </div>
            </Panel>

            <Panel title="Execution configuration" icon={Settings2}>
              <Field label="Device" hint={online.length ? undefined : 'Connect a device or start an emulator'}>
                <select className="tap-select" disabled={online.length <= 1}>
                  {online.length
                    ? online.map((d) => <option key={d.serial} value={d.serial}>{d.model || d.serial}{d.android_version ? ` — Android ${d.android_version}` : ''}</option>)
                    : <option>No device connected</option>}
                </select>
              </Field>
              <WorkerSlider value={workers} max={Math.max(online.length, 1)} onChange={setWorkers} />
              <div className="tap-toggle-row is-column">
                <Toggle label="Take screenshots" checked={options.screenshots} onChange={(v) => setOptions({ ...options, screenshots: v })} />
                <Toggle label="Record video" checked={options.video} onChange={(v) => setOptions({ ...options, video: v })} />
                <Toggle label="Collect device logs" checked={options.logs} onChange={(v) => setOptions({ ...options, logs: v })} />
                <Toggle label="Network simulation" checked={options.network} onChange={(v) => setOptions({ ...options, network: v })} />
              </div>
              {blockers.length > 0 && (
                <p className="tap-hint">Before running: {blockers.join(', ')}.</p>
              )}
              <div className="tap-panel-footer-actions">
                <Button variant="primary" icon={Play} onClick={runTests} disabled={Boolean(busy) || blockers.length}>
                  {busy === 'run' ? 'Starting…' : `Run ${selectedModules.length} module${selectedModules.length === 1 ? '' : 's'}`}
                </Button>
              </div>
            </Panel>
          </div>
        </Grid>
      )}

      {tab === 'devices' && (
        <DataState state={devices}>
          {(d) => (!d.adb_available ? (
            <Panel><EmptyState icon={Smartphone} title="adb isn’t on the backend host’s PATH">
              Install Android platform-tools and restart the backend.
            </EmptyState></Panel>
          ) : d.devices.length ? (
            <div className="tap-card-grid">
              {d.devices.map((dev) => (
                <Panel key={dev.serial} title={dev.model || dev.serial} icon={dev.kind === 'emulator' ? MonitorSmartphone : Smartphone}
                  actions={<StatusBadge status={dev.state} label={dev.state === 'device' ? 'Available' : undefined} />}>
                  <dl className="tap-dl is-compact">
                    <dt>Serial</dt><dd className="tap-mono">{dev.serial}</dd>
                    <dt>Type</dt><dd>{dev.kind === 'emulator' ? 'Emulator' : 'Physical device'}</dd>
                    {dev.manufacturer && (<><dt>Manufacturer</dt><dd>{dev.manufacturer}</dd></>)}
                    {dev.android_version && (<><dt>Android</dt><dd>{dev.android_version}</dd></>)}
                  </dl>
                  {dev.state === 'unauthorized' && <p className="tap-hint">Accept the USB debugging prompt on the device.</p>}
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState icon={Smartphone} title="No devices connected">
              Connect a phone with USB debugging enabled, or start an emulator, then check with <code>adb devices</code>.
            </EmptyState></Panel>
          ))}
        </DataState>
      )}

      {tab === 'builds' && (
        <Panel title="App builds" icon={Package} flush subtitle="APKs on the backend host, selectable for a run">
          <DataState state={apks}>
            {(d) => (
              <DataTable
                rowKey={(name) => name}
                rows={d.apks}
                empty={<EmptyState compact icon={Package} title="No APK builds downloaded yet" />}
                columns={[
                  { key: 'name', header: 'Build', render: (name) => <span className="tap-mono">{name}</span> },
                  { key: 'state', header: 'Selected', render: (name) => (apk === name ? <StatusBadge status="configured" label="Selected" /> : '—') },
                  { key: 'select', header: '', align: 'right', render: (name) => <Button onClick={() => setApk(name)}>Select</Button> },
                ]}
              />
            )}
          </DataState>
        </Panel>
      )}

      {tab === 'specs' && (
        <Panel title="Mobile test specs" icon={FileCode2} flush>
          <DataState state={cases}>{(d) => <CaseTable cases={d.cases} />}</DataState>
        </Panel>
      )}
    </Page>
  );
}

/* ─── Custom Automation (recorded flows) ─────────────────────────────────── */

export function CustomAutomationPage() {
  const flows = useApi('/test-management/flows');
  const [selected, setSelected] = useState(null);
  const flow = useApi(selected ? `/test-management/flows/${encodeURIComponent(selected)}` : null);

  return (
    <Page
      description="Step-by-step flows recorded by the test flow logger into test-flows/*.json — reusable building blocks for custom automation."
      actions={<RefreshButton onClick={flows.reload} loading={flows.loading} />}
    >
      <DataState state={flows}>
        {(d) => {
          const usable = d.flows.filter((f) => f.steps > 0);
          const steps = d.flows.reduce((sum, f) => sum + f.steps, 0);
          return (
            <>
              <StatGrid>
                <StatCard label="Recorded flows" value={d.flows.length} icon={Workflow} />
                <StatCard label="With steps" value={usable.length} icon={CheckCircle2} tone="success" hint={`${d.flows.length - usable.length} empty`} />
                <StatCard label="Steps captured" value={steps} icon={FileJson} tone="violet" />
              </StatGrid>

              <Grid cols="1-2">
                <Panel title={`Flows (${d.flows.length})`} icon={Workflow} flush>
                  {d.flows.length ? (
                    <ul className="tap-select-list">
                      {d.flows.map((f) => (
                        <li key={f.id}>
                          <button type="button" className={clsx('tap-select-item', selected === f.id && 'is-selected')} onClick={() => setSelected(f.id)}>
                            <FileJson size={16} aria-hidden />
                            <span className="tap-select-body">
                              <span className="tap-cell-main">{f.name}</span>
                              <span className="tap-cell-sub">{f.steps} step{f.steps === 1 ? '' : 's'} · updated {timeAgo(f.modified_at)}</span>
                            </span>
                            {!f.valid ? <Pill tone="danger">Invalid</Pill>
                              : !f.steps ? <Pill>Empty</Pill>
                              : f.failed ? <Pill tone="danger">{f.failed} failed</Pill>
                              : <Pill tone="success">All passed</Pill>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState compact title="No recorded flows" icon={Workflow}>Flows appear here when tests log their steps to test-flows/.</EmptyState>
                  )}
                </Panel>

                <Panel title={flow.data?.name || 'Flow steps'} icon={ClipboardList}
                  subtitle={flow.data ? `${flow.data.steps.length} recorded steps` : undefined}>
                  {!selected ? (
                    <EmptyState compact icon={Workflow} title="Select a flow">Pick a recorded flow to see its steps.</EmptyState>
                  ) : (
                    <DataState state={flow}>
                      {(f) => (f.steps.length ? (
                        <>
                          <ProgressBar
                            value={(f.steps.filter((s) => String(s.status).toLowerCase() === 'success').length * 100) / f.steps.length}
                            tone="success" label="Steps that passed"
                          />
                          <ol className="tap-timeline">
                            {f.steps.map((s, i) => {
                              const ok = String(s.status).toLowerCase() === 'success';
                              return (
                                <li key={i} className={ok ? 'is-ok' : 'is-fail'}>
                                  {ok ? <CheckCircle2 size={16} aria-hidden /> : <XCircle size={16} aria-hidden />}
                                  <div>
                                    <div className="tap-cell-main">{s.step}</div>
                                    <div className="tap-cell-sub">Step {i + 1} · {s.status}{s.value ? ' · with input value' : ''}</div>
                                  </div>
                                </li>
                              );
                            })}
                          </ol>
                        </>
                      ) : (
                        <EmptyState compact icon={CircleDashed} title="This flow has no steps recorded" />
                      ))}
                    </DataState>
                  )}
                </Panel>
              </Grid>
            </>
          );
        }}
      </DataState>
    </Page>
  );
}
