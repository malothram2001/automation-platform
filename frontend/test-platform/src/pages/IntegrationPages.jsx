import React from 'react';
import { Bell, CheckCircle2, Cpu, Hash, Link2, MessageSquare, Smartphone, Split, Users } from 'lucide-react';
import { CodeBlock, DataState, Grid, IntegrationStatus, Page, Panel, StatCard, StatGrid } from '../components/ui/ui';
import useApi from '../hooks/useApi';
import { API_URL } from '../config/api';

/* ─── Parallel Testing ───────────────────────────────────────────────────── */

export function ParallelTestingPage() {
  const devices = useApi('/platform/devices');
  const cases = useApi('/test-management/cases');
  const online = devices.data?.devices.filter((d) => d.state === 'device').length ?? null;
  // The browser's core count is a proxy for the backend host when both run on one machine.
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : null;
  const webCases = cases.data?.cases.filter((c) => c.platform === 'web').length;

  return (
    <Page description="Split suites across workers with pytest-xdist: web tests scale with CPU cores, mobile tests with the number of devices (one Appium session each).">
      <IntegrationStatus ids={['pytest_xdist']} />
      <StatGrid>
        <StatCard label="CPU cores (this machine)" value={cores || '—'} icon={Cpu} hint="Upper bound for web workers" />
        <StatCard label="Devices online" value={online} icon={Smartphone} tone={online ? 'success' : 'muted'} hint="Upper bound for mobile workers" to="/automation/mobile" />
        <StatCard label="Web test cases" value={webCases} icon={Split} tone="violet" hint="Safe to parallelise across browsers" />
      </StatGrid>
      <Grid cols={2}>
        <Panel title="Web suites" icon={Split}>
          <p className="tap-prose">Each worker starts its own browser. <code>-n auto</code> uses one worker per core.</p>
          <CodeBlock>{'pytest tests/web_automation -n auto --dist loadfile \\\n  --alluredir=allure-results'}</CodeBlock>
        </Panel>
        <Panel title="Mobile suites" icon={Smartphone}>
          <p className="tap-prose">
            Mobile tests share one device today, so Run Tests executes them one at a time. Running them in parallel needs one device
            and one Appium port per worker — keep <code>-n</code> at or below the device count.
          </p>
          <CodeBlock>{`pytest tests/test_cases -n ${online || 2} --dist loadscope \\\n  --alluredir=allure-results`}</CodeBlock>
        </Panel>
      </Grid>
    </Page>
  );
}

/* ─── Slack ──────────────────────────────────────────────────────────────── */

export function SlackPage() {
  const health = useApi('/');
  return (
    <Page description="Run summaries and failure alerts posted to your Slack channel, with the owning developer mentioned for each app variant.">
      <IntegrationStatus ids={['slack']} />
      <Grid cols={2}>
        <Panel title="What gets posted" icon={Bell}>
          <ul className="tap-checklist">
            <li><CheckCircle2 size={15} aria-hidden />A summary after every run: app, version, passed / failed counts and the report link</li>
            <li><CheckCircle2 size={15} aria-hidden />The developer who owns the app variant is mentioned (APP_DEVELOPER_MAP in <code>modules/slack/config.py</code>)</li>
            <li><CheckCircle2 size={15} aria-hidden />Messages go to <code>SLACK_NOTIFY_CHANNEL</code></li>
          </ul>
        </Panel>
        <Panel title="Slack app setup" icon={Hash}>
          <ol className="tap-steps-list">
            <li><MessageSquare size={15} aria-hidden />Create a Slack app with the <code>chat:write</code> bot scope and install it to the workspace.</li>
            <li><Users size={15} aria-hidden />Invite the bot to the channel and copy the channel ID.</li>
            <li><Link2 size={15} aria-hidden />Under Event Subscriptions, set the request URL to the endpoint below (it must be reachable from Slack).</li>
          </ol>
          <DataState state={health} rows={1}>
            {() => <CodeBlock>{`${API_URL}/slack/slack/events`}</CodeBlock>}
          </DataState>
        </Panel>
      </Grid>
    </Page>
  );
}
