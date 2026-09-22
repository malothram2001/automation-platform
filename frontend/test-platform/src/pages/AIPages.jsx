import React from 'react';
import { AlertOctagon, BrainCircuit, CheckCircle2, ExternalLink, Lightbulb, ListChecks, Sparkles, Ticket } from 'lucide-react';
import { Button, DataState, EmptyState, Grid, Page, Panel, Pill, RefreshButton, StatCard, StatGrid } from '../components/ui/ui';
import { CategoryBars } from '../components/insights/Insights';
import { FAILURE_GUIDANCE } from '../config/failureGuidance';
import ModuleScaffold from './common/ModuleScaffold';
import useApi from '../hooks/useApi';
import { humanize } from '../utils/format';

/* ─── AI Failure Analysis ────────────────────────────────────────────────── */

export function AIFailureAnalysisPage() {
  const state = useApi('/reports/intelligence');
  return (
    <Page
      description="Failures from the latest run, grouped by likely root cause with a suggested next step. Classification is pattern-based on the failure message and step, not a model verdict."
      actions={<><RefreshButton onClick={state.reload} loading={state.loading} /><Button icon={Ticket} to="/integrations/jira">Raise in Jira</Button></>}
    >
      <DataState state={state}>
        {(d) => (
          <>
            <StatGrid>
              <StatCard label="Failed tests" value={d.failed_tests.length} icon={AlertOctagon} tone={d.failed_tests.length ? 'danger' : 'success'} />
              <StatCard label="Root-cause groups" value={d.failure_categories.length} icon={BrainCircuit} tone="violet" />
              <StatCard label="Top cause" value={d.failure_categories[0]?.label || '—'} icon={Lightbulb} tone="warn"
                hint={d.failure_categories[0] ? `${d.failure_categories[0].count} of ${d.failed_tests.length} failures` : undefined} />
            </StatGrid>

            {d.failed_tests.length ? (
              <Grid cols="1-2">
                <Panel title="Failures by cause" icon={BrainCircuit}>
                  <CategoryBars categories={d.failure_categories} />
                </Panel>
                <div className="tap-stack">
                  {d.failed_tests.map((f) => (
                    <Panel key={f.id} title={f.name} icon={AlertOctagon}
                      actions={<Pill tone="danger">{f.failure?.label}</Pill>}
                      subtitle={`${humanize(f.suite)}${f.feature ? ` · ${f.feature}` : ''}`}>
                      <dl className="tap-dl is-compact">
                        {f.failed_step && (<><dt>Failed step</dt><dd>{f.failed_step}</dd></>)}
                        <dt>Error</dt>
                        <dd className="tap-mono tap-prewrap">{f.message || 'No message recorded'}</dd>
                      </dl>
                      <div className="tap-suggestion">
                        <Lightbulb size={16} aria-hidden />
                        <p>{FAILURE_GUIDANCE[f.failure?.key] || FAILURE_GUIDANCE.other}</p>
                      </div>
                    </Panel>
                  ))}
                </div>
              </Grid>
            ) : (
              <Panel>
                <EmptyState icon={CheckCircle2} title={d.has_data ? 'No failures in the latest run' : 'No results to analyse yet'}
                  action={<Button icon={ExternalLink} to="/reports/allure">Allure report</Button>} />
              </Panel>
            )}
          </>
        )}
      </DataState>
    </Page>
  );
}

/* ─── AI Test Generator ──────────────────────────────────────────────────── */

export function AITestGeneratorPage() {
  return (
    <ModuleScaffold
      description="Draft new pytest cases from a user story, a recorded flow or a screen — reusing the existing page objects and locator JSON."
      integrations={['gemini']}
      recordsTitle="Generated drafts"
      columns={[
        { key: 'title', header: 'Draft' },
        { key: 'source', header: 'Source' },
        { key: 'suite', header: 'Target suite' },
        { key: 'status', header: 'Review status' },
      ]}
      emptyIcon={Sparkles}
      emptyTitle="Test generation isn’t wired up yet"
      emptyBody="The backend’s LLM module (Gemini) currently writes Jira descriptions and UI screenshot analysis. A generation endpoint is the next step; drafts will show up here for review before they are committed."
      capabilities={[
        'Generate pytest + Allure-annotated cases from a user story or acceptance criteria',
        'Turn recorded flows in Custom Automation into runnable tests',
        'Reuse locators from tests/locators/*.json instead of inventing new ones',
        'Keep a human review step before any file is written to tests/',
      ]}
      setup={
        <ul className="tap-checklist">
          <li><ListChecks size={15} aria-hidden />Set <code>GEMINI_API_KEY</code> in the backend <code>.env</code> (already used by <code>modules/llm</code>).</li>
          <li><ListChecks size={15} aria-hidden />Add a <code>POST /llm/generate-test</code> route beside <code>/llm/enhance</code>.</li>
        </ul>
      }
    />
  );
}
