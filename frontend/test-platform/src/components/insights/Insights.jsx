/**
 * Insight widgets shared by Dashboard, Reports, Intelligence, AI and CI/CD pages.
 */
import React from 'react';
import clsx from 'clsx';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { CheckCircle2, CircleDashed, Lock, XCircle } from 'lucide-react';
import { EmptyState, Pill, StatusBadge } from '../ui/ui';
import { pct } from '../../utils/format';
import './Insights.css';

const RESULT_COLORS = { passed: '#22c55e', failed: '#ef4444', broken: '#f59e0b', skipped: '#94a3b8', unknown: '#cbd5e1' };

const tooltipStyle = {
  contentStyle: { borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(15,23,42,.08)' },
};

/* ─── Latest run donut ───────────────────────────────────────────────────── */

export function ResultDonut({ statistic, passRate }) {
  const data = Object.keys(RESULT_COLORS)
    .map((key) => ({ key, name: key[0].toUpperCase() + key.slice(1), value: statistic?.[key] || 0 }))
    .filter((d) => d.value);

  if (!data.length) return <EmptyState compact title="No results yet" icon={CircleDashed}>Run a suite to see the outcome breakdown.</EmptyState>;

  return (
    <div className="tap-donut">
      <div className="tap-donut-chart">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="100%" paddingAngle={data.length > 1 ? 2 : 0} stroke="none" isAnimationActive={false}>
              {data.map((d) => <Cell key={d.key} fill={RESULT_COLORS[d.key]} />)}
            </Pie>
            <Tooltip {...tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="tap-donut-center">
          <strong>{pct(passRate)}</strong>
          <span>pass rate</span>
        </div>
      </div>
      <ul className="tap-legend">
        {data.map((d) => (
          <li key={d.key}>
            <span className="tap-legend-swatch" style={{ background: RESULT_COLORS[d.key] }} />
            {d.name}
            <strong>{d.value}</strong>
          </li>
        ))}
        <li className="is-total">Total<strong>{statistic.total}</strong></li>
      </ul>
    </div>
  );
}

/* ─── Donut with a counted legend (dashboard) ────────────────────────────── */

/**
 * Donut + legend where each row carries its count and share.
 * `data`: [{ key, name, value, color }]
 */
export function BreakdownDonut({ data, centerValue, centerLabel, emptyTitle = 'No results yet', emptyBody, height = 190 }) {
  const rows = data.filter((d) => d.value);
  const total = rows.reduce((sum, d) => sum + d.value, 0);

  if (!total) return <EmptyState compact title={emptyTitle} icon={CircleDashed}>{emptyBody}</EmptyState>;

  return (
    <div className="tap-donut">
      <div className="tap-donut-chart" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="name" innerRadius="66%" outerRadius="100%"
              paddingAngle={rows.length > 1 ? 2 : 0} stroke="none" isAnimationActive={false}>
              {rows.map((d) => <Cell key={d.key} fill={d.color} />)}
            </Pie>
            <Tooltip {...tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="tap-donut-center">
          <strong>{centerValue ?? total}</strong>
          <span>{centerLabel}</span>
        </div>
      </div>
      <ul className="tap-legend-rows">
        {rows.map((d) => (
          <li key={d.key}>
            <span className="tap-legend-swatch" style={{ background: d.color }} />
            {d.name}
            <strong>{d.value}</strong>
            <span className="tap-legend-pct">({((d.value / total) * 100).toFixed(1)}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── Outcome trend across runs ──────────────────────────────────────────── */

const TREND_SERIES = [
  { key: 'passed', name: 'Passed', color: RESULT_COLORS.passed },
  { key: 'failed', name: 'Failed', color: RESULT_COLORS.failed },
  { key: 'broken', name: 'Broken', color: RESULT_COLORS.broken },
  { key: 'skipped', name: 'Skipped', color: RESULT_COLORS.skipped },
];

export function OutcomeTrendLines({ trend, height = 220 }) {
  if (!trend?.length) {
    return (
      <EmptyState compact title="No trend yet" icon={CircleDashed}>
        Allure records one point each time a report is generated; a second run draws the line.
      </EmptyState>
    );
  }
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
          <Tooltip {...tooltipStyle} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          {TREND_SERIES.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2}
              dot={{ r: 3, fill: s.color }} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Executions by test type ────────────────────────────────────────────── */

export function TypeBars({ data, height = 220, emptyBody }) {
  if (!data.some((d) => d.value)) {
    return <EmptyState compact title="No executions recorded" icon={CircleDashed}>{emptyBody}</EmptyState>;
  }
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 8, bottom: 0, left: -18 }} barCategoryGap="34%">
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} interval={0} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
          <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(148,163,184,.12)' }} />
          <Bar dataKey="value" name="Tests" radius={[5, 5, 0, 0]} maxBarSize={54} isAnimationActive={false}
            label={{ position: 'top', fontSize: 11, fill: '#475569' }}>
            {data.map((d) => <Cell key={d.name} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Trend charts ───────────────────────────────────────────────────────── */

export function PassRateTrend({ trend, height = 220 }) {
  if (!trend?.length) {
    return <EmptyState compact title="No trend yet" icon={CircleDashed}>Trends are read from Allure history and build up each time a report is generated.</EmptyState>;
  }
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="tapPassFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} unit="%" />
          <Tooltip {...tooltipStyle} formatter={(v) => [`${v}%`, 'Pass rate']} />
          <Area type="monotone" dataKey="pass_rate" stroke="#3b82f6" strokeWidth={2} fill="url(#tapPassFill)" dot={{ r: 3, fill: '#3b82f6' }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function OutcomeBars({ data, xKey = 'label', height = 260 }) {
  if (!data?.length) return <EmptyState compact title="No data yet" icon={CircleDashed} />;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} interval={0} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
          <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(148,163,184,.12)' }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="passed" name="Passed" stackId="a" fill={RESULT_COLORS.passed} isAnimationActive={false} />
          <Bar dataKey="failed" name="Failed" stackId="a" fill={RESULT_COLORS.failed} isAnimationActive={false} />
          <Bar dataKey="broken" name="Broken" stackId="a" fill={RESULT_COLORS.broken} isAnimationActive={false} />
          <Bar dataKey="skipped" name="Skipped" stackId="a" fill={RESULT_COLORS.skipped} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── Quality score ──────────────────────────────────────────────────────── */

export function ScoreRing({ score, grade, size = 140 }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const value = score ?? 0;
  const color = score == null ? '#cbd5e1' : score >= 90 ? '#22c55e' : score >= 75 ? '#3b82f6' : score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <div className="tap-score-ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" role="img" aria-label={`Quality score ${score ?? 'unavailable'}`}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="#eef2f7" strokeWidth="10" />
        <circle
          cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="tap-score-center">
        <strong>{score ?? '—'}</strong>
        {grade && <span>Grade {grade}</span>}
      </div>
    </div>
  );
}

/* ─── Release readiness gates ────────────────────────────────────────────── */

const VERDICTS = {
  ready:   { label: 'Ready to release', tone: 'success', text: 'Every gate passes on the latest run.' },
  at_risk: { label: 'At risk', tone: 'warn', text: 'No blocking gate fails, but some quality targets are missed.' },
  blocked: { label: 'Blocked', tone: 'danger', text: 'A blocking gate fails — fix it before promoting this build.' },
  no_data: { label: 'No data', tone: 'muted', text: 'Run a suite so there are results to evaluate.' },
};

export function VerdictBanner({ verdict }) {
  const v = VERDICTS[verdict] || VERDICTS.no_data;
  return (
    <div className={clsx('tap-verdict', `tone-${v.tone}`)}>
      <StatusBadge status={verdict} label={v.label} tone={v.tone} />
      <span>{v.text}</span>
    </div>
  );
}

export function ReadinessGates({ gates }) {
  return (
    <ul className="tap-gates">
      {gates.map((g) => (
        <li key={g.id} className={clsx('tap-gate', g.passed ? 'is-pass' : g.blocking ? 'is-block' : 'is-warn')}>
          {g.passed ? <CheckCircle2 size={18} aria-hidden /> : <XCircle size={18} aria-hidden />}
          <div className="tap-gate-body">
            <div className="tap-gate-label">
              {g.label}
              {g.blocking && <Pill tone="muted"><Lock size={11} aria-hidden /> Blocking</Pill>}
            </div>
            <div className="tap-gate-target">Target {g.target}</div>
          </div>
          <div className="tap-gate-actual">{g.actual ?? 'No data'}</div>
        </li>
      ))}
    </ul>
  );
}

/* ─── Failure guidance ───────────────────────────────────────────────────── */

export function CategoryBars({ categories }) {
  const max = Math.max(1, ...categories.map((c) => c.count));
  return (
    <ul className="tap-cat-bars">
      {categories.map((c) => (
        <li key={c.key}>
          <div className="tap-cat-row">
            <span>{c.label}</span>
            <strong>{c.count}</strong>
          </div>
          <div className="tap-cat-track">
            <div className="tap-cat-fill" style={{ width: `${(c.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
