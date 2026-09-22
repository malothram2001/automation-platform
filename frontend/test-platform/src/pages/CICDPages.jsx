import React from 'react';
import { GitBranch, GitMerge, GitPullRequest, Hammer, Package, ShieldCheck, Terminal } from 'lucide-react';
import { CodeBlock, DataState, Grid, IntegrationStatus, Page, Panel, RefreshButton } from '../components/ui/ui';
import { ReadinessGates, VerdictBanner } from '../components/insights/Insights';
import ModuleScaffold from './common/ModuleScaffold';
import useApi from '../hooks/useApi';
import { API_URL } from '../config/api';

const CI_INTEGRATIONS = ['jenkins', 'github_actions', 'gitlab_ci'];

const GATE_SNIPPET = `# Fail the pipeline unless TAP says the build is releasable
verdict=$(curl -s ${API_URL}/reports/intelligence | jq -r .readiness.verdict)
echo "TAP release verdict: $verdict"
[ "$verdict" = "ready" ] || exit 1`;

export function PipelinesPage() {
  return (
    <ModuleScaffold
      description="Every CI pipeline that runs TAP suites, across Jenkins, GitHub Actions and GitLab CI, in one list."
      integrations={CI_INTEGRATIONS}
      recordsTitle="Pipelines"
      columns={[
        { key: 'name', header: 'Pipeline' }, { key: 'provider', header: 'Provider' }, { key: 'branch', header: 'Branch' },
        { key: 'last', header: 'Last run' }, { key: 'status', header: 'Status' },
      ]}
      emptyIcon={GitBranch}
      emptyTitle="No CI provider connected"
      emptyBody="Connect at least one provider above. Pipelines that trigger the TAP runner or check the release gate will be listed here."
      capabilities={[
        'Unified pipeline list across Jenkins, GitHub Actions and GitLab CI',
        'Trigger a TAP suite from a pipeline and link the run back',
        'Show which pipelines enforce the Deployment Gates',
      ]}
      setup={GATE_SNIPPET}
    />
  );
}

export function JenkinsPage() {
  return (
    <ModuleScaffold
      description="Jenkins jobs that build the Krishivaas apps and run TAP suites against the resulting APKs."
      integrations={['jenkins']}
      recordsTitle="Jobs"
      columns={[
        { key: 'job', header: 'Job' }, { key: 'build', header: 'Last build' }, { key: 'result', header: 'Result' },
        { key: 'duration', header: 'Duration' }, { key: 'trigger', header: 'Triggered by' },
      ]}
      emptyIcon={Hammer}
      emptyTitle="Jenkins isn’t connected"
      emptyBody="Set the Jenkins URL, user and API token on the backend. Jobs and their latest builds will appear here."
      capabilities={['List jobs and last build result', 'Trigger a parameterised job with an APK link', 'Attach the TAP report link to the build']}
      setup={`// Jenkinsfile stage
stage('TAP gate') {
  steps { sh '''${GATE_SNIPPET.split('\n').slice(1).join('\n')}''' }
}`}
    />
  );
}

export function GitHubActionsPage() {
  return (
    <ModuleScaffold
      description="GitHub Actions workflows for this repository that run the automation suites or check the release gate."
      integrations={['github_actions']}
      recordsTitle="Workflow runs"
      columns={[
        { key: 'workflow', header: 'Workflow' }, { key: 'branch', header: 'Branch' }, { key: 'event', header: 'Event' },
        { key: 'status', header: 'Status' }, { key: 'started', header: 'Started' },
      ]}
      emptyIcon={GitPullRequest}
      emptyTitle="GitHub Actions isn’t connected"
      emptyBody="Set GITHUB_TOKEN and GITHUB_REPOSITORY (owner/repo) on the backend to list workflow runs."
      capabilities={['Recent workflow runs with status', 'Re-run a failed workflow', 'Link each run to its TAP results']}
      setup={`# .github/workflows/tap-gate.yml
- name: TAP release gate
  run: |
${GATE_SNIPPET.split('\n').slice(1).map((l) => `    ${l}`).join('\n')}`}
    />
  );
}

export function GitLabCIPage() {
  return (
    <ModuleScaffold
      description="GitLab CI pipelines that run TAP suites or check the release gate before deploys."
      integrations={['gitlab_ci']}
      recordsTitle="Pipelines"
      columns={[
        { key: 'pipeline', header: 'Pipeline' }, { key: 'ref', header: 'Ref' }, { key: 'stage', header: 'Stage' },
        { key: 'status', header: 'Status' }, { key: 'started', header: 'Started' },
      ]}
      emptyIcon={GitMerge}
      emptyTitle="GitLab CI isn’t connected"
      emptyBody="Set GITLAB_URL, GITLAB_TOKEN and GITLAB_PROJECT_ID on the backend to list pipelines."
      capabilities={['Pipelines and job status', 'Retry failed jobs', 'Surface the TAP verdict as a job artifact']}
      setup={`# .gitlab-ci.yml
tap_gate:
  stage: test
  script:
${GATE_SNIPPET.split('\n').slice(1).map((l) => `    - ${l}`).join('\n')}`}
    />
  );
}

export function BuildHistoryPage() {
  return (
    <ModuleScaffold
      description="Builds from all connected CI providers, each linked to the APK version and the TAP run that tested it."
      integrations={CI_INTEGRATIONS}
      recordsTitle="Builds"
      columns={[
        { key: 'build', header: 'Build' }, { key: 'app', header: 'App version' }, { key: 'provider', header: 'Provider' },
        { key: 'tap', header: 'TAP result' }, { key: 'finished', header: 'Finished' },
      ]}
      emptyIcon={Package}
      emptyTitle="No build history yet"
      emptyBody="Builds appear once a CI provider is connected. Meanwhile, runs started from TAP itself are under Test Management → Test Runs."
      capabilities={['Build ↔ APK version ↔ TAP run traceability', 'Pass-rate trend per branch', 'Spot the build where a regression started']}
    />
  );
}

export function DeploymentGatesPage() {
  const state = useApi('/reports/intelligence');
  return (
    <Page
      description="The quality gates a build must pass before it’s promoted. CI pipelines can call the same endpoint and fail on anything other than “ready”."
      actions={<RefreshButton onClick={state.reload} loading={state.loading} />}
    >
      <DataState state={state}>
        {(d) => (
          <>
            <VerdictBanner verdict={d.readiness.verdict} />
            <Grid cols="2-1">
              <Panel title="Gates on the latest run" icon={ShieldCheck}><ReadinessGates gates={d.readiness.gates} /></Panel>
              <div className="tap-stack">
                <Panel title="Use in a pipeline" icon={Terminal}><CodeBlock>{GATE_SNIPPET}</CodeBlock></Panel>
                <Panel title="CI providers" icon={GitBranch}><IntegrationStatus ids={CI_INTEGRATIONS} /></Panel>
              </div>
            </Grid>
          </>
        )}
      </DataState>
    </Page>
  );
}
