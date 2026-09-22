/**
 * App.jsx
 *
 * Routing: one <Route> per sidebar item, generated from config/navigation.js.
 * ROUTE_ELEMENTS maps each item id to its page, so adding a sidebar entry
 * without a page (or the reverse) shows up immediately as a console warning.
 *
 * Shared state flow:
 *   JiraHistoryContext holds the history array.
 *   IssuePanel (inside TestScreen) calls addToJiraHistory() when:
 *     - user clicks Create  → type: "created"  → shows in Assigned tab
 *     - user clicks Remove  → type: "removed"  → shows in Unassigned tab
 *   JiraHistory screen reads the history from context.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";

import Sidebar from "./components/Sidebar/Sidebar";
import Topbar from "./components/Topbar/Topbar";
import WorkspaceProvider from "./context/WorkspaceProvider";
import { Skeleton } from "./components/ui/ui";
import { NAV_ITEMS, DEFAULT_PATH, LEGACY_REDIRECTS, findNavItem } from "./config/navigation";
import "./App.css";
import "./components/ui/ui.css";
import "./styles/tap.css";

/* Pages are code-split per section so the first load only pulls what it shows. */
const page = (load, name = "default") => lazy(() => load().then((m) => ({ default: m[name] })));

const TestScreen      = page(() => import("./components/TestScreen/TestScreen"));
const JiraHistory     = page(() => import("./components/JiraHistory/JiraHistory"));
const APIMatrixTester = page(() => import("./components/APIMatrixTester/APIMatrixTester"));
const APIBatchTester  = page(() => import("./components/APIBatchTester/APIBatchTester"));

const execution    = () => import("./pages/ExecutionPages");
const automation   = () => import("./pages/AutomationPages");
const management   = () => import("./pages/TestManagementPages");
const ai           = () => import("./pages/AIPages");
const cicd         = () => import("./pages/CICDPages");
const reports      = () => import("./pages/ReportPages");
const integrations = () => import("./pages/IntegrationPages");

const DashboardPage          = page(() => import("./pages/DashboardPage"));
const ExecutionMatrixPage    = page(execution, "ExecutionMatrixPage");
const LiveExecutionPage      = page(execution, "LiveExecutionPage");
const ScheduledRunsPage      = page(execution, "ScheduledRunsPage");
const WebTestingPage         = page(automation, "WebTestingPage");
const MobileTestingPage      = page(automation, "MobileTestingPage");
const CustomAutomationPage   = page(automation, "CustomAutomationPage");
const TestCasesPage          = page(management, "TestCasesPage");
const TestSuitesPage         = page(management, "TestSuitesPage");
const TestRunsPage           = page(management, "TestRunsPage");
const AITestGeneratorPage    = page(ai, "AITestGeneratorPage");
const AIFailureAnalysisPage  = page(ai, "AIFailureAnalysisPage");
const PipelinesPage          = page(cicd, "PipelinesPage");
const JenkinsPage            = page(cicd, "JenkinsPage");
const GitHubActionsPage      = page(cicd, "GitHubActionsPage");
const GitLabCIPage           = page(cicd, "GitLabCIPage");
const BuildHistoryPage       = page(cicd, "BuildHistoryPage");
const DeploymentGatesPage    = page(cicd, "DeploymentGatesPage");
const MobileReportPage       = page(reports, "MobileReportPage");
const WebReportPage          = page(reports, "WebReportPage");
const ApiReportPage          = page(reports, "ApiReportPage");
const PerformanceReportPage  = page(reports, "PerformanceReportPage");
const QualityScorePage       = page(reports, "QualityScorePage");
const AllureReportPage       = page(reports, "AllureReportPage");
const ParallelTestingPage    = page(integrations, "ParallelTestingPage");
const SlackPage              = page(integrations, "SlackPage");
const SettingsPage           = page(() => import("./pages/SettingsPage"));

/* ─── Shared Jira History Context ─────────────────────────────────────────── */
export const JiraHistoryContext = createContext({
  history:           [],
  addToJiraHistory:  () => {},
});

export function useJiraHistory() {
  return useContext(JiraHistoryContext);
}

function JiraHistoryProvider({ children }) {
  const [history, setHistory] = useState([]);

  const addToJiraHistory = useCallback((entry) => {
    // entry shape: { type: "created"|"removed", issueId, title,
    //               jiraUrl, module, priority, developer,
    //               savedAt, ... }
    setHistory((prev) => {
      // Deduplicate by issueId for "created" entries
      if (entry.type === "created" && entry.issueId) {
        const exists = prev.some(
          (h) => h.type === "created" && h.issueId === entry.issueId
        );
        if (exists) return prev;
      }
      return [entry, ...prev];
    });
  }, []);

  return (
    <JiraHistoryContext.Provider value={{ history, addToJiraHistory }}>
      {children}
    </JiraHistoryContext.Provider>
  );
}

/* ─── Layout ──────────────────────────────────────────────────────────────── */
function Layout() {
  const { pathname } = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const current = findNavItem(pathname);

  useEffect(() => {
    document.title = current ? `${current.label} · TAP` : "TAP — Test Automation Platform";
  }, [current]);

  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const onKeyDown = (e) => e.key === "Escape" && setMobileNavOpen(false);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileNavOpen]);

  return (
    <div className="app-layout">
      <div className={`tap-backdrop${mobileNavOpen ? " is-open" : ""}`} onClick={() => setMobileNavOpen(false)} aria-hidden />
      <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="tap-main">
        <Topbar onOpenNav={() => setMobileNavOpen(true)} />
        <main className="app-layout-content">
          <Suspense fallback={<div className="tap-page"><Skeleton rows={4} /></div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

/* ─── TestScreen wrapper — injects onHistoryUpdate into IssuePanel ─────────
 *
 * TestScreen renders IssuePanel internally.
 * We pass addToJiraHistory down so IssuePanel can call it.
 * ─────────────────────────────────────────────────────────────────────────── */
function TestScreenWithHistory() {
  const { addToJiraHistory } = useJiraHistory();
  return <TestScreen onHistoryUpdate={addToJiraHistory} />;
}

/* ─── JiraHistory wrapper — reads from context ───────────────────────────── */
function JiraHistoryWithContext() {
  const { history } = useJiraHistory();
  return <JiraHistory issuePanelHistory={history} />;
}

/* ─── Sidebar item id → page ─────────────────────────────────────────────── */
const ROUTE_ELEMENTS = {
  // Main
  "dashboard":           <DashboardPage />,
  // Test execution
  "run-tests":           <TestScreenWithHistory />,
  "execution-matrix":    <ExecutionMatrixPage />,
  "live-execution":      <LiveExecutionPage />,
  "scheduled-runs":      <ScheduledRunsPage />,
  // Automation workspaces
  "web-testing":         <WebTestingPage />,
  "mobile-testing":      <MobileTestingPage />,
  "api-testing":         <APIMatrixTester />,
  "performance-testing": <APIBatchTester />,
  "custom-automation":   <CustomAutomationPage />,
  // Test management
  "test-cases":          <TestCasesPage />,
  "test-suites":         <TestSuitesPage />,
  "test-runs":           <TestRunsPage />,
  // AI testing
  "ai-test-generator":   <AITestGeneratorPage />,
  "ai-failure-analysis": <AIFailureAnalysisPage />,
  // CI/CD
  "pipelines":           <PipelinesPage />,
  "jenkins":             <JenkinsPage />,
  "github-actions":      <GitHubActionsPage />,
  "gitlab-ci":           <GitLabCIPage />,
  "build-history":       <BuildHistoryPage />,
  "deployment-gates":    <DeploymentGatesPage />,
  // Reports
  "mobile-report":       <MobileReportPage />,
  "web-report":          <WebReportPage />,
  "api-report":          <ApiReportPage />,
  "performance-report":  <PerformanceReportPage />,
  "quality-score":       <QualityScorePage />,
  "allure-report":       <AllureReportPage />,
  // Integrations
  "jira":                <JiraHistoryWithContext />,
  "parallel-testing":    <ParallelTestingPage />,
  "slack":               <SlackPage />,
  // Settings
  "settings":            <SettingsPage />,
};

if (import.meta.env.DEV) {
  const missing = NAV_ITEMS.filter((item) => !ROUTE_ELEMENTS[item.id]).map((item) => item.id);
  const orphaned = Object.keys(ROUTE_ELEMENTS).filter((id) => !NAV_ITEMS.some((item) => item.id === id));
  if (missing.length) console.warn("[TAP] Sidebar items without a page:", missing);
  if (orphaned.length) console.warn("[TAP] Pages without a sidebar item:", orphaned);
}

/* ─── App ─────────────────────────────────────────────────────────────────── */
function App() {
  return (
    <JiraHistoryProvider>
      <BrowserRouter>
        <WorkspaceProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Navigate to={DEFAULT_PATH} replace />} />
              {NAV_ITEMS.map((item) => (
                <Route key={item.id} path={item.path} element={ROUTE_ELEMENTS[item.id]} />
              ))}
              {Object.entries(LEGACY_REDIRECTS).map(([from, to]) => (
                <Route key={from} path={from} element={<Navigate to={to} replace />} />
              ))}
            </Route>
            <Route path="*" element={<Navigate to={DEFAULT_PATH} replace />} />
          </Routes>
        </WorkspaceProvider>
      </BrowserRouter>
    </JiraHistoryProvider>
  );
}

export default App;
