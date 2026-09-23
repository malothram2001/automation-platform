/**
 * Test-type chips, picker and filter — the shared way every screen shows and
 * selects test types. The list itself comes from the backend (useTestTypes).
 */
import React from 'react';
import clsx from 'clsx';
import { Check, ListFilter, Tag } from 'lucide-react';
import useTestTypes from '../../hooks/useTestTypes';
import { testTypeIcon } from '../../utils/moduleVisuals';
import './testTypes.css';

/** One test type as a coloured chip. */
export function TestTypeBadge({ type, label, color, size = 'md', title }) {
  const catalogue = useTestTypes();
  const id = type || '';
  const text = label || catalogue.short(id);
  const tone = color || catalogue.color(id);
  if (!id && !label) return <span className="tap-cell-sub">—</span>;
  return (
    <span
      className={clsx('tap-type-badge', size === 'sm' && 'is-sm')}
      style={{ '--type-color': tone }}
      title={title || catalogue.label(id)}
    >
      <span className="tap-type-dot" aria-hidden />
      {text}
    </span>
  );
}

/** Several types at once (a run's selection, a suite's mix). */
export function TestTypeList({ types = [], counts, empty = 'All test types', max = 4 }) {
  const catalogue = useTestTypes();
  const ids = types.length ? types.map((t) => (typeof t === 'string' ? t : t.id)) : Object.keys(counts || {});
  if (!ids.length) return <span className="tap-cell-sub">{empty}</span>;
  const shown = ids.slice(0, max);
  return (
    <span className="tap-type-list">
      {shown.map((id) => (
        <TestTypeBadge key={id} type={id} size="sm" label={counts ? `${catalogue.short(id)} ${counts[id]}` : undefined} />
      ))}
      {ids.length > max && <span className="tap-cell-sub">+{ids.length - max}</span>}
    </span>
  );
}

/**
 * Checkbox picker. `value` is a list of type ids; an empty list means "every type",
 * which is what a run does when nothing is ticked.
 */
export function TestTypePicker({ value = [], onChange, counts, disabled, hint }) {
  const { types, loading, error } = useTestTypes();
  const toggle = (id) => onChange(value.includes(id) ? value.filter((t) => t !== id) : [...value, id]);

  if (error) return <p className="tap-hint">Could not load the test types: {error.message}</p>;
  if (loading && !types.length) return <p className="tap-hint">Loading test types…</p>;

  return (
    <div className="tap-type-picker-wrap">
      <div className="tap-type-picker" role="group" aria-label="Test types">
        {types.map((type) => {
          const checked = value.includes(type.id);
          const available = counts ? counts[type.id] || 0 : null;
          const Icon = testTypeIcon(type.id);
          return (
            <label
              key={type.id}
              className={clsx('tap-type-option', checked && 'is-checked', disabled && 'is-disabled')}
              style={{ '--type-color': type.color }}
              title={type.description}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(type.id)}
              />
              <span className="tap-type-check" aria-hidden>{checked && <Check size={12} />}</span>
              <span className="tap-type-icon" aria-hidden>
                <Icon size={18} />
              </span>
              <span className="tap-type-option-body">
                <span className="tap-type-option-label">{type.label}</span>
                {available !== null && (
                  <span className="tap-type-option-count">
                    {available} test case{available === 1 ? '' : 's'}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      <div className="tap-type-picker-foot">
        <span className="tap-hint">
          {value.length
            ? `Only ${value.length === 1 ? 'this type' : 'these types'} will run — test cases carry their own type.`
            : hint || 'No type selected: every test case in the selected modules runs.'}
        </span>
        {value.length > 0 && (
          <button type="button" className="tap-link-btn" onClick={() => onChange([])}>Clear</button>
        )}
      </div>
    </div>
  );
}

/** Compact dropdown filter for tables (Test Cases, Reports). */
export function TestTypeFilter({ value = 'all', onChange, counts, id, label = 'All test types' }) {
  const { types } = useTestTypes();
  return (
    <span className="tap-type-filter">
      <ListFilter size={14} aria-hidden />
      <select id={id} className="tap-select is-small" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Filter by test type">
        <option value="all">{label}</option>
        {types.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
            {counts ? ` (${counts[t.id] || 0})` : ''}
          </option>
        ))}
      </select>
    </span>
  );
}

export function TestTypeIcon() {
  return <Tag size={15} aria-hidden />;
}
