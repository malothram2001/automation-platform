import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronDown, ChevronsLeft, ChevronsRight, FlaskConical, X } from 'lucide-react';
import { NAV_SECTIONS, findNavItem } from '../../config/navigation';
import useApi from '../../hooks/useApi';
import './Sidebar.css';

const PREFS_KEY = 'tap.sidebar';
const BADGE_POLL_MS = 15000;

function readPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
  } catch {
    return {};
  }
}

function writePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable (private mode) — preferences just won't persist */
  }
}

function Badge({ label, tone, rail }) {
  if (rail) return <span className={clsx('tap-badge-dot', `tone-${tone}`)} aria-label={label} />;
  return (
    <span className={clsx('tap-badge', `tone-${tone}`)}>
      {tone === 'live' && <span className="tap-badge-pulse" aria-hidden />}
      {label}
    </span>
  );
}

export default function Sidebar({ mobileOpen = false, onClose }) {
  const { pathname } = useLocation();

  const [collapsed, setCollapsed] = useState(() => Boolean(readPrefs().collapsed));
  const [closedSections, setClosedSections] = useState(() => readPrefs().closedSections || []);

  const { data: sidebar, error: sidebarError } = useApi('/platform/sidebar', { interval: BADGE_POLL_MS });
  const badges = sidebar?.badges || {};
  const activeSection = findNavItem(pathname)?.sectionId;
  const rail = collapsed && !mobileOpen; // the mobile drawer always shows labels

  useEffect(() => {
    writePrefs({ collapsed, closedSections });
  }, [collapsed, closedSections]);

  // Navigating into a collapsed section opens it; the user can close it again.
  // (State adjusted during render when the route's section changes.)
  const [openedFor, setOpenedFor] = useState(null);
  if (activeSection && activeSection !== openedFor) {
    setOpenedFor(activeSection);
    setClosedSections((prev) => prev.filter((id) => id !== activeSection));
  }

  const toggleSection = (id) =>
    setClosedSections((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const connection = sidebarError ? 'offline' : sidebar ? 'online' : 'connecting';
  const connectionLabel = { online: 'Backend connected', offline: 'Backend offline', connecting: 'Connecting…' }[connection];

  return (
    <aside className={clsx('tap-sidebar', rail && 'is-rail', mobileOpen && 'is-mobile-open')} aria-label="Main navigation">
      <div className="tap-brand">
        <div className="tap-brand-mark" aria-hidden>
          <FlaskConical size={18} strokeWidth={2.25} />
        </div>
        {!rail && (
          <div className="tap-brand-text">
            <span className="tap-brand-name">TAP</span>
            <span className="tap-brand-sub">Test Automation Platform</span>
          </div>
        )}
        {mobileOpen && (
          <button type="button" className="tap-side-icon-btn tap-brand-close" onClick={onClose} aria-label="Close navigation">
            <X size={18} />
          </button>
        )}
      </div>

      <nav className="tap-nav">
        {NAV_SECTIONS.map((section) => {
          const collapsible = section.items.length > 1 && !rail;
          const open = !collapsible || !closedSections.includes(section.id);
          const hiddenBadge = !open && section.items.some((item) => badges[item.id]);

          return (
            <div className="tap-nav-section" key={section.id}>
              {rail ? (
                <div className="tap-nav-divider" aria-hidden />
              ) : collapsible ? (
                <button
                  type="button"
                  className="tap-nav-heading"
                  onClick={() => toggleSection(section.id)}
                  aria-expanded={open}
                >
                  <span>{section.title}</span>
                  {hiddenBadge && <span className="tap-heading-dot" aria-label="Has updates" />}
                  <ChevronDown size={14} className={clsx('tap-nav-chevron', !open && 'is-closed')} aria-hidden />
                </button>
              ) : (
                <div className="tap-nav-heading is-static">{section.title}</div>
              )}

              {open && (
                <ul className="tap-nav-list">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const badge = badges[item.id];
                    return (
                      <li key={item.id}>
                        <NavLink
                          to={item.path}
                          className={({ isActive }) => clsx('tap-nav-item', isActive && 'is-active')}
                          title={rail ? item.label : undefined}
                          onClick={() => onClose?.()}
                        >
                          <Icon size={18} className="tap-nav-icon" aria-hidden />
                          {!rail && <span className="tap-nav-label">{item.label}</span>}
                          {badge && <Badge {...badge} rail={rail} />}
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      <div className="tap-sidebar-footer">
        <span className={clsx('tap-conn', `is-${connection}`)} title={connectionLabel}>
          <span className="tap-conn-dot" aria-hidden />
          {!rail && connectionLabel}
        </span>
        {!mobileOpen && (
          <button
            type="button"
            className="tap-side-icon-btn"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'}
            title={rail ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {rail ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          </button>
        )}
      </div>
    </aside>
  );
}
