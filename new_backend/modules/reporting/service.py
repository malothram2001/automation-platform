"""
Reports & quality intelligence built from the Allure output on disk.

Allure is the platform's only persistent record of test outcomes:
  - allure-results/          raw results of the latest run (tests/test_runner.py
                             cleans it before every run)
  - allure-report/history/   per-run trend + per-test history across runs,
                             written each time `allure generate` runs

Everything here is read-only and recomputed per request; the files are small.
"""
import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from new_backend.modules.test_management import test_types as tt

PROJECT_ROOT       = Path(__file__).resolve().parents[3]
ALLURE_RESULTS_DIR = PROJECT_ROOT / "allure-results"
ALLURE_REPORT_DIR  = PROJECT_ROOT / "allure-report"

FAIL_STATUSES = {"failed", "broken"}

# Release-readiness thresholds
MIN_PASS_RATE      = 95.0   # % of latest-run tests passing
MAX_FLAKY_SHARE    = 10.0   # % of tests allowed to be flaky
MIN_COVERAGE       = 80.0   # % of planned modules with a test file
MAX_RUN_AGE_DAYS   = 7      # latest run must be this fresh
BLOCKING_SEVERITY  = {"blocker", "critical"}

# Ordered: first match wins, so the more specific categories come first.
FAILURE_CATEGORIES = [
    ("ocr",          "OCR / visual match",    re.compile(r"\bocr\b|tesseract|template match", re.I)),
    ("locator",      "Element not found",     re.compile(r"nosuchelement|no such element|unable to locate|could not (find|locate)|element not (found|visible|interactable)|stale element", re.I)),
    ("timeout",      "Timeout",               re.compile(r"timeout|timed out|wait.*exceeded", re.I)),
    ("session",      "Driver / session",      re.compile(r"invalidsession|session not created|webdriverexception|appium|uiautomator|adb", re.I)),
    ("network",      "Network / API",         re.compile(r"connection (refused|reset|error)|status code|http\s?\d{3}|\b5\d\d\b|requests\.exceptions", re.I)),
    ("assertion",    "Assertion",             re.compile(r"assert", re.I)),
]


# ── File helpers ─────────────────────────────────────────────────────────────

def _read_json(path: Path, default):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return default


def _iso(ms: int | None) -> str | None:
    if not ms:
        return None
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()


def _pass_rate(passed: int, total: int) -> float | None:
    return round(passed * 100 / total, 1) if total else None


def _suite_key(parent_suite: str) -> str:
    # "tests.test_cases.regular_farmer_test_cases" → "regular_farmer"
    last = (parent_suite or "").split(".")[-1]
    return last.removesuffix("_test_cases") or "unknown"


def classify_failure(message: str | None) -> dict:
    text = message or ""
    for key, label, pattern in FAILURE_CATEGORIES:
        if pattern.search(text):
            return {"key": key, "label": label}
    return {"key": "other", "label": "Other"}


# ── Loaders ──────────────────────────────────────────────────────────────────

def load_results_from(results_dir: Path) -> list[dict]:
    """Normalised results of one allure-results folder, newest first.

    Platform runs write into var/runs/<run_id>/allure-results, so a run can be
    read back on its own; the repository-level folder holds the latest run.
    """
    results = []
    for path in Path(results_dir).glob("*-result.json"):
        raw = _read_json(path, None)
        if not isinstance(raw, dict):
            continue

        labels = {l.get("name"): l.get("value") for l in raw.get("labels", []) if l.get("name")}
        tags = [l.get("value") for l in raw.get("labels", []) if l.get("name") == "tag" and l.get("value")]
        declared_type = tt.from_metadata(tags=tags, labels=labels)
        details = raw.get("statusDetails") or {}
        steps = raw.get("steps") or []
        failed_step = next((s.get("name") for s in steps if s.get("status") in FAIL_STATUSES), None)
        start, stop = raw.get("start"), raw.get("stop")
        status = raw.get("status", "unknown")
        message = (details.get("message") or "").strip() or None

        results.append({
            "id":          raw.get("historyId") or raw.get("uuid"),
            "name":        raw.get("name", ""),
            "full_name":   raw.get("fullName", ""),
            "status":      status,
            "message":     message,
            "failure":     classify_failure(message) if status in FAIL_STATUSES else None,
            "failed_step": failed_step,
            "steps_total": len(steps),
            "started_at":  _iso(start),
            "duration_ms": (stop - start) if start and stop else None,
            "start_ms":    start,
            "suite":       _suite_key(labels.get("parentSuite", "")),
            # Web suites live under tests/web*; everything else is an Appium run.
            "platform":    "web" if _suite_key(labels.get("parentSuite", "")).startswith("web") else "mobile",
            "epic":        labels.get("epic"),
            "feature":     labels.get("feature"),
            "story":       labels.get("story"),
            "severity":    labels.get("severity", "normal"),
            "host":        labels.get("host"),
            "tags":        tags,
            "test_type":   declared_type,            # filled in from the inventory below
            "test_type_label": tt.label_for(declared_type),
        })

    results.sort(key=lambda r: r["start_ms"] or 0, reverse=True)
    return results


def load_latest_results() -> list[dict]:
    """Results of the most recently published run (allure-results/)."""
    return load_results_from(ALLURE_RESULTS_DIR)


def attach_test_types(results: list[dict]) -> list[dict]:
    """Give every result a test type: the one it declared, else the one its test
    case carries in the inventory, else the configured default."""
    if any(not r.get("test_type") for r in results):
        # Local import: test_management imports this module, so this would be a cycle at import time.
        from new_backend.modules.test_management.service import discover_test_cases

        by_full_name = {c["full_name"]: c["test_type"] for c in discover_test_cases()}
        for result in results:
            if not result.get("test_type"):
                result["test_type"] = by_full_name.get(result["full_name"]) or tt.default_test_type()
    for result in results:
        result["test_type_label"] = tt.label_for(result["test_type"])
    return results


def load_history_trend() -> list[dict]:
    """Per-run statistics, oldest → newest (Allure stores newest first)."""
    trend = _read_json(ALLURE_REPORT_DIR / "history" / "history-trend.json", [])
    runs = []
    for idx, entry in enumerate(reversed(trend if isinstance(trend, list) else [])):
        data = entry.get("data") or {}
        total = data.get("total", 0)
        runs.append({
            "run":       entry.get("buildOrder") or idx + 1,
            "label":     entry.get("reportName") or f"Run {idx + 1}",
            "passed":    data.get("passed", 0),
            "failed":    data.get("failed", 0),
            "broken":    data.get("broken", 0),
            "skipped":   data.get("skipped", 0),
            "total":     total,
            "pass_rate": _pass_rate(data.get("passed", 0), total),
        })
    return runs


def _test_names() -> dict[str, str]:
    """historyId → test name, from the latest results and the generated report."""
    names = {}
    for path in (ALLURE_REPORT_DIR / "data" / "test-cases").glob("*.json"):
        raw = _read_json(path, {})
        if raw.get("historyId"):
            names[raw["historyId"]] = raw.get("name", "")
    for r in load_latest_results():
        if r["id"]:
            names[r["id"]] = r["name"]
    return names


def load_test_history() -> list[dict]:
    """Per-test status history across report generations, newest status first."""
    history = _read_json(ALLURE_REPORT_DIR / "history" / "history.json", {})
    names = _test_names()
    tests = []
    for history_id, entry in (history.items() if isinstance(history, dict) else []):
        items = entry.get("items") or []
        statuses = [i.get("status", "unknown") for i in items]
        if not statuses:
            continue
        flips = sum(1 for a, b in zip(statuses, statuses[1:]) if a != b)
        failures = sum(1 for s in statuses if s in FAIL_STATUSES)
        tests.append({
            "id":          history_id,
            "name":        names.get(history_id, history_id[:12]),
            "statuses":    statuses,
            "runs":        len(statuses),
            "failures":    failures,
            "fail_rate":   round(failures * 100 / len(statuses), 1),
            "flip_rate":   round(flips * 100 / (len(statuses) - 1), 1) if len(statuses) > 1 else 0.0,
            "flaky":       "passed" in statuses and failures > 0,
            "last_status": statuses[0],
            "last_message": (items[0].get("statusDetails") or None),
        })
    return tests


# ── Aggregations ─────────────────────────────────────────────────────────────

def _statistic(results: list[dict]) -> dict:
    stat = {"passed": 0, "failed": 0, "broken": 0, "skipped": 0, "unknown": 0}
    for r in results:
        stat[r["status"] if r["status"] in stat else "unknown"] += 1
    stat["total"] = len(results)
    return stat


def _group_test_types(results: list[dict]) -> list[dict]:
    """Outcome per test type, labelled from the configurable catalogue."""
    rows = []
    for row in _group(results, "test_type"):
        rows.append({**row, "id": row["name"], "name": tt.label_for(row["name"]), "short": tt.short_label(row["name"])})
    return sorted(rows, key=lambda r: -r["total"])


def _group(results: list[dict], key: str) -> list[dict]:
    groups = defaultdict(list)
    for r in results:
        groups[r.get(key) or "Unspecified"].append(r)
    rows = []
    for name, items in groups.items():
        stat = _statistic(items)
        rows.append({
            "name":        name,
            **stat,
            "pass_rate":   _pass_rate(stat["passed"], stat["total"]),
            "duration_ms": sum(i["duration_ms"] or 0 for i in items),
        })
    return sorted(rows, key=lambda g: g["name"])


def build_summary() -> dict:
    results = attach_test_types(load_latest_results())

    if results:
        stat = _statistic(results)
        starts = [r["start_ms"] for r in results if r["start_ms"]]
        stops = [r["start_ms"] + (r["duration_ms"] or 0) for r in results if r["start_ms"]]
        started, finished = (min(starts), max(stops)) if starts else (None, None)
    else:
        # No raw results (e.g. cleaned) — fall back to the generated report widget.
        widget = _read_json(ALLURE_REPORT_DIR / "widgets" / "summary.json", {})
        stat = {k: widget.get("statistic", {}).get(k, 0)
                for k in ("passed", "failed", "broken", "skipped", "unknown", "total")}
        started = widget.get("time", {}).get("start")
        finished = widget.get("time", {}).get("stop")

    for r in results:
        r.pop("start_ms", None)

    return {
        "has_data":    stat["total"] > 0,
        "statistic":   stat,
        "pass_rate":   _pass_rate(stat["passed"], stat["total"]),
        "started_at":  _iso(started),
        "finished_at": _iso(finished),
        "duration_ms": (finished - started) if started and finished else None,
        "results":     results,
        "by_suite":    _group(results, "suite"),
        "by_feature":  _group(results, "feature"),
        "by_severity": _group(results, "severity"),
        "by_test_type": _group_test_types(results),
        "report_available": (ALLURE_REPORT_DIR / "index.html").exists(),
    }


def build_intelligence(coverage_pct: float | None = None) -> dict:
    """
    Trend, flakiness, failure categories, risk, quality score and release gates.

    `coverage_pct` comes from test_management (planned modules that have a test
    file); it is passed in rather than imported to keep the modules decoupled.
    """
    summary = build_summary()
    trend = load_history_trend()
    history = load_test_history()
    results = summary["results"]
    failed = [r for r in results if r["status"] in FAIL_STATUSES]

    # Failure categories (latest run)
    categories = defaultdict(lambda: {"count": 0, "tests": []})
    for r in failed:
        cat = r["failure"]
        categories[cat["key"]]["label"] = cat["label"]
        categories[cat["key"]]["count"] += 1
        categories[cat["key"]]["tests"].append(r["name"])
    failure_categories = sorted(
        ({"key": k, **v} for k, v in categories.items()), key=lambda c: -c["count"]
    )

    flaky = sorted((t for t in history if t["flaky"]), key=lambda t: -t["flip_rate"])

    # Risk: heuristic blend of failure rate, instability and the latest outcome.
    latest_by_id = {r["id"]: r for r in results}
    risk = []
    for t in history:
        last_failed = t["last_status"] in FAIL_STATUSES
        score = round(0.5 * t["fail_rate"] + 0.3 * t["flip_rate"] + (20 if last_failed else 0))
        latest = latest_by_id.get(t["id"], {})
        risk.append({
            "id":        t["id"],
            "name":      t["name"],
            "suite":     latest.get("suite"),
            "feature":   latest.get("feature"),
            "score":     min(score, 100),
            "level":     "high" if score >= 60 else "medium" if score >= 30 else "low",
            "fail_rate": t["fail_rate"],
            "flip_rate": t["flip_rate"],
            "last_status": t["last_status"],
        })
    risk.sort(key=lambda r: -r["score"])

    # Quality score components (0–100 each); missing inputs are skipped, not zeroed.
    total_tests = len(history) or summary["statistic"]["total"]
    recent = [r["pass_rate"] for r in trend[-5:] if r["pass_rate"] is not None]
    components = [
        ("Latest pass rate",   0.5, summary["pass_rate"]),
        ("Stability",          0.2, (100 - len(flaky) * 100 / total_tests) if total_tests else None),
        ("Trend (last 5 runs)", 0.2, sum(recent) / len(recent) if recent else None),
        ("Module coverage",    0.1, coverage_pct),
    ]
    present = [(n, w, v) for n, w, v in components if v is not None]
    weight = sum(w for _, w, _ in present)
    score = round(sum(w * v for _, w, v in present) / weight) if weight else None
    quality_score = {
        "score": score,
        "grade": None if score is None else "A" if score >= 90 else "B" if score >= 75 else "C" if score >= 60 else "D",
        "components": [{"name": n, "weight": w, "value": None if v is None else round(v, 1)} for n, w, v in components],
    }

    # Release readiness gates
    run_age_days = None
    if summary["finished_at"]:
        finished = datetime.fromisoformat(summary["finished_at"])
        run_age_days = round((datetime.now(timezone.utc) - finished).total_seconds() / 86400, 1)
    blocking = [r["name"] for r in failed if (r["severity"] or "").lower() in BLOCKING_SEVERITY]
    flaky_share = round(len(flaky) * 100 / total_tests, 1) if total_tests else None

    gates = [
        _gate("pass_rate", "Latest pass rate", f"≥ {MIN_PASS_RATE:g}%", summary["pass_rate"],
              summary["pass_rate"] is not None and summary["pass_rate"] >= MIN_PASS_RATE, blocking=True, unit="%"),
        _gate("blocking_failures", "Blocker / critical failures", "0", len(blocking),
              summary["has_data"] and not blocking, blocking=True),
        _gate("flaky_share", "Flaky tests", f"≤ {MAX_FLAKY_SHARE:g}%", flaky_share,
              flaky_share is not None and flaky_share <= MAX_FLAKY_SHARE, unit="%"),
        _gate("coverage", "Module coverage", f"≥ {MIN_COVERAGE:g}%", coverage_pct,
              coverage_pct is not None and coverage_pct >= MIN_COVERAGE, unit="%"),
        _gate("freshness", "Latest run age", f"≤ {MAX_RUN_AGE_DAYS} days", run_age_days,
              run_age_days is not None and run_age_days <= MAX_RUN_AGE_DAYS, unit=" days"),
    ]
    if not summary["has_data"]:
        verdict = "no_data"
    elif any(not g["passed"] and g["blocking"] for g in gates):
        verdict = "blocked"
    elif any(not g["passed"] for g in gates):
        verdict = "at_risk"
    else:
        verdict = "ready"

    return {
        "has_data":           summary["has_data"] or bool(trend),
        "statistic":          summary["statistic"],
        "pass_rate":          summary["pass_rate"],
        "trend":              trend,
        "flaky":              flaky,
        "tests_tracked":      len(history),
        "failure_categories": failure_categories,
        "failed_tests":       failed,
        "risk":               risk,
        "quality_score":      quality_score,
        "readiness":          {"verdict": verdict, "gates": gates, "blocking_failures": blocking},
    }


def _gate(gate_id, label, target, actual, passed, blocking=False, unit=""):
    return {
        "id": gate_id, "label": label, "target": target,
        "actual": None if actual is None else f"{actual:g}{unit}" if isinstance(actual, (int, float)) else actual,
        "passed": bool(passed), "blocking": blocking,
    }
