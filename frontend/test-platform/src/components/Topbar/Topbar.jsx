import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Activity, Bell, Menu, Search } from 'lucide-react';
import { NAV_ITEMS } from '../../config/navigation';
import { useWorkspace } from '../../context/workspaceContext';
import useApi from '../../hooks/useApi';
import './Topbar.css';

/** Labelled dropdown, matching the workspace selectors in the TAP reference UI. */
function ContextSelect({ label, value, onChange, options, disabled }) {
  return (
    <label className="tap-ctx">
      <span className="tap-ctx-label">{label}</span>
      <select
        className="tap-ctx-select"
        value={value ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled || options.length <= 1}
        aria-label={label}
      >
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );
}

export default function Topbar({ onOpenNav }) {
  const navigate = useNavigate();
  const { context, application, variant, environment, setSelection } = useWorkspace();
  const { data: status } = useApi('/platform/sidebar', { interval: 15000 });
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return NAV_ITEMS.filter((i) => i.label.toLowerCase().includes(q) || i.section.toLowerCase().includes(q)).slice(0, 8);
  }, [query]);

  // "/" jumps to page search from anywhere, as long as the user isn't typing.
  useEffect(() => {
    const onKeyDown = (e) => {
      const el = e.target;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable;
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || typing) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const onClickAway = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, []);

  const go = (item) => {
    navigate(item.path);
    setQuery('');
    setOpen(false);
  };

  const failures = status?.failures || 0;

  return (
    <header className="tap-topbar">
      <button type="button" className="tap-topbar-menu" onClick={onOpenNav} aria-label="Open navigation">
        <Menu size={20} />
      </button>

      <div className="tap-topbar-context">
        <ContextSelect label="Project" value={context ? 'krishivaas' : ''} options={context ? [{ id: 'krishivaas', label: context.project }] : []} />
        <ContextSelect
          label="Application"
          value={application}
          options={context?.applications || []}
          onChange={(id) => setSelection({ application: id })}
        />
        <ContextSelect
          label="Variant"
          value={variant}
          options={[{ id: 'all', label: 'All variants' }, ...(context?.variants || [])]}
          onChange={(id) => setSelection({ variant: id })}
        />
        <ContextSelect
          label="Environment"
          value={environment || ''}
          options={context?.environments || []}
          onChange={(id) => setSelection({ environment: id })}
        />
      </div>

      <div className="tap-topbar-search" ref={boxRef}>
        <Search size={15} aria-hidden />
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder="Search pages…  /"
          aria-label="Search pages"
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches[0]) go(matches[0]);
            if (e.key === 'Escape') { setQuery(''); setOpen(false); }
          }}
        />
        {open && matches.length > 0 && (
          <ul className="tap-topbar-results">
            {matches.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => go(item)}>
                  <item.icon size={15} aria-hidden />
                  <span>{item.label}</span>
                  <small>{item.section}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="tap-topbar-right">
        <span className={clsx('tap-topbar-status', status?.running && 'is-live')} title={status?.running ? 'A test run is in progress' : 'Runner idle'}>
          <Activity size={14} aria-hidden />
          {status?.running ? 'Running' : 'Idle'}
        </span>
        <button
          type="button"
          className="tap-topbar-icon"
          onClick={() => navigate('/ai/failure-analysis')}
          aria-label={failures ? `${failures} failing tests` : 'No failing tests'}
          title={failures ? `${failures} failing tests in the latest run` : 'No failing tests in the latest run'}
        >
          <Bell size={18} />
          {failures > 0 && <span className="tap-topbar-badge">{failures}</span>}
        </button>
      </div>
    </header>
  );
}
