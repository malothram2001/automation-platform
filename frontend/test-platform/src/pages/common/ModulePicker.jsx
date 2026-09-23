/**
 * "Select Test Modules" table shared by Web Testing and Mobile Testing.
 *
 * Rows come from GET /test-management/modules — the test files discovered on
 * disk — so counts, paths and dates are what is really there. A planned module
 * whose file is missing stays visible and cannot be selected.
 */
import React from 'react';
import clsx from 'clsx';
import { FileCode2, Search } from 'lucide-react';
import { EmptyState, StatusBadge } from '../../components/ui/ui';
import { TestTypeList } from '../../components/ui/TestTypes';
import { countForTypes } from '../../hooks/useTestTypes';
import { formatDate } from '../../utils/format';
import { moduleVisual } from '../../utils/moduleVisuals';

export default function ModulePicker({
  modules,
  selected,
  onToggle,
  onToggleAll,
  query,
  onQuery,
  testTypes = [],          // when set, the counts show how many cases will actually run
  emptyTitle = 'No modules found',
  emptyBody,
}) {
  const runnable = modules.filter((m) => m.exists);
  const allSelected = runnable.length > 0 && runnable.every((m) => selected.includes(m.id));
  const someSelected = runnable.some((m) => selected.includes(m.id));

  if (!modules.length) {
    return <EmptyState compact icon={FileCode2} title={emptyTitle}>{emptyBody}</EmptyState>;
  }

  return (
    <div className="tap-module-wrap">
      <table className="tap-module-table">
        <colgroup>
          <col className="c-check" />
          <col className="c-name" />
          <col className="c-desc" />
          <col className="c-types" />
          <col className="c-count" />
          <col className="c-date" />
          <col className="c-status" />
        </colgroup>
        <thead>
          <tr>
            <th className="tap-module-check">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                onChange={(e) => onToggleAll(e.target.checked)}
                aria-label={allSelected ? 'Clear module selection' : 'Select every module'}
                disabled={!runnable.length}
              />
            </th>
            <th>Module Name</th>
            <th>Description</th>
            <th>Test Types</th>
            <th>{testTypes.length ? 'Matching / All Cases' : 'No. of Test Cases'}</th>
            <th>Last Updated</th>
            <th>Last Result</th>
          </tr>
        </thead>
        <tbody>
          {modules.map((m) => {
            const { Icon, color } = moduleVisual(m.name);
            const checked = selected.includes(m.id);
            const matching = countForTypes(m.type_counts, testTypes);
            const filteredOut = testTypes.length > 0 && matching === 0 && m.exists;
            return (
              <tr
                key={m.id}
                className={clsx(checked && 'is-selected', (!m.exists || filteredOut) && 'is-missing')}
                onClick={() => m.exists && onToggle(m.id)}
                title={filteredOut ? 'No test case of the selected test type(s) — this module will be skipped' : undefined}
              >
                <td className="tap-module-check">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!m.exists}
                    onChange={() => onToggle(m.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select ${m.name}`}
                  />
                </td>
                <td>
                  <div className="tap-module-name">
                    <span className="tap-module-icon" style={{ background: color }} aria-hidden>
                      <Icon size={16} />
                    </span>
                    <span className="tap-module-title">
                      {m.name}
                      <span className="tap-module-path" title={m.path}>{m.path}</span>
                    </span>
                  </div>
                </td>
                <td>{m.description || (m.exists ? <span className="tap-cell-sub">No allure feature declared</span> : 'Planned — no test file yet')}</td>
                <td>{m.exists ? <TestTypeList counts={m.type_counts} max={2} empty="—" /> : <span className="tap-cell-sub">—</span>}</td>
                <td className="tap-module-count">
                  {!m.exists ? '—' : testTypes.length ? `${matching} / ${m.test_count}` : m.test_count}
                </td>
                <td>{m.last_updated ? formatDate(m.last_updated) : '—'}</td>
                <td>{m.exists ? <StatusBadge status={m.status} /> : <StatusBadge status="missing" label="No file" tone="muted" />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {onQuery && !modules.length && <p className="tap-hint">Nothing matches “{query}”.</p>}
    </div>
  );
}

export function ModuleSearch({ value, onChange }) {
  return (
    <span className="tap-module-search">
      <Search size={15} aria-hidden />
      <input
        type="search"
        value={value}
        placeholder="Search modules…"
        aria-label="Search modules"
        onChange={(e) => onChange(e.target.value)}
      />
    </span>
  );
}
