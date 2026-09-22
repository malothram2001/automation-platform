import React, { useMemo, useState } from 'react';
import {
  CheckCircle2, CircleDashed, ClipboardList, Download, ExternalLink, FileCode2, FileUp, Globe, History, Layers,
  ListChecks, Pencil, Play, Plus, Search, Smartphone, Trash2, Upload, X, XCircle,
} from 'lucide-react';
import {
  Button, DataState, DataTable, EmptyState, Field, Grid, Modal, Page, Panel, Pill, RefreshButton, StackedBar,
  StatCard, StatGrid, StatusBadge, Tabs,
} from '../components/ui/ui';
import ResultsTable from './common/ResultsTable';
import useApi from '../hooks/useApi';
import { API_URL, apiFetch } from '../config/api';
import { useWorkspace } from '../context/workspaceContext';
import { downloadCsv, formatDateTime, formatDuration, passRateTone, pct, timeAgo } from '../utils/format';

const TEST_TYPES = ['Functional', 'Negative', 'Regression', 'Smoke', 'Integration', 'Usability'];
const PRIORITIES = ['High', 'Medium', 'Low'];
const AUTOMATION = ['Automated', 'Manual', 'Not Automated'];
const STATUSES = ['Active', 'Draft', 'Deprecated'];
const PRIORITY_TONES = { High: 'danger', Medium: 'warn', Low: 'muted' };
const PAGE_SIZE = 15;

const EMPTY_CASE = {
  title: '', module: '', test_type: 'Functional', priority: 'Medium', automation_status: 'Manual',
  status: 'Active', variant: '', tags: '', description: '', preconditions: '', expected_result: '',
  test_data: '', steps: [{ action: '', expected: '' }], author: '',
};

/* ─── Test Cases ─────────────────────────────────────────────────────────── */

export function TestCasesPage() {
  const cases = useApi('/test-management/cases');
  const { context, variant: ctxVariant } = useWorkspace();

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({ module: 'all', type: 'all', status: 'all', automation: 'all', source: 'all' });
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [editor, setEditor] = useState(null);     // { mode: 'create'|'edit', values }
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState(null);

  const all = useMemo(() => cases.data?.cases || [], [cases.data]);
  const modules = useMemo(() => [...new Set(all.map((c) => c.module).filter(Boolean))].sort(), [all]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((c) => {
      if (ctxVariant !== 'all' && c.variant && c.variant !== ctxVariant) return false;
      if (filters.module !== 'all' && c.module !== filters.module) return false;
      if (filters.type !== 'all' && c.test_type !== filters.type) return false;
      if (filters.status !== 'all' && c.status !== filters.status) return false;
      if (filters.automation !== 'all' && c.automation_status !== filters.automation) return false;
      if (filters.source !== 'all' && c.source !== filters.source) return false;
      if (!q) return true;
      return [c.title, c.code, c.module, c.file, ...(c.tags || [])].some((v) => v && String(v).toLowerCase().includes(q));
    });
  }, [all, query, filters, ctxVariant]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const paged = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const selected = all.find((c) => c.id === selectedId) || null;

  const counts = {
    total: all.length,
    automated: all.filter((c) => c.automation_status === 'Automated').length,
    manual: all.filter((c) => c.automation_status === 'Manual').length,
    notAutomated: all.filter((c) => c.automation_status === 'Not Automated').length,
  };

  const save = async (values) => {
    const body = {
      ...values,
      tags: typeof values.tags === 'string' ? values.tags.split(',').map((t) => t.trim()).filter(Boolean) : values.tags,
      steps: (values.steps || []).filter((s) => s.action.trim()),
      variant: values.variant || null,
    };
    const editing = editor?.mode === 'edit';
    const saved = await apiFetch(editing ? `/test-management/cases/${encodeURIComponent(editor.values.id)}` : '/test-management/cases', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setEditor(null);
    setNotice({ tone: 'info', text: editing ? `Updated ${saved.id}` : `Created ${saved.id}` });
    setSelectedId(saved.id);
    cases.reload();
  };

  const remove = async (caseId) => {
    await apiFetch(`/test-management/cases/${encodeURIComponent(caseId)}`, { method: 'DELETE' });
    setSelectedId(null);
    setNotice({ tone: 'info', text: `Deleted ${caseId}` });
    cases.reload();
  };

  const exportCsv = () => downloadCsv('tap-test-cases.csv', [
    { key: 'code', header: 'ID' }, { key: 'title', header: 'Title' }, { key: 'module', header: 'Module' },
    { key: 'test_type', header: 'Test Type' }, { key: 'priority', header: 'Priority' },
    { key: 'automation_status', header: 'Automation' }, { key: 'status', header: 'Status' },
    { key: 'suite_label', header: 'Variant' }, { key: 'file', header: 'File' },
  ], rows.map((c) => ({ ...c, tags: (c.tags || []).join(' ') })));

  return (
    <Page
      description="Create, manage and organise test cases for manual and automated testing. Automated cases are discovered from the pytest sources; manual ones are authored here."
      actions={
        <>
          <Button icon={Upload} onClick={() => setImporting(true)}>Import</Button>
          <Button icon={Download} onClick={exportCsv} disabled={!rows.length}>Export</Button>
          <Button variant="primary" icon={Plus} onClick={() => setEditor({ mode: 'create', values: { ...EMPTY_CASE } })}>New Test Case</Button>
        </>
      }
    >
      {notice && <div className={`tap-notice tone-${notice.tone}`}>{notice.text}</div>}

      <StatGrid>
        <StatCard label="Total test cases" value={counts.total} icon={ClipboardList} />
        <StatCard label="Automated" value={counts.automated} icon={CheckCircle2} tone="success"
          hint={counts.total ? `${Math.round((counts.automated * 100) / counts.total)}% of the inventory` : undefined} />
        <StatCard label="Manual" value={counts.manual} icon={ListChecks} tone="warn" />
        <StatCard label="Not automated" value={counts.notAutomated} icon={CircleDashed} tone="muted" />
      </StatGrid>

      <Grid cols={selected ? '2-1' : 1}>
        <Panel title="Test case inventory" icon={ClipboardList} flush>
          <div className="tap-toolbar">
            <label className="tap-input-icon">
              <Search size={15} aria-hidden />
              <input type="search" value={query} placeholder="Search test cases…" aria-label="Search test cases"
                onChange={(e) => { setQuery(e.target.value); setPage(0); }} />
            </label>
            <select className="tap-select" value={filters.module} onChange={(e) => setFilters({ ...filters, module: e.target.value })} aria-label="Filter by module">
              <option value="all">All modules</option>
              {modules.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select className="tap-select" value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} aria-label="Filter by test type">
              <option value="all">All test types</option>
              {TEST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="tap-select" value={filters.automation} onChange={(e) => setFilters({ ...filters, automation: e.target.value })} aria-label="Filter by automation status">
              <option value="all">All automation</option>
              {AUTOMATION.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select className="tap-select" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} aria-label="Filter by status">
              <option value="all">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="tap-select" value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })} aria-label="Filter by source">
              <option value="all">Any source</option>
              <option value="automated">From code</option>
              <option value="manual">Authored here</option>
            </select>
            <span className="tap-toolbar-count">{rows.length} of {all.length}</span>
          </div>

          <DataState state={cases}>
            {() => (
              <>
                <DataTable
                  rows={paged}
                  rowKey="id"
                  selectedKey={selectedId}
                  onRowClick={(row) => setSelectedId(row.id === selectedId ? null : row.id)}
                  empty={<EmptyState compact title={all.length ? 'No test cases match these filters' : 'No test cases yet'}
                    action={<Button variant="primary" icon={Plus} onClick={() => setEditor({ mode: 'create', values: { ...EMPTY_CASE } })}>New Test Case</Button>} />}
                  columns={[
                    { key: 'code', header: 'ID', render: (c) => <span className="tap-mono tap-case-id">{c.code}</span> },
                    {
                      key: 'title', header: 'Test Case Title',
                      render: (c) => (
                        <>
                          <div className="tap-cell-main">{c.title}</div>
                          {c.file && <div className="tap-cell-sub tap-mono">{c.file}:{c.line}</div>}
                        </>
                      ),
                    },
                    { key: 'module', header: 'Module' },
                    { key: 'test_type', header: 'Test Type', render: (c) => <Pill>{c.test_type}</Pill> },
                    { key: 'priority', header: 'Priority', render: (c) => <Pill tone={PRIORITY_TONES[c.priority]}>{c.priority}</Pill> },
                    {
                      key: 'automation_status', header: 'Automation',
                      render: (c) => <StatusBadge status={c.automation_status === 'Automated' ? 'passed' : 'not_run'} label={c.automation_status} />,
                    },
                    { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.status === 'Active' ? 'configured' : 'not_run'} label={c.status} /> },
                  ]}
                />
                {rows.length > PAGE_SIZE && (
                  <div className="tap-pagination">
                    <span>Showing {current * PAGE_SIZE + 1}–{Math.min((current + 1) * PAGE_SIZE, rows.length)} of {rows.length}</span>
                    <div className="tap-pagination-pages">
                      <Button onClick={() => setPage(current - 1)} disabled={current === 0}>Previous</Button>
                      <span className="tap-pagination-count">Page {current + 1} of {pages}</span>
                      <Button onClick={() => setPage(current + 1)} disabled={current >= pages - 1}>Next</Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </DataState>
        </Panel>

        {selected && (
          <CaseDetail
            testCase={selected}
            onClose={() => setSelectedId(null)}
            onEdit={() => setEditor({
              mode: 'edit',
              values: {
                ...selected,
                tags: (selected.tags || []).join(', '),
                steps: selected.steps?.length ? selected.steps : [{ action: '', expected: '' }],
                variant: selected.variant || '',
              },
            })}
            onDelete={() => remove(selected.id)}
          />
        )}
      </Grid>

      <CaseEditor
        editor={editor}
        variants={context?.variants || []}
        onClose={() => setEditor(null)}
        onSave={save}
      />
      <ImportDialog
        open={importing}
        onClose={() => setImporting(false)}
        onDone={(result) => {
          setImporting(false);
          setNotice({ tone: result.failed ? 'danger' : 'info', text: `Imported ${result.imported} test case${result.imported === 1 ? '' : 's'}${result.failed ? `, ${result.failed} row(s) skipped` : ''}.` });
          cases.reload();
        }}
      />
    </Page>
  );
}

/* Detail side panel */
function CaseDetail({ testCase: c, onClose, onEdit, onDelete }) {
  const [tab, setTab] = useState('details');
  const [confirming, setConfirming] = useState(false);
  const manual = c.source === 'manual';

  return (
    <Panel
      title={c.code}
      icon={manual ? ListChecks : FileCode2}
      subtitle={c.title}
      actions={<Button icon={X} onClick={onClose} aria-label="Close details" />}
    >
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'details', label: 'Details' },
          { id: 'steps', label: 'Steps', count: c.steps?.length || 0 },
          { id: 'source', label: manual ? 'Meta' : 'Source' },
        ]}
      />

      {tab === 'details' && (
        <dl className="tap-dl">
          <dt>Module</dt><dd>{c.module}</dd>
          <dt>Test type</dt><dd>{c.test_type}</dd>
          <dt>Priority</dt><dd><Pill tone={PRIORITY_TONES[c.priority]}>{c.priority}</Pill></dd>
          <dt>Automation</dt><dd>{c.automation_status}</dd>
          <dt>Status</dt><dd>{c.status}</dd>
          <dt>Variant</dt><dd>{c.suite_label}</dd>
          {c.tags?.length > 0 && (<><dt>Tags</dt><dd className="tap-pill-row">{c.tags.map((t) => <Pill key={t} tone="primary">{t}</Pill>)}</dd></>)}
          {c.description && (<><dt>Description</dt><dd>{c.description}</dd></>)}
          {c.preconditions && (<><dt>Pre-conditions</dt><dd className="tap-prewrap">{c.preconditions}</dd></>)}
          {c.expected_result && (<><dt>Expected result</dt><dd className="tap-prewrap">{c.expected_result}</dd></>)}
          {c.last_status && (<><dt>Last run</dt><dd><StatusBadge status={c.last_status} /> {formatDuration(c.last_duration_ms)}</dd></>)}
          {c.last_message && (<><dt>Last error</dt><dd className="tap-mono tap-prewrap">{c.last_message}</dd></>)}
        </dl>
      )}

      {tab === 'steps' && (
        c.steps?.length ? (
          <ol className="tap-step-list">
            {c.steps.map((s, i) => (
              <li key={i}>
                <span className="tap-step-index">{i + 1}</span>
                <div>
                  <div className="tap-cell-main">{s.action}</div>
                  {s.expected && <div className="tap-cell-sub">Expected: {s.expected}</div>}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState compact title="No steps recorded">
            {manual ? 'Add steps by editing this test case.' : 'Automated cases record their steps in Allure when they run.'}
          </EmptyState>
        )
      )}

      {tab === 'source' && (
        <dl className="tap-dl">
          {manual ? (
            <>
              <dt>Author</dt><dd>{c.author || '—'}</dd>
              <dt>Created</dt><dd>{formatDateTime(c.created_at)}</dd>
              <dt>Updated</dt><dd>{formatDateTime(c.updated_at)}</dd>
              <dt>Stored in</dt><dd className="tap-mono">new_backend/data/test_cases.json</dd>
            </>
          ) : (
            <>
              <dt>File</dt><dd className="tap-mono tap-prewrap">{c.file}:{c.line}</dd>
              <dt>Function</dt><dd className="tap-mono">{c.class_name ? `${c.class_name}.` : ''}{c.function}</dd>
              <dt>Markers</dt><dd>{c.markers?.length ? c.markers.join(', ') : '—'}</dd>
              <dt>Epic / feature</dt><dd>{[c.epic, c.feature].filter(Boolean).join(' · ') || '—'}</dd>
            </>
          )}
        </dl>
      )}

      <div className="tap-panel-footer-actions">
        {manual ? (
          <>
            <Button icon={Pencil} onClick={onEdit}>Edit</Button>
            {confirming ? (
              <>
                <Button variant="danger" icon={Trash2} onClick={onDelete}>Confirm delete</Button>
                <Button onClick={() => setConfirming(false)}>Cancel</Button>
              </>
            ) : (
              <Button icon={Trash2} onClick={() => setConfirming(true)}>Delete</Button>
            )}
          </>
        ) : (
          <Button variant="primary" icon={Play} to={c.platform === 'web' ? '/automation/web' : '/automation/mobile'}>Run in workspace</Button>
        )}
      </div>
    </Panel>
  );
}

/* Create / edit dialog */
function CaseEditor({ editor, variants, onClose, onSave }) {
  const [values, setValues] = useState(editor?.values || EMPTY_CASE);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [key, setKey] = useState(0);

  // Re-seed the form whenever a different case is opened.
  if (editor && key !== editor.values.id + editor.mode) {
    setKey(editor.values.id + editor.mode);
    setValues(editor.values);
    setError(null);
  }

  if (!editor) return null;

  const set = (patch) => setValues((prev) => ({ ...prev, ...patch }));
  const setStep = (index, patch) => setValues((prev) => ({
    ...prev,
    steps: prev.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)),
  }));

  const submit = async () => {
    if (!values.title.trim()) {
      setError('A title is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(values);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      wide
      title={editor.mode === 'edit' ? `Edit ${editor.values.id}` : 'New test case'}
      subtitle="Manual cases are stored by the backend and listed beside the automated ones."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save test case'}</Button>
        </>
      }
    >
      {error && <div className="tap-inline-error">{error}</div>}
      <div className="tap-form-grid">
        <Field label="Title" required wide>
          <input className="tap-input" value={values.title} onChange={(e) => set({ title: e.target.value })}
            placeholder="Verify user can login with valid credentials" />
        </Field>
        <Field label="Module">
          <input className="tap-input" value={values.module} onChange={(e) => set({ module: e.target.value })} placeholder="Authentication" />
        </Field>
        <Field label="App variant">
          <select className="tap-select" value={values.variant || ''} onChange={(e) => set({ variant: e.target.value })}>
            <option value="">Unassigned</option>
            {variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="Test type">
          <select className="tap-select" value={values.test_type} onChange={(e) => set({ test_type: e.target.value })}>
            {TEST_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select className="tap-select" value={values.priority} onChange={(e) => set({ priority: e.target.value })}>
            {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Automation status">
          <select className="tap-select" value={values.automation_status} onChange={(e) => set({ automation_status: e.target.value })}>
            {AUTOMATION.map((a) => <option key={a}>{a}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className="tap-select" value={values.status} onChange={(e) => set({ status: e.target.value })}>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Tags" hint="Comma separated" wide>
          <input className="tap-input" value={values.tags} onChange={(e) => set({ tags: e.target.value })} placeholder="login, smoke, regression" />
        </Field>
        <Field label="Description" wide>
          <textarea className="tap-textarea" value={values.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <Field label="Pre-conditions" wide>
          <textarea className="tap-textarea" value={values.preconditions} onChange={(e) => set({ preconditions: e.target.value })} />
        </Field>
        <Field label="Expected result" wide>
          <textarea className="tap-textarea" value={values.expected_result} onChange={(e) => set({ expected_result: e.target.value })} />
        </Field>
      </div>

      <div className="tap-steps-editor">
        <div className="tap-form-label">Steps</div>
        {values.steps.map((step, i) => (
          <div key={i} className="tap-step-row">
            <span className="tap-step-index">{i + 1}</span>
            <input className="tap-input" value={step.action} placeholder="Action" onChange={(e) => setStep(i, { action: e.target.value })} />
            <input className="tap-input" value={step.expected} placeholder="Expected" onChange={(e) => setStep(i, { expected: e.target.value })} />
            <Button icon={Trash2} aria-label={`Remove step ${i + 1}`}
              onClick={() => set({ steps: values.steps.filter((_, index) => index !== i) })} />
          </div>
        ))}
        <Button icon={Plus} onClick={() => set({ steps: [...values.steps, { action: '', expected: '' }] })}>Add step</Button>
      </div>
    </Modal>
  );
}

/* Bulk import dialog */
function ImportDialog({ open, onClose, onDone }) {
  const [fileName, setFileName] = useState('');
  const [content, setContent] = useState('');
  const [format, setFormat] = useState('csv');
  const [replace, setReplace] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const readFile = async (file) => {
    if (!file) return;
    setError(null);
    setFileName(file.name);
    setFormat(file.name.toLowerCase().endsWith('.json') ? 'json' : 'csv');
    setContent(await file.text());
  };

  const submit = async () => {
    if (!content.trim()) {
      setError('Choose a CSV or JSON file, or paste its contents.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch('/test-management/cases/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, content, replace }),
      });
      onDone(result);
      setContent(''); setFileName('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Import test cases"
      subtitle="Upload a CSV or JSON export, or paste rows directly."
      onClose={onClose}
      footer={
        <>
          <Button href={`${API_URL}/test-management/cases/template`} icon={Download}>CSV template</Button>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={FileUp} onClick={submit} disabled={busy}>{busy ? 'Importing…' : 'Import'}</Button>
        </>
      }
    >
      {error && <div className="tap-inline-error">{error}</div>}
      <label className="tap-dropzone">
        <input type="file" accept=".csv,.json,text/csv,application/json" onChange={(e) => readFile(e.target.files?.[0])} />
        <Upload size={22} aria-hidden />
        <span className="tap-cell-main">{fileName || 'Choose a .csv or .json file'}</span>
        <span className="tap-cell-sub">Columns: ID, Title, Module, Test Type, Priority, Automation, Status, Variant, Tags, Steps…</span>
      </label>
      <Field label="Contents" hint={`Parsed as ${format.toUpperCase()} — edit before importing if needed`} wide>
        <textarea className="tap-textarea tap-mono" rows={8} value={content} onChange={(e) => setContent(e.target.value)} />
      </Field>
      <label className="tap-check">
        <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
        <span>Replace every manually authored case (automated cases are untouched)</span>
      </label>
    </Modal>
  );
}

/* ─── Test Suites ────────────────────────────────────────────────────────── */

export function TestSuitesPage() {
  const state = useApi('/test-management/suites');
  const { variant } = useWorkspace();

  return (
    <Page
      description="Suites grouped by app variant and platform, with their files, features and how each did in the latest run."
      actions={<><RefreshButton onClick={state.reload} loading={state.loading} /><Button variant="primary" icon={Play} to="/automation/mobile">Configure a run</Button></>}
    >
      <DataState state={state}>
        {(d) => {
          const suites = d.suites.filter((s) => variant === 'all' || s.id === variant);
          return suites.length ? (
            <div className="tap-card-grid">
              {suites.map((s) => (
                <Panel key={s.id} title={s.label} icon={s.platform === 'web' ? Globe : Smartphone}
                  actions={<Pill tone={s.platform === 'web' ? 'violet' : 'primary'}>{s.platform}</Pill>}>
                  <div className="tap-suite-metrics">
                    <div><strong>{s.total}</strong><span>tests</span></div>
                    <div><strong className="is-success">{s.passed}</strong><span>passed</span></div>
                    <div><strong className="is-danger">{s.failed}</strong><span>failed</span></div>
                    <div><strong className="is-muted">{s.not_run}</strong><span>not run</span></div>
                  </div>
                  <StackedBar segments={[
                    { label: 'Passed', value: s.passed, tone: 'success' },
                    { label: 'Failed', value: s.failed, tone: 'danger' },
                    { label: 'Not run', value: s.not_run, tone: 'muted' },
                  ]} />
                  <dl className="tap-dl">
                    <dt>Files</dt>
                    <dd>{s.files.map((f) => <div key={f} className="tap-mono tap-truncate" title={f}><FileCode2 size={12} aria-hidden /> {f.split('/').pop()}</div>)}</dd>
                    {s.features.length > 0 && (<><dt>Features</dt><dd className="tap-pill-row">{s.features.map((f) => <Pill key={f}>{f}</Pill>)}</dd></>)}
                    {s.planned_modules.length > 0 && (<><dt>Planned modules</dt><dd className="tap-pill-row">{s.planned_modules.map((m) => <Pill key={m} tone="primary">{m}</Pill>)}</dd></>)}
                  </dl>
                </Panel>
              ))}
            </div>
          ) : (
            <EmptyState icon={Layers} title="No suites for this selection">
              Clear the variant filter in the top bar, or add pytest files under tests/.
            </EmptyState>
          );
        }}
      </DataState>
    </Page>
  );
}

/* ─── Test Runs ──────────────────────────────────────────────────────────── */

export function TestRunsPage() {
  const runs = useApi('/test-management/runs', { interval: 15000 });
  const summary = useApi('/reports/summary');

  return (
    <Page
      description="The latest Allure run in detail, plus every run started from this backend session."
      actions={<><RefreshButton onClick={() => { runs.reload(); summary.reload(); }} loading={runs.loading || summary.loading} /><Button variant="primary" icon={Play} to="/automation/mobile">New run</Button></>}
    >
      <DataState state={summary}>
        {(s) => (
          <>
            <StatGrid>
              <StatCard label="Latest run" value={s.finished_at ? timeAgo(s.finished_at) : 'No runs'} icon={History} hint={formatDateTime(s.finished_at)} />
              <StatCard label="Pass rate" value={pct(s.pass_rate)} icon={CheckCircle2} tone={passRateTone(s.pass_rate)} />
              <StatCard label="Tests" value={s.statistic.total} icon={ClipboardList} tone="info"
                hint={`${s.statistic.passed} passed · ${s.statistic.failed + s.statistic.broken} failed`} />
              <StatCard label="Duration" value={formatDuration(s.duration_ms)} icon={History} tone="muted" />
            </StatGrid>

            <Panel title="Latest run results" icon={ClipboardList} flush
              actions={<Button variant="ghost" icon={ExternalLink} to="/reports/allure">Allure report</Button>}>
              <ResultsTable results={s.results} />
            </Panel>
          </>
        )}
      </DataState>

      <Panel title="Runs this session" icon={History} flush subtitle="Held in backend memory — cleared when the backend restarts">
        <DataState state={runs}>
          {(d) => (
            <DataTable
              rowKey="run_id"
              rows={d.runs}
              empty={<EmptyState compact title="No runs started from this backend session" icon={XCircle} />}
              columns={[
                { key: 'app', header: 'App', render: (r) => <><div className="tap-cell-main">{r.app_name || 'Resolving APK…'}</div><div className="tap-cell-sub">{r.app_version ? `v${r.app_version}` : r.run_id.slice(0, 8)}</div></> },
                { key: 'variant', header: 'Variant', render: (r) => r.variant_label || r.app_variant || '—' },
                { key: 'developer', header: 'Owner', render: (r) => r.developer || '—' },
                { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                { key: 'started', header: 'Started', render: (r) => formatDateTime(r.started_at) },
                { key: 'report', header: '', align: 'right', render: (r) => r.report_url && <Button variant="ghost" icon={ExternalLink} href={r.report_url}>Report</Button> },
              ]}
            />
          )}
        </DataState>
      </Panel>
    </Page>
  );
}
