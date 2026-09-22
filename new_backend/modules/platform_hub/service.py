"""
Platform hub: data behind the sidebar shell itself.

  - sidebar badges (live run, queue depth, pending Jira issues, devices, flaky tests)
  - dashboard summary
  - integration / tooling status for the CI/CD, infrastructure and integration pages
  - connected Android devices and locally installed browsers

Integration status is derived from environment variables and CLIs on PATH.
Secret values are never returned — only whether they are set.
"""
import importlib.metadata
import importlib.util
import os
import shutil
import socket
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

from new_backend.core import state as core_state
from new_backend.core.utils import make_dismiss_key
from new_backend.modules.reporting.service import build_summary, build_intelligence
from new_backend.modules.slack.config import APP_VARIANTS
from new_backend.modules.test_management.service import (
    SUITE_LABELS, build_matrix, build_queue, discover_test_cases, list_runs, list_suites,
)

load_dotenv()

# Keys must match the item ids in frontend/test-platform/src/config/navigation.js
INTEGRATIONS = [
    {"id": "jira",           "name": "Jira",           "category": "Integrations",   "env": ["JIRA_URL", "JIRA_EMAIL", "JIRA_API_TOKEN", "JIRA_PROJECT_KEY"]},
    {"id": "slack",          "name": "Slack",          "category": "Integrations",   "env": ["SLACK_BOT_TOKEN", "SLACK_NOTIFY_CHANNEL"]},
    {"id": "gemini",         "name": "Gemini LLM",     "category": "AI",             "env": ["GEMINI_API_KEY"]},
    {"id": "mongodb",        "name": "MongoDB",        "category": "Data",           "env": ["MONGO_URL"]},
    {"id": "jenkins",        "name": "Jenkins",        "category": "CI/CD",          "env": ["JENKINS_URL", "JENKINS_USER", "JENKINS_API_TOKEN"]},
    {"id": "github_actions", "name": "GitHub Actions", "category": "CI/CD",          "env": ["GITHUB_TOKEN", "GITHUB_REPOSITORY"]},
    {"id": "gitlab_ci",      "name": "GitLab CI",      "category": "CI/CD",          "env": ["GITLAB_URL", "GITLAB_TOKEN", "GITLAB_PROJECT_ID"]},
    {"id": "selenium_grid",  "name": "Selenium Grid",  "category": "Infrastructure", "env": ["SELENIUM_GRID_URL"]},
    {"id": "docker",         "name": "Docker",         "category": "Infrastructure", "cli": ["docker"]},
    {"id": "kubernetes",     "name": "Kubernetes",     "category": "Infrastructure", "cli": ["kubectl"]},
    {"id": "appium",         "name": "Appium",         "category": "Infrastructure", "cli": ["appium"]},
    {"id": "adb",            "name": "Android ADB",    "category": "Infrastructure", "cli": ["adb"]},
    {"id": "allure",         "name": "Allure CLI",     "category": "Reporting",      "cli": ["allure", "allure.cmd"]},
    {"id": "k6",             "name": "k6",             "category": "Performance",    "cli": ["k6"]},
    {"id": "grafana",        "name": "Grafana",        "category": "Performance",    "env": ["GRAFANA_URL"]},
    {"id": "influxdb",       "name": "InfluxDB",       "category": "Performance",    "env": ["INFLUXDB_URL"]},
    {"id": "pytest_xdist",   "name": "pytest-xdist",   "category": "Execution",      "python": "xdist"},
]


def _port_open(port: int, timeout: float = 0.3) -> bool:
    # core.state.is_appium_running() uses a blocking connect, which takes ~2s to
    # be refused on Windows when nothing is listening; a short timeout avoids that.
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(timeout)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def appium_running() -> bool:
    return _port_open(core_state.APPIUM_PORT)


def _run(cmd: list[str], timeout: float = 5) -> str | None:
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return out.stdout if out.returncode == 0 else None
    except (OSError, subprocess.SubprocessError):
        return None


# ── Integrations ─────────────────────────────────────────────────────────────

def list_integrations(appium_up: bool | None = None) -> list[dict]:
    appium_up = appium_running() if appium_up is None else appium_up
    items = []
    for spec in INTEGRATIONS:
        item = {"id": spec["id"], "name": spec["name"], "category": spec["category"]}

        if "env" in spec:
            missing = [v for v in spec["env"] if not os.getenv(v, "").strip()]
            item["requires"] = spec["env"]
            item["missing"] = missing
            status = "configured" if not missing else "partial" if len(missing) < len(spec["env"]) else "not_configured"
        elif "cli" in spec:
            found = next((c for c in spec["cli"] if shutil.which(c)), None)
            item["requires"] = [f"`{spec['cli'][0]}` on PATH"]
            item["missing"] = [] if found else item["requires"]
            status = "configured" if found else "not_configured"
        else:
            found = importlib.util.find_spec(spec["python"]) is not None
            item["requires"] = [f"Python package `{spec['name']}`"]
            item["missing"] = [] if found else item["requires"]
            status = "configured" if found else "not_configured"

        # Upgrade to "connected" where there is a live signal.
        if spec["id"] == "mongodb" and core_state.state.db_connected:
            status = "connected"
        if spec["id"] == "appium" and appium_up:
            status = "connected"

        item["status"] = status
        items.append(item)
    return items


# ── Devices & browsers ───────────────────────────────────────────────────────

def list_devices(details: bool = True) -> dict:
    """Android devices from `adb devices -l`; `details` adds a getprop call per device."""
    if not shutil.which("adb"):
        return {"adb_available": False, "devices": []}

    output = _run(["adb", "devices", "-l"]) or ""
    devices = []
    for line in output.splitlines()[1:]:
        parts = line.split()
        if len(parts) < 2:
            continue
        props = dict(p.split(":", 1) for p in parts[2:] if ":" in p)
        device = {
            "serial":   parts[0],
            "state":    parts[1],
            "kind":     "emulator" if parts[0].startswith("emulator-") else "physical",
            "model":    props.get("model", "").replace("_", " ") or None,
            "product":  props.get("product"),
            "transport_id": props.get("transport_id"),
            "android_version": None,
            "manufacturer":    None,
        }
        if details and device["state"] == "device":
            info = _run(["adb", "-s", parts[0], "shell",
                         "getprop ro.build.version.release; getprop ro.product.manufacturer"], timeout=4)
            if info:
                lines = [l.strip() for l in info.splitlines()]
                device["android_version"] = lines[0] if lines else None
                device["manufacturer"] = lines[1] if len(lines) > 1 else None
        devices.append(device)
    return {"adb_available": True, "devices": devices}


_BROWSERS = {
    "Google Chrome": {
        "which": ["chrome", "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"],
        "paths": [r"%ProgramFiles%\Google\Chrome\Application\chrome.exe",
                  r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe",
                  r"%LocalAppData%\Google\Chrome\Application\chrome.exe",
                  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
        "driver": "chromedriver",
    },
    "Microsoft Edge": {
        "which": ["msedge", "microsoft-edge", "microsoft-edge-stable"],
        "paths": [r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe",
                  r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe",
                  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"],
        "driver": "msedgedriver",
    },
    "Mozilla Firefox": {
        "which": ["firefox"],
        "paths": [r"%ProgramFiles%\Mozilla Firefox\firefox.exe",
                  r"%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe",
                  "/Applications/Firefox.app/Contents/MacOS/firefox"],
        "driver": "geckodriver",
    },
    "Safari": {
        "which": [],
        "paths": ["/Applications/Safari.app/Contents/MacOS/Safari"],
        "driver": "safaridriver",
    },
}


def list_browsers() -> dict:
    browsers = []
    for name, spec in _BROWSERS.items():
        path = next((shutil.which(c) for c in spec["which"] if shutil.which(c)), None)
        if not path:
            path = next((p for p in (os.path.expandvars(x) for x in spec["paths"]) if Path(p).is_file()), None)
        browsers.append({
            "name":      name,
            "installed": path is not None,
            "path":      path,
            "driver":    spec["driver"],
            "driver_on_path": shutil.which(spec["driver"]) is not None,
        })

    try:
        selenium_version = importlib.metadata.version("selenium")
    except importlib.metadata.PackageNotFoundError:
        selenium_version = None

    return {
        "browsers": browsers,
        "selenium_version": selenium_version,
        # Selenium ≥ 4.6 resolves drivers itself via Selenium Manager.
        "selenium_manager": bool(selenium_version) and tuple(int(x) for x in selenium_version.split(".")[:2]) >= (4, 6),
        "grid_url_configured": bool(os.getenv("SELENIUM_GRID_URL", "").strip()),
    }


# ── Jira pending issues ──────────────────────────────────────────────────────

def _pending_jira_count() -> int:
    # The Jira module keeps its own reference to the payload list (core.state
    # rebinds it on reset), so read it from there when it is loaded.
    jira = sys.modules.get("new_backend.modules.jira.service")
    payloads = getattr(jira, "pending_payloads", core_state.pending_payloads)
    dismissed = getattr(jira, "dismissed_keys", core_state.dismissed_keys)
    return sum(1 for p in payloads if make_dismiss_key(p) not in dismissed)


# ── Sidebar & dashboard ──────────────────────────────────────────────────────

def build_sidebar() -> dict:
    """Live badges keyed by navigation item id. Items without a badge are omitted."""
    queue = build_queue()
    intel = build_intelligence()
    devices = [d for d in list_devices(details=False)["devices"] if d["state"] == "device"]
    pending = _pending_jira_count()
    failed = intel["statistic"]["failed"] + intel["statistic"]["broken"]

    badges = {}
    if queue["test_process_running"] or queue["active"]:
        badges["live-execution"] = {"label": "LIVE", "tone": "live"}
    if devices:
        badges["mobile-testing"] = {"label": str(len(devices)), "tone": "success"}
    if failed:
        badges["ai-failure-analysis"] = {"label": str(failed), "tone": "danger"}
    if pending:
        badges["jira"] = {"label": str(pending), "tone": "warn"}

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "badges": badges,
        "running": queue["test_process_running"],
        "failures": failed,
        "flaky": len(intel["flaky"]),
    }


# ── Workspace context (top bar selectors) ────────────────────────────────────

# Environments the team runs against. Override with TAP_ENVIRONMENTS="Dev,QA,Prod".
DEFAULT_ENVIRONMENTS = ["Development", "Staging", "Production"]


def build_context() -> dict:
    """Project / application / variant / environment choices for the top bar."""
    environments = [e.strip() for e in os.getenv("TAP_ENVIRONMENTS", "").split(",") if e.strip()]
    environments = environments or DEFAULT_ENVIRONMENTS

    variants = [
        {"id": variant_id, "label": SUITE_LABELS.get(variant_id, variant_id), "modules": len(modules)}
        for variant_id, modules in APP_VARIANTS.items()
    ]

    return {
        "project": "Krishivaas",
        "applications": [{"id": "krishivaas", "label": "Krishivaas (Unified App)"}],
        "variants": variants,
        "environments": [{"id": e.lower(), "label": e} for e in environments],
        "default_environment": (os.getenv("APP_ENV") or environments[0]).lower(),
    }


def build_dashboard() -> dict:
    summary = build_summary()
    matrix = build_matrix()
    intel = build_intelligence(coverage_pct=matrix["coverage_pct"])
    cases = discover_test_cases()
    runs = list_runs()
    appium_up = appium_running()
    integrations = list_integrations(appium_up)
    devices = [d for d in list_devices(details=False)["devices"] if d["state"] == "device"]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "kpis": {
            "test_cases":        len(cases),
            "suites":            len(list_suites()),
            "mobile_cases":      sum(1 for c in cases if c["platform"] == "mobile"),
            "web_cases":         sum(1 for c in cases if c["platform"] == "web"),
            "session_runs":      len(runs),
            "test_running":      build_queue()["test_process_running"],
            "last_pass_rate":    summary["pass_rate"],
            "last_run_at":       summary["finished_at"],
            "last_run_duration_ms": summary["duration_ms"],
            "quality_score":     intel["quality_score"]["score"],
            "quality_grade":     intel["quality_score"]["grade"],
            "coverage_pct":      matrix["coverage_pct"],
            "flaky_tests":       len(intel["flaky"]),
            "jira_created":      len(core_state.jira_history),
            "jira_pending":      _pending_jira_count(),
            "devices_connected": len(devices),
            "appium_running":    appium_up,
            "db_connected":      core_state.state.db_connected,
        },
        "latest_run":   {k: summary[k] for k in ("statistic", "pass_rate", "started_at", "finished_at", "duration_ms")},
        "trend":        intel["trend"][-10:],
        "by_suite":     summary["by_suite"],
        "recent_failures": [
            {k: r[k] for k in ("name", "suite", "message", "failure", "failed_step")}
            for r in intel["failed_tests"][:5]
        ],
        "recent_runs":  runs[:5],
        "readiness":    intel["readiness"]["verdict"],
        "integrations": {
            "ready": sum(1 for i in integrations if i["status"] in ("configured", "connected")),
            "total": len(integrations),
            "items": [{k: i[k] for k in ("id", "name", "category", "status")} for i in integrations],
        },
    }
