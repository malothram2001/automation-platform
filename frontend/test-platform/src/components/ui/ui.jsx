/**
 * TAP UI kit — shared building blocks for the sidebar pages.
 * Styles live in ./ui.css (tokens are prefixed --tap-).
 */
import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, ChevronRight, CircleDashed, Inbox, RefreshCw, X, XCircle } from 'lucide-react';
import { findNavItem } from '../../config/navigation';
import { API_URL } from '../../config/api';
import useApi from '../../hooks/useApi';
import { humanize, statusTone } from '../../utils/format';
import './ui.css';

/* ─── Status ─────────────────────────────────────────────────────────────── */

const STATUS_LABELS = {
  not_run: 'Not run',
  not_configured: 'Not configured',
  at_risk: 'At risk',
  no_data: 'No data',
  device: 'Online',
};

export function StatusBadge({ status, label, tone }) {
  const t = tone || statusTone(status);
  return (
    <span className={clsx('tap-status', `tone-${t}`)}>
      <span className="tap-status-dot" aria-hidden />
      {label || STATUS_LABELS[status] || humanize(status || 'unknown')}
    </span>
  );
}

export function Pill({ children, tone = 'muted' }) {
  return <span className={clsx('tap-pill', `tone-${tone}`)}>{children}</span>;
}

/* ─── Layout ─────────────────────────────────────────────────────────────── */

export function Page({ title, description, actions, meta, children, wide = false }) {
  const { pathname } = useLocation();
  const item = findNavItem(pathname);
  const Icon = item?.icon;

  return (
    <div className={clsx('tap-page', wide && 'is-wide')}>
      <header className="tap-page-header">
        <div className="tap-page-heading">
          {item && (
            <nav className="tap-breadcrumb" aria-label="Breadcrumb">
              <span>{item.section}</span>
              <ChevronRight size={12} aria-hidden />
              <span>{item.label}</span>
            </nav>
          )}
          <h1 className="tap-page-title">
            {Icon && (
              <span className="tap-page-icon" aria-hidden>
                <Icon size={18} />
              </span>
            )}
            {title || item?.label}
            {meta}
          </h1>
          {description && <p className="tap-page-desc">{description}</p>}
        </div>
        {actions && <div className="tap-page-actions">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

export function Grid({ cols = 2, children, className }) {
  return <div className={clsx('tap-grid', `cols-${cols}`, className)}>{children}</div>;
}

export function Panel({ title, icon: Icon, actions, children, className, flush = false, subtitle }) {
  return (
    <section className={clsx('tap-panel', className)}>
      {(title || actions) && (
        <div className="tap-panel-head">
          <div>
            {title && (
              <h2 className="tap-panel-title">
                {Icon && <Icon size={16} aria-hidden />}
                {title}
              </h2>
            )}
            {subtitle && <p className="tap-panel-sub">{subtitle}</p>}
          </div>
          {actions && <div className="tap-panel-actions">{actions}</div>}
        </div>
      )}
      <div className={clsx('tap-panel-body', flush && 'is-flush')}>{children}</div>
    </section>
  );
}

export function StatGrid({ children }) {
  // The card count drives balanced column breakpoints in ui.css (e.g. 6 → 3×2).
  const count = React.Children.toArray(children).length;
  return <div className="tap-stat-grid" data-count={count} style={{ '--cols': count }}>{children}</div>;
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'primary', to }) {
  const body = (
    <>
      {Icon && (
        <span className={clsx('tap-stat-icon', `tone-${tone}`)} aria-hidden>
          <Icon size={18} />
        </span>
      )}
      <div className="tap-stat-body">
        <span className="tap-stat-label">{label}</span>
        <div className="tap-stat-value">{value ?? '—'}</div>
        {hint && <div className="tap-stat-hint">{hint}</div>}
      </div>
    </>
  );
  return to ? <Link to={to} className="tap-stat is-link">{body}</Link> : <div className="tap-stat">{body}</div>;
}

/** Underlined tab strip, as used across the reference workspaces. */
export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tap-tabs" role="tablist">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            className={clsx('tap-tab', active === tab.id && 'is-active')}
            onClick={() => onChange(tab.id)}
          >
            {Icon && <Icon size={15} aria-hidden />}
            {tab.label}
            {tab.count != null && <span className="tap-tab-count">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Modal({ open, title, subtitle, onClose, children, footer, wide = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="tap-modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={clsx('tap-modal', wide && 'is-wide')} role="dialog" aria-modal="true" aria-label={title}>
        <header className="tap-modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="tap-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="tap-modal-body">{children}</div>
        {footer && <footer className="tap-modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({ label, hint, required, children, wide = false }) {
  return (
    <label className={clsx('tap-form-field', wide && 'is-wide')}>
      <span className="tap-form-label">
        {label}
        {required && <em aria-hidden>*</em>}
      </span>
      {children}
      {hint && <span className="tap-form-hint">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label className="tap-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="tap-toggle-track" aria-hidden />
      <span className="tap-toggle-label">{label}</span>
    </label>
  );
}

export function ProgressBar({ value, tone = 'primary', label }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="tap-progress" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={clsx('tap-progress-fill', `tone-${tone}`)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function StackedBar({ segments }) {
  const total = segments.reduce((sum, s) => sum + (s.value || 0), 0);
  if (!total) return <div className="tap-stacked is-empty" />;
  return (
    <div className="tap-stacked" role="img" aria-label={segments.map((s) => `${s.label} ${s.value}`).join(', ')}>
      {segments.filter((s) => s.value).map((s) => (
        <div key={s.label} className={clsx('tap-stacked-seg', `tone-${s.tone}`)} style={{ width: `${(s.value / total) * 100}%` }} title={`${s.label}: ${s.value}`} />
      ))}
    </div>
  );
}

/* ─── Buttons ────────────────────────────────────────────────────────────── */

export function Button({ variant = 'secondary', icon: Icon, children, to, href, className, ...props }) {
  const cls = clsx('tap-btn', `tap-btn-${variant}`, className);
  const content = (
    <>
      {Icon && <Icon size={15} aria-hidden />}
      {children}
    </>
  );
  if (to) return <Link to={to} className={cls}>{content}</Link>;
  if (href) return <a href={href} className={cls} target="_blank" rel="noreferrer">{content}</a>;
  return <button type="button" className={cls} {...props}>{content}</button>;
}

export function RefreshButton({ onClick, loading }) {
  return (
    <Button icon={RefreshCw} onClick={onClick} disabled={loading} className={clsx(loading && 'is-spinning')}>
      Refresh
    </Button>
  );
}

/* ─── Data states ────────────────────────────────────────────────────────── */

export function EmptyState({ icon = Inbox, title, children, action, compact = false }) {
  const Icon = icon;
  return (
    <div className={clsx('tap-empty', compact && 'is-compact')}>
      <span className="tap-empty-icon" aria-hidden>
        <Icon size={compact ? 18 : 22} />
      </span>
      <div className="tap-empty-title">{title}</div>
      {children && <div className="tap-empty-body">{children}</div>}
      {action && <div className="tap-empty-action">{action}</div>}
    </div>
  );
}

export function ErrorNotice({ error, onRetry }) {
  const offline = /failed to fetch|networkerror|load failed/i.test(error?.message || '');
  return (
    <div className="tap-error" role="alert">
      <AlertTriangle size={18} aria-hidden />
      <div>
        <strong>{offline ? 'Backend unreachable' : 'Request failed'}</strong>
        <p>
          {offline
            ? <>Couldn’t reach the TAP backend at <code>{API_URL}</code>. Start it with <code>python -m new_backend.main</code> from the project root.</>
            : error?.message}
        </p>
      </div>
      {onRetry && <Button onClick={onRetry} icon={RefreshCw}>Retry</Button>}
    </div>
  );
}

export function Skeleton({ rows = 3 }) {
  return (
    <div className="tap-skeleton" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="tap-skeleton-row" />)}
    </div>
  );
}

/** Renders loading / error states, then children(data) once data exists. */
export function DataState({ state, children, rows }) {
  const { data, error, loading, reload } = state;
  if (error && !data) return <ErrorNotice error={error} onRetry={reload} />;
  if (loading && !data) return <Skeleton rows={rows} />;
  if (!data) return null;
  return children(data);
}

/* ─── Table ──────────────────────────────────────────────────────────────── */

export function DataTable({ columns, rows, rowKey = 'id', empty, onRowClick, selectedKey }) {
  if (!rows?.length) return empty || <EmptyState compact title="Nothing to show yet" />;
  return (
    <div className="tap-table-wrap">
      <table className="tap-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ width: c.width, textAlign: c.align }}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const key = typeof rowKey === 'function' ? rowKey(row) : row[rowKey] ?? i;
            return (
              <tr
                key={key}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={clsx(onRowClick && 'is-clickable', selectedKey === key && 'is-selected')}
              >
                {columns.map((c) => (
                  <td key={c.key} style={{ textAlign: c.align }}>
                    {c.render ? c.render(row) : row[c.key] ?? '—'}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Integration status ─────────────────────────────────────────────────── */

const INTEGRATION_ICONS = { configured: CheckCircle2, connected: CheckCircle2, partial: AlertTriangle, not_configured: CircleDashed };

/** Status card for one backend integration (see platform_hub INTEGRATIONS). */
export function IntegrationCard({ integration }) {
  if (!integration) return null;
  const Icon = INTEGRATION_ICONS[integration.status] || XCircle;
  const ready = ['configured', 'connected'].includes(integration.status);
  return (
    <div className={clsx('tap-integration', `tone-${statusTone(integration.status)}`)}>
      <Icon size={20} aria-hidden className="tap-integration-icon" />
      <div className="tap-integration-body">
        <div className="tap-integration-title">
          {integration.name}
          <StatusBadge status={integration.status} />
        </div>
        {ready ? (
          <p>Detected on the backend host{integration.status === 'connected' ? ' and responding' : ''}.</p>
        ) : (
          <p>
            Set {integration.missing.map((m, i) => (
              <React.Fragment key={m}>
                {i > 0 && (i === integration.missing.length - 1 ? ' and ' : ', ')}
                <code>{m.replace(/`/g, '')}</code>
              </React.Fragment>
            ))} in <code>.env</code> on the backend host, then restart the backend.
          </p>
        )}
      </div>
    </div>
  );
}

export function IntegrationStatus({ ids }) {
  const state = useApi('/platform/integrations');
  return (
    <DataState state={state} rows={1}>
      {(data) => (
        <div className="tap-integration-list">
          {ids.map((id) => (
            <IntegrationCard key={id} integration={data.integrations.find((i) => i.id === id)} />
          ))}
        </div>
      )}
    </DataState>
  );
}

export function CodeBlock({ children }) {
  return <pre className="tap-code"><code>{children}</code></pre>;
}
