// Formatting and status helpers shared by the TAP pages.

export function formatDuration(ms) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function timeAgo(iso) {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (Number.isNaN(diff)) return '—';
  const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, secs] of units) {
    if (Math.abs(diff) >= secs) {
      return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(-Math.round(diff / secs), unit);
    }
  }
  return 'just now';
}

export const pct = (v) => (v == null ? '—' : `${Number(v).toFixed(v % 1 ? 1 : 0)}%`);

export function humanize(text) {
  if (!text) return '';
  const s = String(text).replace(/[_-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const STATUS_TONES = {
  success: ['passed', 'completed', 'configured', 'connected', 'ready', 'success', 'installed', 'device', 'online', 'low'],
  danger:  ['failed', 'broken', 'blocked', 'offline', 'error', 'high', 'unauthorized', 'missing'],
  info:    ['running', 'starting', 'live', 'pending', 'queued'],
  warn:    ['partial', 'at_risk', 'incomplete', 'medium', 'flaky', 'warning'],
};

export function statusTone(status) {
  const s = String(status || '').toLowerCase();
  return Object.keys(STATUS_TONES).find((tone) => STATUS_TONES[tone].includes(s)) || 'muted';
}

export function passRateTone(rate) {
  if (rate == null) return 'muted';
  if (rate >= 95) return 'success';
  if (rate >= 75) return 'warn';
  return 'danger';
}

// Turn rows into a CSV download (used by Custom Reports).
export function downloadCsv(filename, columns, rows) {
  const escape = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [columns.map((c) => escape(c.header)).join(','), ...rows.map((r) => columns.map((c) => escape(r[c.key])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
