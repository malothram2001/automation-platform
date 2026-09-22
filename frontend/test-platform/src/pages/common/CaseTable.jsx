import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { DataTable, EmptyState, Pill, StatusBadge } from '../../components/ui/ui';
import { formatDuration } from '../../utils/format';

const SEVERITY_TONES = { blocker: 'danger', critical: 'danger', normal: 'muted', minor: 'muted', trivial: 'muted' };

/** Filterable table of discovered pytest cases (GET /test-management/cases). */
export default function CaseTable({ cases, showSuite = true, showPlatform = false }) {
  const [query, setQuery] = useState('');
  const [suite, setSuite] = useState('all');
  const [status, setStatus] = useState('all');

  const suites = useMemo(() => [...new Map(cases.map((c) => [c.suite, c.suite_label])).entries()], [cases]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cases.filter((c) => {
      if (suite !== 'all' && c.suite !== suite) return false;
      if (status !== 'all' && (c.last_status || 'not_run') !== status && !(status === 'failed' && c.last_status === 'broken')) return false;
      if (!q) return true;
      return [c.name, c.function, c.file, c.feature, c.epic, c.story].some((v) => v && v.toLowerCase().includes(q));
    });
  }, [cases, query, suite, status]);

  const columns = [
    {
      key: 'name', header: 'Test case',
      render: (c) => (
        <>
          <div className="tap-cell-main">{c.name}</div>
          <div className="tap-cell-sub tap-mono" title={c.id}>{c.file}:{c.line}</div>
        </>
      ),
    },
    showSuite && { key: 'suite', header: 'Suite', render: (c) => c.suite_label },
    showPlatform && { key: 'platform', header: 'Platform', render: (c) => <Pill tone={c.platform === 'web' ? 'violet' : 'primary'}>{c.platform}</Pill> },
    { key: 'feature', header: 'Feature', render: (c) => c.feature || c.epic || '—' },
    { key: 'severity', header: 'Severity', render: (c) => <Pill tone={SEVERITY_TONES[c.severity] || 'muted'}>{c.severity}</Pill> },
    {
      key: 'last_status', header: 'Last result',
      render: (c) => (c.skipped ? <StatusBadge status="skipped" /> : <StatusBadge status={c.last_status || 'not_run'} />),
    },
    { key: 'duration', header: 'Duration', align: 'right', render: (c) => formatDuration(c.last_duration_ms) },
  ].filter(Boolean);

  return (
    <>
      <div className="tap-toolbar">
        <label className="tap-input-icon">
          <Search size={15} aria-hidden />
          <input type="search" placeholder="Search name, file, feature…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search test cases" />
        </label>
        {showSuite && (
          <select className="tap-select" value={suite} onChange={(e) => setSuite(e.target.value)} aria-label="Filter by suite">
            <option value="all">All suites</option>
            {suites.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        )}
        <select className="tap-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by last result">
          <option value="all">Any result</option>
          <option value="passed">Passed</option>
          <option value="failed">Failed</option>
          <option value="not_run">Not run</option>
        </select>
        <span className="tap-toolbar-count">{rows.length} of {cases.length}</span>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        empty={<EmptyState compact title={cases.length ? 'No test cases match these filters' : 'No test cases found'} />}
      />
    </>
  );
}
