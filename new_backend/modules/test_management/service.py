"""
Test management: the test inventory, suites, execution matrix, runs and queue.

The inventory is discovered from the pytest sources under tests/ by parsing
them with `ast` (nothing is imported or executed), so it always reflects the
code on disk. Latest outcomes are joined in from Allure via the test's
`fullName`, which allure-pytest writes as `package.module.Class#function`.
"""
import ast
import json
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from new_backend.core import state as core_state
from new_backend.modules.reporting.service import load_latest_results
from new_backend.modules.slack.config import APP_VARIANTS

from . import test_types as tt
from .store import list_manual_cases

PROJECT_ROOT = Path(__file__).resolve().parents[3]
TESTS_DIR    = PROJECT_ROOT / "tests"
FLOWS_DIR    = PROJECT_ROOT / "test-flows"

# Support code that lives beside the tests but never contains test cases.
NON_TEST_DIRS = {"utils", "pages", "locators", "data", "test_data", "__pycache__"}

SUITE_LABELS = {
    "regular_farmer": "Krishivaas Farmer (Regular)",
    "regular_client": "Krishivaas Client (Regular)",
    "state_farmer":   "State Farmer App",
    "state_client":   "State Client App",
    "web":            "Web (Regular)",
    "web_automation": "Web Automation",
}

ALLURE_META = {"title", "epic", "feature", "story", "severity"}


# ── Discovery ────────────────────────────────────────────────────────────────

def _classify(rel: Path) -> tuple[str, str]:
    """(suite, platform) for a test file path relative to the project root."""
    parts = rel.parts
    if "test_cases" in parts:
        folder = parts[parts.index("test_cases") + 1]
        return folder.removesuffix("_test_cases"), "mobile"
    if len(parts) > 1 and parts[1].startswith("web"):
        return parts[1], "web"
    return (parts[1] if len(parts) > 2 else "general"), "mobile"


def _decorator_meta(decorators: list[ast.expr]) -> tuple[dict, list[str]]:
    """Pull allure metadata (incl. tags/labels) and pytest markers out of a decorator list."""
    meta, markers = {"tags": [], "labels": {}}, []
    for dec in decorators:
        call = dec if isinstance(dec, ast.Call) else None
        target = call.func if call else dec
        if not isinstance(target, ast.Attribute):
            continue
        chain = ast.unparse(target)                 # e.g. "allure.title", "pytest.mark.skip"
        if chain.startswith("allure.") and target.attr in ALLURE_META and call and call.args:
            arg = call.args[0]
            if isinstance(arg, ast.Constant):
                meta[target.attr] = str(arg.value)
            elif isinstance(arg, ast.Attribute):    # allure.severity_level.CRITICAL
                meta[target.attr] = arg.attr.lower()
        elif chain == "allure.tag" and call:        # @allure.tag("smoke", "regression")
            meta["tags"] += [str(a.value) for a in call.args if isinstance(a, ast.Constant)]
        elif chain == "allure.label" and call and len(call.args) >= 2:
            name, value = call.args[0], call.args[1]
            if isinstance(name, ast.Constant) and isinstance(value, ast.Constant):
                meta["labels"][str(name.value)] = str(value.value)
        elif chain.startswith("pytest.mark."):
            markers.append(target.attr)
    return meta, markers


def _humanize(func_name: str) -> str:
    words = func_name.removeprefix("test_").replace("_", " ").strip()
    return words[:1].upper() + words[1:]


def discover_test_cases() -> list[dict]:
    latest = {r["full_name"]: r for r in load_latest_results() if r["full_name"]}
    cases = []

    for path in sorted(TESTS_DIR.rglob("*.py")):
        rel = path.relative_to(PROJECT_ROOT)
        if path.name == "conftest.py" or NON_TEST_DIRS.intersection(rel.parts):
            continue
        try:
            tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"))
        except SyntaxError:
            continue

        suite, platform = _classify(rel)
        module = ".".join(rel.with_suffix("").parts)

        def add(func, cls=None, cls_meta=None, cls_markers=()):
            meta, markers = _decorator_meta(func.decorator_list)
            cls_meta = cls_meta or {}
            merged = {**cls_meta, **meta}
            merged["tags"] = [*cls_meta.get("tags", []), *meta.get("tags", [])]
            merged["labels"] = {**cls_meta.get("labels", {}), **meta.get("labels", {})}
            meta = merged
            markers = [*cls_markers, *markers]
            declared_type = tt.from_metadata(markers, meta.get("tags", []), meta.get("labels"))
            full_name = f"{module}.{cls.name}#{func.name}" if cls else f"{module}#{func.name}"
            node_id = f"{rel.as_posix()}::{cls.name}::{func.name}" if cls else f"{rel.as_posix()}::{func.name}"
            result = latest.get(full_name)
            cases.append({
                "id":          node_id,
                "full_name":   full_name,           # allure's fullName — joins a case to its results
                "name":        meta.get("title") or _humanize(func.name),
                "function":    func.name,
                "class_name":  cls.name if cls else None,
                "file":        rel.as_posix(),
                "line":        func.lineno,
                "suite":       suite,
                "suite_label": SUITE_LABELS.get(suite, suite.replace("_", " ").title()),
                "platform":    platform,
                "epic":        meta.get("epic"),
                "feature":     meta.get("feature"),
                "story":       meta.get("story"),
                "severity":    meta.get("severity", "normal"),
                "markers":     markers,
                "tags":        meta.get("tags", []),
                "test_type":   declared_type or tt.default_test_type(),
                "test_type_label": tt.label_for(declared_type or tt.default_test_type()),
                "test_type_declared": bool(declared_type),
                "skipped":     any(m in ("skip", "skipif") for m in markers),
                "last_status":      result["status"] if result else None,
                "last_duration_ms": result["duration_ms"] if result else None,
                "last_message":     result["message"] if result else None,
            })

        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name.startswith("test"):
                add(node)
            elif isinstance(node, ast.ClassDef) and node.name.startswith("Test"):
                cls_meta, cls_markers = _decorator_meta(node.decorator_list)
                cls_meta.pop("title", None)
                for item in node.body:
                    if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)) and item.name.startswith("test"):
                        add(item, node, cls_meta, cls_markers)
    return cases


# ── Unified case list (automated + manually authored) ───────────────────────

SEVERITY_PRIORITY = {"blocker": "High", "critical": "High", "normal": "Medium", "minor": "Low", "trivial": "Low"}


def _automated_view(case: dict) -> dict:
    """A discovered pytest case in the shared Test Cases shape."""
    return {
        **case,
        "code":              case["function"],
        "title":             case["name"],
        "module":            case["feature"] or case["epic"] or case["suite_label"],
        "test_type":         case["test_type"],
        "test_type_label":   case["test_type_label"],
        "priority":          SEVERITY_PRIORITY.get(case["severity"], "Medium"),
        "automation_status": "Automated",
        "status":            "Deprecated" if case["skipped"] else "Active",
        "source":            "automated",
        "tags":              case["markers"],
        "variant":           case["suite"],
        "description":       case["story"] or "",
        "preconditions":     "",
        "expected_result":   "",
        "test_data":         "",
        "steps":             [],
        "author":            "",
        "updated_at":        None,
    }


def _manual_type(case: dict) -> str:
    """Stored type of a manual case; values written before test types were canonical
    (e.g. "Negative", "Usability") keep working as custom ids."""
    return tt.normalise(case.get("test_type")) or tt.default_test_type()


def _manual_view(case: dict) -> dict:
    """A stored manual case in the shared Test Cases shape."""
    variant = case.get("variant") or None
    return {
        "id":                case["id"],
        "code":              case["id"],
        "title":             case.get("title", ""),
        "name":              case.get("title", ""),
        "function":          None,
        "class_name":        None,
        "file":              None,
        "line":              None,
        "module":            case.get("module") or "General",
        "test_type":         _manual_type(case),
        "test_type_label":   tt.label_for(_manual_type(case)),
        "priority":          case.get("priority", "Medium"),
        "automation_status": case.get("automation_status", "Manual"),
        "status":            case.get("status", "Active"),
        "source":            "manual",
        "tags":              case.get("tags", []),
        "variant":           variant,
        "suite":             variant or "manual",
        "suite_label":       SUITE_LABELS.get(variant, "Unassigned") if variant else "Unassigned",
        "platform":          "mobile" if variant in APP_VARIANTS else None,
        "feature":           case.get("module"),
        "epic":              None,
        "story":             None,
        "severity":          case.get("priority", "Medium").lower(),
        "markers":           [],
        "tags":              [],
        "test_type_declared": bool(case.get("test_type")),
        "skipped":           case.get("status") == "Deprecated",
        "description":       case.get("description", ""),
        "preconditions":     case.get("preconditions", ""),
        "expected_result":   case.get("expected_result", ""),
        "test_data":         case.get("test_data", ""),
        "steps":             case.get("steps", []),
        "author":            case.get("author", ""),
        "created_at":        case.get("created_at"),
        "updated_at":        case.get("updated_at"),
        "last_status":       None,
        "last_duration_ms":  None,
        "last_message":      None,
    }


def list_all_cases() -> list[dict]:
    """Discovered pytest cases plus manually authored ones, in one shape."""
    return [_automated_view(c) for c in discover_test_cases()] + [_manual_view(c) for c in list_manual_cases()]


def _outcomes(cases: list[dict]) -> dict:
    counts = {"passed": 0, "failed": 0, "not_run": 0}
    for c in cases:
        if c["last_status"] == "passed":
            counts["passed"] += 1
        elif c["last_status"] in ("failed", "broken"):
            counts["failed"] += 1
        else:
            counts["not_run"] += 1
    return counts


def type_counts(cases: list[dict]) -> dict[str, int]:
    """{test type id: number of cases} — what the type filters and chips count."""
    counts: dict[str, int] = {}
    for case in cases:
        key = case.get("test_type") or tt.default_test_type()
        counts[key] = counts.get(key, 0) + 1
    return counts


def list_suites() -> list[dict]:
    grouped = defaultdict(list)
    for case in discover_test_cases():
        grouped[case["suite"]].append(case)

    suites = []
    for suite_id, cases in grouped.items():
        suites.append({
            "id":       suite_id,
            "label":    cases[0]["suite_label"],
            "platform": cases[0]["platform"],
            "total":    len(cases),
            "files":    sorted({c["file"] for c in cases}),
            "features": sorted({c["feature"] for c in cases if c["feature"]}),
            "type_counts": type_counts(cases),
            **_outcomes(cases),
            "planned_modules": [m["name"] for m in APP_VARIANTS.get(suite_id, [])],
        })
    return sorted(suites, key=lambda s: (s["platform"], s["label"]))


# ── Execution matrix & coverage ──────────────────────────────────────────────

def _aggregate_status(cases: list[dict]) -> str:
    statuses = {c["last_status"] for c in cases}
    if statuses & {"failed", "broken"}:
        return "failed"
    if statuses == {"passed"}:
        return "passed"
    if "passed" in statuses:
        return "partial"
    return "not_run"


def build_matrix() -> dict:
    """App variants × planned modules (from slack/config.py APP_VARIANTS)."""
    by_file = defaultdict(list)
    for case in discover_test_cases():
        by_file[case["file"]].append(case)

    variants, planned, implemented = [], 0, 0
    for variant_id, modules in APP_VARIANTS.items():
        cells = []
        for module in modules:
            path = module["path"].replace("\\", "/")
            exists = (PROJECT_ROOT / path).is_file()
            cases = by_file.get(path, [])
            planned += 1
            implemented += exists
            cells.append({
                "module":     module["name"],
                "path":       path,
                "exists":     exists,
                "test_count": len(cases),
                "type_counts": type_counts(cases),
                "status":     _aggregate_status(cases) if exists else "missing",
            })
        variants.append({
            "id":      variant_id,
            "label":   SUITE_LABELS.get(variant_id, variant_id),
            "modules": cells,
            "coverage_pct": round(sum(c["exists"] for c in cells) * 100 / len(cells), 1) if cells else None,
        })

    return {
        "variants":        variants,
        "planned_modules": planned,
        "implemented":     implemented,
        "coverage_pct":    round(implemented * 100 / planned, 1) if planned else None,
    }


# ── Runnable modules (Web Testing / Mobile Testing module pickers) ───────────

def _module_label(path: str) -> str:
    """'tests/web_automation/tests/test_farmer_onboarding.py' → 'Farmer Onboarding'."""
    stem = Path(path).stem
    stem = re.sub(r"(^test[_-]?|[_-]?test$|[_-]?pytest$)", "", stem, flags=re.I)
    stem = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", stem)          # TestOnboarding → Onboarding
    words = [w for w in re.split(r"[_\-\s]+", stem) if w]
    return " ".join(w if w.isupper() else w.capitalize() for w in words) or Path(path).stem


def _module_description(cases: list[dict]) -> str:
    """The allure feature / epic / story the tests in a file declare, if any."""
    for key in ("feature", "epic", "story"):
        values = [c[key] for c in cases if c.get(key)]
        if values:
            return max(set(values), key=values.count)
    return ""


def _module_row(name: str, path: str, cases: list[dict], *, planned: bool) -> dict:
    file = PROJECT_ROOT / path
    exists = file.is_file()
    return {
        "id":           path,
        "name":         name,
        "description":  _module_description(cases),
        "path":         path,
        "exists":       exists,
        "planned":      planned,
        "test_count":   len(cases),
        "type_counts":  type_counts(cases),
        "last_updated": datetime.fromtimestamp(file.stat().st_mtime, tz=timezone.utc).isoformat() if exists else None,
        "status":       _aggregate_status(cases) if exists and cases else ("not_run" if exists else "missing"),
    }


def list_modules(platform: str = "mobile", variant: str | None = None) -> dict:
    """Modules that can be selected for a run, from the files on disk.

    Web: one module per discovered web test file.
    Mobile: the planned modules of one app variant (APP_VARIANTS), plus any
    discovered file of that suite that is not in the plan — so nothing that
    exists is hidden, and planned-but-missing files stay visible as missing.
    """
    by_file: dict[str, list[dict]] = defaultdict(list)
    for case in discover_test_cases():
        by_file[case["file"]].append(case)

    if platform == "web":
        modules = [
            _module_row(_module_label(path), path, cases, planned=False)
            for path, cases in sorted(by_file.items())
            if cases[0]["platform"] == "web"
        ]
        return {
            "platform": "web",
            "variant": None,
            "variants": [],
            "modules": modules,
            "total_tests": sum(m["test_count"] for m in modules),
        }

    variants = [
        {"id": vid, "label": SUITE_LABELS.get(vid, vid), "modules": len(mods)}
        for vid, mods in APP_VARIANTS.items()
    ]
    active = variant if variant in APP_VARIANTS else (variants[0]["id"] if variants else None)

    modules, seen = [], set()
    for module in APP_VARIANTS.get(active, []):
        path = module["path"].replace("\\", "/")
        seen.add(path)
        modules.append(_module_row(module["name"], path, by_file.get(path, []), planned=True))
    # Mobile files of this suite that exist on disk but are not in the plan.
    for path, cases in sorted(by_file.items()):
        if path not in seen and cases[0]["platform"] == "mobile" and cases[0]["suite"] == active:
            modules.append(_module_row(_module_label(path), path, cases, planned=False))

    return {
        "platform": "mobile",
        "variant": active,
        "variants": variants,
        "modules": modules,
        "total_tests": sum(m["test_count"] for m in modules),
    }


def resolve_run_selection(paths: list[str], type_ids: list[str] | None = None) -> dict:
    """Turn selected module paths + test types into the arguments pytest should run.

    With no type selected the whole file runs (pytest gets the path). With types
    selected only the matching test cases run, addressed by their node id — so the
    filter follows the type assigned to each case, never a hard-coded rule.
    """
    wanted = [t for t in (type_ids or []) if t]
    by_file: dict[str, list[dict]] = defaultdict(list)
    for case in discover_test_cases():
        by_file[case["file"]].append(case)

    targets, selected, skipped = [], [], []
    for path in paths:
        cases = by_file.get(path, [])
        if not wanted:
            targets.append(path)
            selected += cases
            continue
        matching = [c for c in cases if c["test_type"] in wanted]
        if not matching:
            skipped.append({"path": path, "reason": "no test case of the selected type(s)"})
            continue
        # A file whose every case matches runs as a file: clearer pytest output.
        targets += [path] if len(matching) == len(cases) else [c["id"] for c in matching]
        selected += matching

    return {
        "targets":     targets,
        "test_types":  wanted,
        "case_count":  len(selected),
        "cases":       [{"id": c["id"], "name": c["name"], "test_type": c["test_type"]} for c in selected],
        "type_counts": type_counts(selected),
        "skipped":     skipped,
    }


# ── Runs & queue ─────────────────────────────────────────────────────────────

def is_test_process_running() -> bool:
    # Read the runner's live pytest handle without importing it here.
    runner = sys.modules.get("tests.test_runner")
    proc = getattr(runner, "CURRENT_PROC", None)
    return proc is not None and proc.poll() is None


def list_runs() -> list[dict]:
    """Runs started through this backend process (held in memory in core.state)."""
    active = is_test_process_running()
    records = sorted(core_state.runs.items(), key=lambda kv: kv[1].get("started_at") or "", reverse=True)

    runs = []
    for idx, (run_id, rec) in enumerate(records):
        if rec.get("report_url"):
            status = "completed"
        elif idx == 0 and active:
            status = "running"
        elif idx == 0:
            status = "starting"
        else:
            status = "incomplete"
        runs.append({
            "run_id":      run_id,
            "status":      status,
            "started_at":  rec.get("started_at"),
            "app_name":    rec.get("app_name") or None,
            "app_version": rec.get("app_version") or None,
            "app_variant": rec.get("app_variant") or None,
            "variant_label": SUITE_LABELS.get(rec.get("app_variant") or "", None),
            "developer":   rec.get("developer_name") or None,
            "test_types":  tt.describe(rec.get("test_types") or []),
            "platform":    rec.get("platform") or None,
            "report_url":  rec.get("report_url"),
            "network_profile": (rec.get("network_config") or {}).get("profile") if isinstance(rec.get("network_config"), dict) else None,
        })
    return runs


def build_queue() -> dict:
    runs = list_runs()
    active = [r for r in runs if r["status"] in ("running", "starting")]
    return {
        "test_process_running": is_test_process_running(),
        "active":  active,
        "waiting": [],   # the runner executes one run at a time; there is no backlog yet
        "recent":  [r for r in runs if r["status"] not in ("running", "starting")][:10],
    }


# ── Recorded flows (test-flows/*.json) ───────────────────────────────────────

def _flow_file(flow_id: str) -> Path | None:
    path = (FLOWS_DIR / f"{flow_id}.json").resolve()
    if path.parent != FLOWS_DIR.resolve() or not path.is_file():
        return None
    return path


def _load_steps(path: Path) -> list | None:
    try:
        text = path.read_text(encoding="utf-8").strip()
        data = json.loads(text) if text else []
    except (OSError, ValueError):
        return None
    return data if isinstance(data, list) else None


def list_flows() -> list[dict]:
    flows = []
    for path in sorted(FLOWS_DIR.glob("*.json")):
        steps = _load_steps(path)
        ok = sum(1 for s in steps or [] if str(s.get("status", "")).lower() == "success")
        flows.append({
            "id":       path.stem,
            "name":     path.stem.replace("_", " ").title(),
            "file":     path.relative_to(PROJECT_ROOT).as_posix(),
            "valid":    steps is not None,
            "steps":    len(steps or []),
            "succeeded": ok,
            "failed":   len(steps or []) - ok,
            "modified_at": datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat(),
        })
    return flows


def get_flow(flow_id: str) -> dict | None:
    path = _flow_file(flow_id)
    if path is None:
        return None
    steps = _load_steps(path)
    return {"id": flow_id, "name": flow_id.replace("_", " ").title(), "valid": steps is not None, "steps": steps or []}
