/**
 * TAP sidebar — single source of truth for the navigation and the routes.
 *
 * App.jsx builds one <Route> per item from this list, so the sidebar and the
 * router cannot drift apart. Item ids are also the keys the backend uses for
 * sidebar badges (GET /platform/sidebar → new_backend/modules/platform_hub).
 */
import {
  LayoutDashboard,
  Play, Grid3x3, Radio, CalendarClock,
  Globe, Smartphone, Braces, Gauge, Workflow,
  ClipboardList, Layers, History,
  Sparkles, BrainCircuit,
  GitBranch, Hammer, GitPullRequest, GitMerge, Package, ShieldCheck,
  Webhook, Activity, Medal, PieChart,
  Ticket, Split, Hash,
  Settings,
} from 'lucide-react';

export const NAV_SECTIONS = [
  {
    id: 'main',
    title: 'Main',
    items: [
      { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    id: 'test-execution',
    title: 'Test Execution',
    items: [
      { id: 'run-tests',        label: 'Run Tests',        path: '/execution/run-tests', icon: Play },
      { id: 'execution-matrix', label: 'Execution Matrix', path: '/execution/matrix',    icon: Grid3x3 },
      { id: 'live-execution',   label: 'Live Execution',   path: '/execution/live',      icon: Radio },
      { id: 'scheduled-runs',   label: 'Scheduled Runs',   path: '/execution/scheduled', icon: CalendarClock },
    ],
  },
  {
    id: 'automation',
    title: 'Automation',
    items: [
      { id: 'web-testing',         label: 'Web Testing',         path: '/automation/web',         icon: Globe },
      { id: 'mobile-testing',      label: 'Mobile Testing',      path: '/automation/mobile',      icon: Smartphone },
      { id: 'api-testing',         label: 'API Testing',         path: '/automation/api',         icon: Braces },
      { id: 'performance-testing', label: 'Performance Testing', path: '/automation/performance', icon: Gauge },
      { id: 'custom-automation',   label: 'Custom Automation',   path: '/automation/custom',      icon: Workflow },
    ],
  },
  {
    id: 'test-management',
    title: 'Test Management',
    items: [
      { id: 'test-cases',  label: 'Test Cases',  path: '/test-management/cases',  icon: ClipboardList },
      { id: 'test-suites', label: 'Test Suites', path: '/test-management/suites', icon: Layers },
      { id: 'test-runs',   label: 'Test Runs',   path: '/test-management/runs',   icon: History },
    ],
  },
  {
    id: 'ai-testing',
    title: 'AI Testing',
    items: [
      { id: 'ai-test-generator',   label: 'AI Test Generator',   path: '/ai/test-generator',   icon: Sparkles },
      { id: 'ai-failure-analysis', label: 'AI Failure Analysis', path: '/ai/failure-analysis', icon: BrainCircuit },
    ],
  },
  {
    id: 'cicd',
    title: 'CI/CD',
    items: [
      { id: 'pipelines',        label: 'Pipelines',        path: '/cicd/pipelines',        icon: GitBranch },
      { id: 'jenkins',          label: 'Jenkins',          path: '/cicd/jenkins',          icon: Hammer },
      { id: 'github-actions',   label: 'GitHub Actions',   path: '/cicd/github-actions',   icon: GitPullRequest },
      { id: 'gitlab-ci',        label: 'GitLab CI',        path: '/cicd/gitlab-ci',        icon: GitMerge },
      { id: 'build-history',    label: 'Build History',    path: '/cicd/builds',           icon: Package },
      { id: 'deployment-gates', label: 'Deployment Gates', path: '/cicd/deployment-gates', icon: ShieldCheck },
    ],
  },
  {
    id: 'reports',
    title: 'Reports',
    items: [
      { id: 'mobile-report',      label: 'Mobile Report',           path: '/reports/mobile',        icon: Smartphone },
      { id: 'web-report',         label: 'Web Report',              path: '/reports/web',           icon: Globe },
      { id: 'api-report',         label: 'API Report',              path: '/reports/api',           icon: Webhook },
      { id: 'performance-report', label: 'Performance Test Report', path: '/reports/performance',   icon: Activity },
      { id: 'quality-score',      label: 'Quality Score',           path: '/reports/quality-score', icon: Medal },
      { id: 'allure-report',      label: 'Allure Report',           path: '/reports/allure',        icon: PieChart },
    ],
  },
  {
    id: 'integrations',
    title: 'Integrations',
    items: [
      { id: 'jira',             label: 'Jira',             path: '/integrations/jira',             icon: Ticket },
      { id: 'parallel-testing', label: 'Parallel Testing', path: '/integrations/parallel-testing', icon: Split },
      { id: 'slack',            label: 'Slack',            path: '/integrations/slack',            icon: Hash },
    ],
  },
  {
    id: 'settings',
    title: 'Settings',
    items: [
      { id: 'settings', label: 'Settings', path: '/settings', icon: Settings },
    ],
  },
];

export const NAV_ITEMS = NAV_SECTIONS.flatMap((section) =>
  section.items.map((item) => ({ ...item, section: section.title, sectionId: section.id })),
);

export const DEFAULT_PATH = '/dashboard';

// Paths that existed in earlier versions of the sidebar keep working.
export const LEGACY_REDIRECTS = {
  '/jira-history':                    '/integrations/jira',
  '/api-matrix':                      '/automation/api',
  '/api-batch':                       '/automation/performance',
  '/execution/queue':                 '/execution/live',
  '/infrastructure/devices':          '/automation/mobile',
  '/infrastructure/browsers':         '/automation/web',
  '/infrastructure/environments':     '/settings',
  '/infrastructure/grid':             '/settings',
  '/infrastructure/docker':           '/settings',
  '/infrastructure/kubernetes':       '/settings',
  '/intelligence/overview':           '/reports/quality-score',
  '/intelligence/quality-score':      '/reports/quality-score',
  '/intelligence/failure-trends':     '/reports/quality-score',
  '/intelligence/flaky-tests':        '/reports/quality-score',
  '/intelligence/risk':               '/reports/quality-score',
  '/intelligence/coverage':           '/execution/matrix',
  '/intelligence/release-readiness':  '/cicd/deployment-gates',
  '/reports/tests':                   '/reports/allure',
  '/reports/automation':              '/reports/mobile',
  '/reports/devices':                 '/reports/mobile',
  '/reports/quality':                 '/reports/quality-score',
  '/reports/custom':                  '/reports/allure',
};

export function findNavItem(pathname) {
  return NAV_ITEMS.find((item) => pathname === item.path || pathname.startsWith(`${item.path}/`));
}

export function navItem(id) {
  return NAV_ITEMS.find((item) => item.id === id);
}
