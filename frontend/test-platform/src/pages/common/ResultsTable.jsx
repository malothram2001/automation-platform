import React from 'react';
import { DataTable, EmptyState, StatusBadge } from '../../components/ui/ui';
import { TestTypeBadge } from '../../components/ui/TestTypes';
import { formatDuration, humanize } from '../../utils/format';

/** Results of the latest Allure run (GET /reports/summary → results). */
export default function ResultsTable({ results }) {
  return (
    <DataTable
      rows={results}
      empty={<EmptyState compact title="No results in allure-results/" />}
      columns={[
        {
          key: 'name', header: 'Test',
          render: (r) => (
            <>
              <div className="tap-cell-main">{r.name}</div>
              {r.message && <div className="tap-cell-sub tap-clamp" title={r.message}>{r.message}</div>}
            </>
          ),
        },
        { key: 'suite', header: 'Suite', render: (r) => humanize(r.suite) },
        { key: 'test_type', header: 'Test Type', render: (r) => <TestTypeBadge type={r.test_type} label={r.test_type_label} /> },
        { key: 'feature', header: 'Feature', render: (r) => r.feature || '—' },
        { key: 'status', header: 'Result', render: (r) => <StatusBadge status={r.status} /> },
        { key: 'steps', header: 'Steps', align: 'right', render: (r) => r.steps_total || '—' },
        { key: 'duration', header: 'Duration', align: 'right', render: (r) => formatDuration(r.duration_ms) },
      ]}
    />
  );
}
