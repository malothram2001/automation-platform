/**
 * Automation workspaces: configure, execute, monitor and analyse one type of
 * testing. These are not test-case lists — the inventory lives in
 * Test Management → Test Cases.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  AppWindow, Apple, Bot, Boxes, CheckCircle2, CircleDashed, ClipboardList, Copy, Cpu, Drama, FileCode2, FileJson,
  Gauge, Globe, Monitor, MonitorSmartphone, Package, Play, Power, RefreshCw, Server, Settings2, Smartphone, Tag,
  Users, Workflow, XCircle,
} from 'lucide-react';
import {
  Button, DataState, DataTable, EmptyState, Grid, InfoNote, Page, Panel, Pill, PillTabs, ProgressBar,
  RefreshButton, RunBar, SelectField, StatCard, StatGrid, StatusBadge, StepPanel, SummaryRow, Tabs,
} from '../components/ui/ui';
import CaseTable from './common/CaseTable';
import ModulePicker, { ModuleSearch } from './common/ModulePicker';
import { TestTypeList, TestTypePicker } from '../components/ui/TestTypes';
import { countForTypes } from '../hooks/useTestTypes';
import { moduleVisual } from '../utils/moduleVisuals';
import useApi from '../hooks/useApi';
import { apiFetch } from '../config/api';
import { useWorkspace } from '../context/workspaceContext';
import { formatDuration, passRateTone, pct, timeAgo } from '../utils/format';

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

/** Test cases of the selected modules that carry one of the selected types. */
function selectedCaseCount(modules, typeIds) {
  return modules.reduce((sum, m) => sum + countForTypes(m.type_counts, typeIds), 0);
}

function outcomeStats(results) {
  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => ['failed', 'broken'].includes(r.status)).length;
  return { passed, failed, total: results.length, passRate: results.length ? (passed * 100) / results.length : null };
}

/* ─── Web Testing ────────────────────────────────────────────────────────── */

const WEB_TABS = [
  { id: 'run', label: 'Run Tests', icon: Play },
  { id: 'browsers', label: 'Browsers', icon: AppWindow },
  { id: 'results', label: 'Last Run', icon: Globe },
];

export function WebTestingPage() {
  const navigate = useNavigate();
  const apps = useApi('/api/v1/web/applications');
  const [application, setApplication] = useState(null);
  const activeApp = application || apps.data?.default || null;
  const modulesApi = useApi(activeApp ? `/api/v1/web/modules?application=${activeApp}` : null);
  const browsers = useApi('/api/v1/web/browsers');
  const summary = useApi('/reports/summary');
  const cases = useApi('/test-management/cases?platform=web');

  const [tab, setTab] = useState('run');
  const [selected, setSelected] = useState(null);          // null = every runnable module
  const [query, setQuery] = useState('');
  const [config, setConfig] = useState({ browser: null, headless: 'visible', workers: 1 });
  const [testTypes, setTestTypes] = useState([]);          // [] = every test type
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [copied, copy] = useCopy();

  const modules = modulesApi.data?.modules || [];
  const runnable = modules.filter((m) => m.exists);
  const selectedIds = selected ?? runnable.map((m) => m.id);
  const chosen = runnable.filter((m) => selectedIds.includes(m.id));
  const visible = modules.filter((m) => `${m.name} ${m.description} ${m.path}`.toLowerCase().includes(query.toLowerCase()));

  const browserList = browsers.data?.browsers || [];
  const usableBrowsers = browserList.filter((b) => b.available);
  const browser = config.browser || browsers.data?.default || 'chromium';
  const browserInfo = browserList.find((b) => b.id === browser);
  const results = (summary.data?.results || []).filter((r) => r.platform === 'web');
  const stats = outcomeStats(results);
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;

  const totalTests = selectedCaseCount(chosen, testTypes);
  const typeCounts = modules.reduce((acc, m) => {
    Object.entries(m.type_counts || {}).forEach(([id, n]) => { acc[id] = (acc[id] || 0) + n; });
    return acc;
  }, {});
  const command = [
    `pytest ${chosen.map((m) => m.path).join(' ') || 'tests/web_automation/tests'}`,
    config.workers > 1 ? `-n ${config.workers} --dist loadfile` : '',
    '--alluredir=allure-results',
  ].filter(Boolean).join(' ');   // shown for a terminal run; the platform runs it for you

  const toggle = (id) =>
    setSelected(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  const runModules = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const run = await apiFetch('/api/v1/executions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          test_type: 'web',
          application: activeApp,
          browser,
          modules: chosen.map((m) => m.id),
          test_types: testTypes,
          execution: {
            headless: config.headless === 'headless',
            workers: config.workers,
            parallel: config.workers > 1,
          },
        }),
      });
      navigate(`/execution/live?run=${encodeURIComponent(run.run_id)}`);
    } catch (err) {
      setMessage({ tone: 'danger', text: `Couldn’t start the run: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  const summaryRail = (
    <StepPanel step="3" title="Test Run Summary" icon={ClipboardList}>
      <div className="tap-summary-totals">
        <div className="tap-summary-total">
          <span className="tap-summary-total-icon" aria-hidden><Boxes size={17} /></span>
          <span>
            <span className="tap-summary-total-label">Selected Modules</span>
            <strong>{chosen.length}</strong>
          </span>
        </div>
        <div className="tap-summary-total tone-success">
          <span className="tap-summary-total-icon" aria-hidden><FileCode2 size={17} /></span>
          <span>
            <span className="tap-summary-total-label">Total Test Cases</span>
            <strong>{totalTests}</strong>
          </span>
        </div>
      </div>

      <h3 className="tap-subheading">Modules to be executed</h3>
      {chosen.length ? (
        <ul className="tap-summary-list">
          {chosen.map((m) => {
            const { Icon, color } = moduleVisual(m.name);
            const count = countForTypes(m.type_counts, testTypes);
            return (
              <li key={m.id}>
                <span className="tap-module-icon" style={{ background: color, width: 24, height: 24 }} aria-hidden>
                  <Icon size={13} />
                </span>
                <span>{m.name}</span>
                <span>{count} test{count === 1 ? '' : 's'}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="tap-hint">Select at least one module to run.</p>
      )}

      <SummaryRow
        icon={Tag}
        label="Test types"
        value={testTypes.length ? <TestTypeList types={testTypes} /> : 'All test types'}
        tone={testTypes.length ? undefined : 'muted'}
      />
      <SummaryRow icon={Boxes} label="Application" value={apps.data?.applications?.find((a) => a.id === activeApp)?.name || activeApp || 'Not set'} />
      <SummaryRow icon={AppWindow} label="Browser" value={browserInfo?.label || browser} tone={browserInfo?.available ? undefined : 'danger'} />
      <SummaryRow icon={Monitor} label="Headless mode" value={config.headless === 'headless' ? 'Yes (headless)' : 'No (visible)'} />
      <SummaryRow icon={Users} label="Parallel workers" value={config.workers} />
      <SummaryRow icon={FileCode2} label="Framework" value="Playwright + pytest" />
    </StepPanel>
  );

  return (
    <Page
      hero={{ icon: Globe, tone: 'info' }}
      crumb="Run Tests"
      description="Select modules to run automated tests. Every test case inside a selected module runs automatically — you don’t add test cases here."
      meta={<StatusBadge status={usableBrowsers.length ? 'connected' : 'not_configured'}
        label={usableBrowsers.length ? `${usableBrowsers.length} browsers ready` : 'No browser available'} />}
      aside={
        <div className="tap-hero-badge">
          <Drama size={22} color="#2ead6d" aria-hidden />
          <span>
            <span className="tap-hero-badge-label">Powered by</span>
            <strong>Playwright</strong>
          </span>
        </div>
      }
      actions={<RefreshButton onClick={() => { apps.reload(); modulesApi.reload(); browsers.reload(); summary.reload(); }} loading={modulesApi.loading} />}
    >
      {message && <div className={`tap-notice tone-${message.tone}`}>{message.text}</div>}

      <Tabs tabs={WEB_TABS} active={tab} onChange={setTab} />

      {tab === 'run' && (
        <>
          <StepPanel step="1" title="Execution Configuration" icon={Settings2}>
            <div className="tap-config-row">
              <SelectField
                label="Application"
                icon={Boxes}
                value={activeApp || ''}
                onChange={(v) => { setApplication(v); setSelected(null); }}
                options={(apps.data?.applications || []).map((a) => ({ value: a.id, label: `${a.name} (${a.tests} tests)` }))}
                hint="Registered web suites discovered under tests/"
              />
              <SelectField
                label="Browser"
                icon={AppWindow}
                value={browser}
                onChange={(v) => setConfig({ ...config, browser: v })}
                options={browserList.map((b) => ({
                  value: b.id,
                  label: b.available ? b.label : `${b.label} — unavailable`,
                }))}
                hint={browserInfo ? browserInfo.detail : 'Resolved by the Browser Manager'}
              />
              <SelectField
                label="Headless Mode"
                icon={Monitor}
                value={config.headless}
                onChange={(v) => setConfig({ ...config, headless: v })}
                options={[{ value: 'visible', label: 'No (visible)' }, { value: 'headless', label: 'Yes (headless)' }]}
                hint="Passed to the suite as WEB_HEADLESS"
              />
              <SelectField
                label="Parallel Execution"
                icon={Users}
                value={String(config.workers)}
                onChange={(v) => setConfig({ ...config, workers: Number(v) })}
                options={Array.from({ length: Math.max(cores, 1) }, (_, i) => ({
                  value: String(i + 1),
                  label: `${i + 1} worker${i ? 's' : ''}`,
                }))}
                hint={`pytest-xdist, up to ${cores} on this machine`}
              />
            </div>

            <div className="tap-config-block">
              <div className="tap-config-block-head">
                <h3 className="tap-subheading">Test Types</h3>
                <span className="tap-hint">Only test cases assigned to the ticked types run.</span>
              </div>
              <TestTypePicker value={testTypes} onChange={setTestTypes} counts={typeCounts} />
            </div>
          </StepPanel>

          <Grid cols="2-1">
            <div className="tap-stack">
              <StepPanel
                step="2"
                title="Select Test Modules"
                icon={Boxes}
                flush
                actions={<ModuleSearch value={query} onChange={setQuery} />}
              >
                <DataState state={modulesApi} rows={4}>
                  {() => (
                    <>
                      <ModulePicker
                        modules={visible}
                        selected={selectedIds}
                        onToggle={toggle}
                        onToggleAll={(checked) => setSelected(checked ? runnable.map((m) => m.id) : [])}
                        query={query}
                        onQuery={setQuery}
                        testTypes={testTypes}
                        emptyTitle="No web test files discovered"
                        emptyBody={<>Add Playwright specs under <code>tests/web_automation/tests/</code> and they appear here.</>}
                      />
                      <div className="tap-step-body">
                        <InfoNote>
                          {testTypes.length
                            ? 'Only the test cases assigned to the selected test types will run. Each test case carries its own type.'
                            : 'All test cases under the selected modules will be executed. You don’t need to add test cases manually.'}
                        </InfoNote>
                      </div>
                    </>
                  )}
                </DataState>
              </StepPanel>
            </div>
            {summaryRail}
          </Grid>

          <RunBar
            summary={
              chosen.length
                ? `${chosen.length} module${chosen.length === 1 ? '' : 's'} · ${totalTests} test case${totalTests === 1 ? '' : 's'}`
                  + ` · ${testTypes.length ? `${testTypes.length} test type${testTypes.length === 1 ? '' : 's'}` : 'all test types'}`
                  + ` · ${browserInfo?.label || browser}`
                : 'Select modules to run'
            }
          >
            <Button icon={Copy} onClick={() => copy(command)}>{copied ? 'Command copied' : 'Copy pytest command'}</Button>
            <Button
              variant="primary"
              icon={Play}
              onClick={runModules}
              disabled={busy || !chosen.length || !totalTests}
              title={!totalTests && chosen.length ? 'No test case of the selected type(s) in these modules' : undefined}
            >
              {busy ? 'Starting…' : 'Run Selected Modules'}
            </Button>
          </RunBar>
        </>
      )}

      {tab === 'browsers' && (
        <DataState state={browsers}>
          {(d) => (
            <>
              <div className="tap-card-grid">
                {d.browsers.map((b) => (
                  <Panel key={b.id} title={b.label} icon={AppWindow}
                    actions={<StatusBadge status={b.available ? 'installed' : 'not_run'} label={b.available ? 'Ready' : 'Unavailable'} />}>
                    <dl className="tap-dl is-compact">
                      <dt>Engine</dt><dd><span className="tap-mono">{b.engine}</span>{b.channel && <> · channel <span className="tap-mono">{b.channel}</span></>}</dd>
                      <dt>Detail</dt><dd className="tap-truncate" title={b.detail}>{b.detail}</dd>
                    </dl>
                  </Panel>
                ))}
              </div>
              <Panel title="Playwright" icon={Cpu}>
                <dl className="tap-dl is-compact">
                  <dt>Installed</dt><dd>{d.playwright_installed ? `Yes — version ${d.playwright_version}` : 'No (pip install playwright)'}</dd>
                  <dt>Bundled engines</dt><dd>Chromium, Firefox and WebKit ship with Playwright (`playwright install`)</dd>
                  <dt>Channels</dt><dd>Chrome and Edge run through the copy installed on this host</dd>
                </dl>
                <p className="tap-hint">
                  The Browser Manager reports what can really launch here; a run is refused rather than started with a browser that is missing.
                </p>
              </Panel>
            </>
          )}
        </DataState>
      )}

      {tab === 'results' && (
        <Grid cols="2-1">
          <Panel title="Web results in the latest Allure run" icon={Globe} flush>
            <DataTable
              rows={results}
              empty={<EmptyState compact icon={CircleDashed} title="No web results in the latest Allure run">
                The most recent run only contains mobile suites. Run a module above to populate this.
              </EmptyState>}
              columns={[
                { key: 'name', header: 'Spec', render: (r) => <><div className="tap-cell-main">{r.name}</div>{r.message && <div className="tap-cell-sub tap-clamp">{r.message}</div>}</> },
                { key: 'status', header: 'Result', render: (r) => <StatusBadge status={r.status} /> },
                { key: 'duration', header: 'Duration', align: 'right', render: (r) => formatDuration(r.duration_ms) },
              ]}
            />
          </Panel>
          <div className="tap-stack">
            <Panel title="Last run" icon={Gauge}>
              <StatGrid>
                <StatCard label="Passed" value={stats.passed} icon={CheckCircle2} tone="success" />
                <StatCard label="Failed" value={stats.failed} icon={XCircle} tone={stats.failed ? 'danger' : 'muted'} />
                <StatCard label="Pass rate" value={pct(stats.passRate)} icon={Globe} tone={passRateTone(stats.passRate)} />
              </StatGrid>
            </Panel>
            <Panel title="Inventory" icon={FileCode2} subtitle="Discovered from the working tree">
              <dl className="tap-dl is-compact">
                <dt>Web test cases</dt><dd>{cases.data?.total ?? '—'}</dd>
                <dt>Modules</dt><dd>{modules.length}</dd>
                <dt>Results</dt><dd>Written to <span className="tap-mono">allure-results/</span></dd>
              </dl>
              <div className="tap-panel-footer-actions">
                <Button to="/test-management/cases">Open Test Cases</Button>
                <Button to="/reports/web">Web report</Button>
              </div>
            </Panel>
          </div>
        </Grid>
      )}
    </Page>
  );
}

/* ─── Mobile Testing ─────────────────────────────────────────────────────── */

const MOBILE_TABS = [
  { id: 'run', label: 'Run Tests', icon: Play },
  { id: 'devices', label: 'Device Lab', icon: MonitorSmartphone },
  { id: 'builds', label: 'App Builds', icon: Package },
  { id: 'specs', label: 'Test Specs', icon: FileCode2 },
];

const DEVICE_STATE_LABELS = { device: 'Available', unauthorized: 'Unauthorized', offline: 'Offline' };

export function MobileTestingPage() {
  const navigate = useNavigate();
  const { variant: contextVariant } = useWorkspace();
  const applications = useApi('/api/v1/mobile/applications');
  const devices = useApi('/api/v1/mobile/devices', { interval: 10000 });
  const appium = useApi('/api/v1/mobile/appium', { interval: 10000 });
  const apks = useApi('/api/v1/mobile/apks');
  const cases = useApi('/test-management/cases?platform=mobile');
  const summary = useApi('/reports/summary');

  const [tab, setTab] = useState('run');
  // The unified app has roles; the four historical "apps" are those roles.
  const [role, setRole] = useState(contextVariant !== 'all' ? contextVariant : null);
  const application = applications.data?.applications?.[0] || null;
  const roles = application?.roles || [];
  const activeRole = role || roles[0]?.id || null;
  const modulesApi = useApi(activeRole ? `/api/v1/mobile/modules?role=${activeRole}` : null);
  const [selected, setSelected] = useState(null);          // null = every runnable module
  const [query, setQuery] = useState('');
  const [testTypes, setTestTypes] = useState([]);          // [] = every test type
  const [platform, setPlatform] = useState('android');
  const [kind, setKind] = useState('emulator');
  const [device, setDevice] = useState(null);
  const [apk, setApk] = useState('');
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  const modules = modulesApi.data?.modules || [];
  const runnable = modules.filter((m) => m.exists);
  const selectedIds = selected ?? runnable.map((m) => m.id);
  const chosen = runnable.filter((m) => selectedIds.includes(m.id));
  const visible = modules.filter((m) => `${m.name} ${m.description} ${m.path}`.toLowerCase().includes(query.toLowerCase()));
  const totalTests = selectedCaseCount(chosen, testTypes);
  const typeCounts = modules.reduce((acc, m) => {
    Object.entries(m.type_counts || {}).forEach(([id, n]) => { acc[id] = (acc[id] || 0) + n; });
    return acc;
  }, {});

  const allDevices = devices.data?.devices || [];
  const matching = allDevices.filter((d) => (kind === 'emulator' ? d.kind === 'emulator' : d.kind !== 'emulator'));
  const online = allDevices.filter((d) => d.status === 'available');
  const activeDevice = matching.find((d) => d.udid === device) || matching.find((d) => d.status === 'available') || null;
  const appiumUp = appium.data?.status === 'running';
  const results = (summary.data?.results || []).filter((r) => r.platform === 'mobile');
  const stats = outcomeStats(results);

  const toggle = (id) =>
    setSelected(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  const toggleAppium = async () => {
    setBusy('appium');
    setMessage(null);
    try {
      await apiFetch(`/api/v1/mobile/appium/${appiumUp ? 'stop' : 'start'}`, { method: 'POST' });
      setTimeout(appium.reload, 1500);   // Appium needs a moment to bind its port
    } catch (err) {
      setMessage({ tone: 'danger', text: `Appium: ${err.message}` });
    } finally {
      setBusy(null);
    }
  };

  const blockers = [
    platform === 'ios' && 'the runner only drives Android (Appium UiAutomator2)',
    !activeRole && 'no role is selected',
    !activeDevice && 'no device is selected',
    activeDevice && activeDevice.status !== 'available' && `the selected device is ${activeDevice.status}`,
    !apk && 'no app build is selected',
    !chosen.length && 'no module is selected',
    chosen.length && !totalTests && 'no test case matches the selected test type(s)',
  ].filter(Boolean);

  const runTests = async () => {
    setBusy('run');
    setMessage(null);
    try {
      const run = await apiFetch('/api/v1/executions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          test_type: 'mobile',
          application: application?.id || 'krishivaas_unified',
          role: activeRole,
          device: {
            udid: activeDevice?.udid,
            name: activeDevice?.name,
            platform: 'Android',
            platform_version: activeDevice?.platform_version,
          },
          app: { source: 'existing', apk },
          modules: chosen.map((m) => m.id),
          test_types: testTypes,
          execution: { parallel: false, workers: 1, retry: 0 },
        }),
      });
      navigate(`/execution/live?run=${encodeURIComponent(run.run_id)}`);
    } catch (err) {
      setMessage({ tone: 'danger', text: `Couldn’t start the run: ${err.message}` });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page
      hero={{ icon: Smartphone, tone: 'primary' }}
      crumb="Run Tests"
      description="Select modules, configure the device and run automated tests. Every test case inside a selected module runs automatically."
      meta={<StatusBadge status={appiumUp ? 'connected' : 'not_configured'} label={appiumUp ? 'Appium running' : 'Appium stopped'} />}
      aside={
        <PillTabs
          active={platform}
          onChange={setPlatform}
          tabs={[
            { id: 'android', label: 'Android', icon: Bot },
            { id: 'ios', label: 'iOS', icon: Apple, title: 'No iOS runner is configured on this host' },
          ]}
        />
      }
      actions={<RefreshButton onClick={() => { applications.reload(); modulesApi.reload(); devices.reload(); apks.reload(); }} loading={modulesApi.loading} />}
    >
      {message && <div className={`tap-notice tone-${message.tone}`}>{message.text}</div>}
      {platform === 'ios' && (
        <InfoNote tone="warn">
          iOS execution is not wired up on this host: the backend runner starts Appium with UiAutomator2 for Android only, and no
          iOS device or simulator is exposed. Switch back to Android to run the mobile suites.
        </InfoNote>
      )}

      <Tabs tabs={MOBILE_TABS} active={tab} onChange={setTab} />

      {tab === 'run' && (
        <>
          <StepPanel step="1" title="Test Configuration" icon={Settings2}>
            <div className="tap-config-row">
              <SelectField
                label="Application"
                icon={Boxes}
                value={application?.id || ''}
                onChange={() => {}}
                options={[{ value: application?.id || 'krishivaas_unified', label: application?.name || 'Krishivaas Unified App' }]}
                disabled
                hint="One unified app — the roles below live inside it"
              />
              <SelectField
                label="Role"
                icon={Users}
                value={activeRole || ''}
                onChange={(v) => { setRole(v); setSelected(null); }}
                options={roles.map((r) => ({
                  value: r.id,
                  label: `${r.label}${r.tests ? ` (${r.tests} tests)` : ' — no tests yet'}`,
                }))}
                hint="Login decides the real role; this is what the run expects"
              />
              <SelectField
                label="Execution Type"
                icon={MonitorSmartphone}
                value={kind}
                onChange={(v) => { setKind(v); setDevice(null); }}
                options={[
                  { value: 'emulator', label: `Emulator (${allDevices.filter((d) => d.kind === 'emulator').length})` },
                  { value: 'physical', label: `Physical device (${allDevices.filter((d) => d.kind !== 'emulator').length})` },
                ]}
              />
              <SelectField
                label="Device"
                icon={Smartphone}
                value={activeDevice?.udid || ''}
                onChange={setDevice}
                options={matching.length
                  ? matching.map((d) => ({
                      value: d.udid,
                      label: `${d.name}${d.platform_version ? ` — Android ${d.platform_version}` : ''}`,
                    }))
                  : [{ value: '', label: 'No device connected' }]}
                hint={devices.data && !devices.data.adb_available ? 'adb is not on the backend host’s PATH' : undefined}
              />
              <SelectField
                label="App Build"
                icon={Package}
                value={apk}
                onChange={setApk}
                options={[
                  { value: '', label: apks.data?.apks?.length ? 'Select a build…' : 'No build downloaded' },
                  ...(apks.data?.apks || []).map((a) => ({ value: a.name, label: a.name })),
                ]}
                hint="One unified APK serves every role"
              />
              <SelectField
                label="Parallel Execution"
                icon={Users}
                value="1"
                onChange={() => {}}
                options={[{ value: '1', label: '1 device' }]}
                disabled
                hint="The Appium runner executes one device per run"
              />
            </div>

            <div className="tap-config-block">
              <div className="tap-config-block-head">
                <h3 className="tap-subheading">Test Types</h3>
                <span className="tap-hint">Only test cases assigned to the ticked types run.</span>
              </div>
              <TestTypePicker value={testTypes} onChange={setTestTypes} counts={typeCounts} />
            </div>
          </StepPanel>

          <Grid cols="2-1">
            <div className="tap-stack">
              <StepPanel
                step="2"
                title="Select Test Modules"
                icon={Boxes}
                flush
                actions={<ModuleSearch value={query} onChange={setQuery} />}
              >
                <DataState state={modulesApi} rows={4}>
                  {() => (
                    <>
                      <ModulePicker
                        modules={visible}
                        selected={selectedIds}
                        onToggle={toggle}
                        onToggleAll={(checked) => setSelected(checked ? runnable.map((m) => m.id) : [])}
                        query={query}
                        onQuery={setQuery}
                        testTypes={testTypes}
                        emptyTitle="No modules for this application"
                        emptyBody="Add the variant's modules to APP_VARIANTS, or add test files under tests/test_cases/."
                      />
                      <div className="tap-step-body">
                        <InfoNote>
                          {testTypes.length
                            ? 'Only the test cases assigned to the selected test types will run. Modules without a matching case are skipped.'
                            : 'All test cases under the selected modules will be executed. Modules without a test file stay listed as planned so the gap is visible.'}
                        </InfoNote>
                      </div>
                    </>
                  )}
                </DataState>
              </StepPanel>
            </div>

            <div className="tap-stack">
              <StepPanel
                step="3"
                title="Device Selection"
                icon={Smartphone}
                actions={
                  <Button icon={RefreshCw} onClick={devices.reload} disabled={devices.loading}>Refresh</Button>
                }
              >
                <PillTabs
                  size="full"
                  active={kind}
                  onChange={(k) => { setKind(k); setDevice(null); }}
                  tabs={[{ id: 'emulator', label: 'Emulator' }, { id: 'physical', label: 'Physical Device' }]}
                />
                <div style={{ height: 12 }} />
                <DataState state={devices} rows={2}>
                  {(d) => (!d.adb_available ? (
                    <EmptyState compact icon={Smartphone} title="adb isn’t on the backend host’s PATH">
                      Install Android platform-tools and restart the backend.
                    </EmptyState>
                  ) : matching.length ? (
                    <ul className="tap-device-list">
                      {matching.map((dev) => (
                        <li key={dev.udid}>
                          <label className={clsx('tap-device-option', activeDevice?.udid === dev.udid && 'is-selected')}>
                            <input
                              type="radio"
                              name="tap-device"
                              checked={activeDevice?.udid === dev.udid}
                              onChange={() => setDevice(dev.udid)}
                            />
                            <Smartphone size={15} aria-hidden />
                            <span className="tap-device-body">
                              <span className="tap-device-name">{dev.name}{dev.platform_version ? ` (Android ${dev.platform_version})` : ''}</span>
                              <span className="tap-device-meta">{dev.udid}</span>
                            </span>
                            <StatusBadge status={dev.status} label={DEVICE_STATE_LABELS[dev.adb_state] || dev.status} />
                          </label>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState compact icon={Smartphone} title={`No ${kind === 'emulator' ? 'emulator' : 'physical device'} connected`}>
                      {kind === 'emulator' ? 'Start an emulator from Android Studio, then refresh.' : 'Connect a phone with USB debugging enabled, then refresh.'}
                    </EmptyState>
                  ))}
                </DataState>
              </StepPanel>

              <StepPanel step="4" title="Test Run Summary" icon={ClipboardList}>
                <div className="tap-summary-totals">
                  <div className="tap-summary-total">
                    <span className="tap-summary-total-icon" aria-hidden><Boxes size={17} /></span>
                    <span>
                      <span className="tap-summary-total-label">Selected Modules</span>
                      <strong>{chosen.length}</strong>
                    </span>
                  </div>
                  <div className="tap-summary-total tone-success">
                    <span className="tap-summary-total-icon" aria-hidden><FileCode2 size={17} /></span>
                    <span>
                      <span className="tap-summary-total-label">Total Test Cases</span>
                      <strong>{totalTests}</strong>
                    </span>
                  </div>
                </div>
                <SummaryRow
                  icon={Tag}
                  label="Test types"
                  value={testTypes.length ? <TestTypeList types={testTypes} /> : 'All test types'}
                  tone={testTypes.length ? undefined : 'muted'}
                />
                <SummaryRow icon={Boxes} label="Application" value={application?.name || 'Krishivaas Unified App'} />
                <SummaryRow icon={Users} label="Expected role" value={roles.find((r) => r.id === activeRole)?.label || 'Not set'} tone={activeRole ? undefined : 'muted'} />
                <SummaryRow icon={Bot} label="Platform" value={platform === 'android' ? 'Android' : 'iOS (not available)'} tone={platform === 'ios' ? 'danger' : undefined} />
                <SummaryRow icon={MonitorSmartphone} label="Execution type" value={kind === 'emulator' ? 'Emulator' : 'Physical device'} />
                <SummaryRow icon={Smartphone} label="Device" value={activeDevice ? activeDevice.name : 'None selected'} tone={activeDevice ? undefined : 'muted'} />
                <SummaryRow icon={Package} label="App build" value={apk || 'None selected'} tone={apk ? undefined : 'muted'} />
                <SummaryRow icon={Server} label="Appium" value={appiumUp ? `Running on :${appium.data?.port || 4723}` : 'Stopped'} tone={appiumUp ? undefined : 'danger'} />
              </StepPanel>
            </div>
          </Grid>

          <RunBar
            summary={
              blockers.length
                ? `Before running: ${blockers.join(', ')}.`
                : `${chosen.length} module${chosen.length === 1 ? '' : 's'} · ${totalTests} test case${totalTests === 1 ? '' : 's'}`
                  + ` · ${roles.find((r) => r.id === activeRole)?.label} on ${activeDevice?.name}`
            }
          >
            <Button icon={Power} onClick={toggleAppium} disabled={busy === 'appium'}>
              {appiumUp ? 'Stop Appium' : 'Start Appium'}
            </Button>
            <Button
              variant="primary"
              icon={Play}
              onClick={runTests}
              disabled={Boolean(busy) || blockers.length > 0}
              title={blockers.length ? `Can’t run yet: ${blockers.join(', ')}` : 'Start the selected modules'}
            >
              {busy === 'run' ? 'Starting…' : 'Run Selected Modules'}
            </Button>
          </RunBar>
        </>
      )}

      {tab === 'devices' && (
        <>
          <StatGrid>
            <StatCard label="Devices available" value={devices.data ? online.length : null} icon={Smartphone} tone={online.length ? 'success' : 'muted'}
              hint={devices.data && !devices.data.adb_available ? 'adb not on PATH' : undefined} />
            <StatCard label="Emulators" value={allDevices.filter((d) => d.kind === 'emulator').length} icon={MonitorSmartphone} tone="info" />
            <StatCard label="Physical" value={allDevices.filter((d) => d.kind !== 'emulator').length} icon={Smartphone} tone="violet" />
            <StatCard label="Appium" value={appiumUp ? 'Running' : 'Stopped'} icon={Server} tone={appiumUp ? 'success' : 'muted'}
              hint={`127.0.0.1:${appium.data?.port || 4723}`} />
          </StatGrid>
          <DataState state={devices}>
            {(d) => (!d.adb_available ? (
              <Panel><EmptyState icon={Smartphone} title="adb isn’t on the backend host’s PATH">
                Install Android platform-tools and restart the backend.
              </EmptyState></Panel>
            ) : d.devices.length ? (
              <div className="tap-card-grid">
                {d.devices.map((dev) => (
                  <Panel key={dev.udid} title={dev.name} icon={dev.kind === 'emulator' ? MonitorSmartphone : Smartphone}
                    actions={<StatusBadge status={dev.status} label={DEVICE_STATE_LABELS[dev.adb_state] || dev.status} />}>
                    <dl className="tap-dl is-compact">
                      <dt>UDID</dt><dd className="tap-mono">{dev.udid}</dd>
                      <dt>Type</dt><dd>{dev.kind === 'emulator' ? 'Emulator' : 'Physical device'}</dd>
                      {dev.manufacturer && (<><dt>Manufacturer</dt><dd>{dev.manufacturer}</dd></>)}
                      {dev.platform_version && (<><dt>Android</dt><dd>{dev.platform_version}</dd></>)}
                    </dl>
                    {dev.adb_state === 'unauthorized' && <p className="tap-hint">Accept the USB debugging prompt on the device.</p>}
                  </Panel>
                ))}
              </div>
            ) : (
              <Panel><EmptyState icon={Smartphone} title="No devices connected">
                Connect a phone with USB debugging enabled, or start an emulator, then check with <code>adb devices</code>.
              </EmptyState></Panel>
            ))}
          </DataState>
        </>
      )}

      {tab === 'builds' && (
        <Panel title="App builds" icon={Package} flush subtitle="APKs on the backend host, selectable for a run">
          <DataState state={apks}>
            {(d) => (
              <DataTable
                rowKey={(build) => build.name}
                rows={d.apks}
                empty={<EmptyState compact icon={Package} title="No APK builds downloaded yet">
                  Download one from a Google Drive link in <Button variant="ghost" to="/execution/run-tests">Run Tests</Button>.
                </EmptyState>}
                columns={[
                  { key: 'name', header: 'Build', render: (b) => <span className="tap-mono">{b.name}</span> },
                  { key: 'state', header: 'Selected', render: (b) => (apk === b.name ? <StatusBadge status="configured" label="Selected" /> : '—') },
                  { key: 'select', header: '', align: 'right', render: (b) => <Button onClick={() => setApk(b.name)}>Select</Button> },
                ]}
              />
            )}
          </DataState>
        </Panel>
      )}

      {tab === 'specs' && (
        <>
          <StatGrid>
            <StatCard label="Mobile test cases" value={cases.data?.total} icon={ClipboardList} to="/test-management/cases" />
            <StatCard label="Passed (last run)" value={stats.passed} icon={CheckCircle2} tone="success" />
            <StatCard label="Failed (last run)" value={stats.failed} icon={XCircle} tone={stats.failed ? 'danger' : 'muted'} />
            <StatCard label="Pass rate" value={pct(stats.passRate)} icon={Gauge} tone={passRateTone(stats.passRate)} />
          </StatGrid>
          <Panel title="Mobile test specs" icon={FileCode2} flush>
            <DataState state={cases}>{(d) => <CaseTable cases={d.cases} />}</DataState>
          </Panel>
        </>
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
