"""
Test Registry — maps what the UI selects (application / role / module) to the
real pytest targets in this repository.

The frontend never sends file paths: it sends registry ids. Everything here is
derived from the test files actually on disk (test_management.service discovers
them by parsing the sources), so the registry cannot drift from the suites.

Mobile is ONE application — the unified Krishivaas app — with four roles. The
four historical "apps" are roles of that one application; each role's modules
come from APP_VARIANTS plus whatever test files exist for that role's suite.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

from new_backend.modules.slack.config import APP_VARIANTS
from new_backend.modules.test_management.service import (
    SUITE_LABELS,
    list_modules,
    resolve_run_selection,
)

# ── Applications ────────────────────────────────────────────────────────────

MOBILE_APPLICATION_ID = "krishivaas_unified"

ROLE_LABELS = {
    "regular_farmer": "Regular Farmer",
    "regular_client": "Regular Client",
    "state_farmer": "State Farmer",
    "state_client": "State Client",
}

# Web applications are folders of Playwright suites under tests/.
WEB_APPLICATIONS = {
    "krishivaas_web": {
        "name": "Krishivaas Web",
        "framework": "playwright",
        "root": "tests/web_automation",
    },
    "krishivaas_web_legacy": {
        "name": "Krishivaas Web (legacy suite)",
        "framework": "playwright",
        "root": "tests/web",
    },
}


@dataclass
class ResolvedModule:
    id: str
    name: str
    path: str
    node_ids: List[str]
    test_count: int


@dataclass
class Resolution:
    """What an execution will really run."""
    targets: List[str]
    modules: List[ResolvedModule]
    test_count: int
    skipped: List[dict]


# ── Mobile ──────────────────────────────────────────────────────────────────

def mobile_application() -> dict:
    """The single unified mobile application and its roles."""
    roles = []
    for role_id, label in ROLE_LABELS.items():
        modules = list_modules("mobile", role_id)["modules"]
        roles.append({
            "id": role_id,
            "label": label,
            "suite_label": SUITE_LABELS.get(role_id, label),
            "modules": len(modules),
            "runnable_modules": sum(1 for m in modules if m["exists"]),
            "tests": sum(m["test_count"] for m in modules),
        })
    return {
        "id": MOBILE_APPLICATION_ID,
        "name": "Krishivaas Unified App",
        "platform": "android",
        "roles": roles,
    }


def mobile_modules(role: str) -> List[dict]:
    """Modules of one role: planned modules (APP_VARIANTS) + discovered files."""
    if role not in ROLE_LABELS:
        raise ValueError(f"Unknown role '{role}'. Known roles: {', '.join(ROLE_LABELS)}")
    return list_modules("mobile", role)["modules"]


# ── Web ─────────────────────────────────────────────────────────────────────

def web_applications() -> List[dict]:
    """Web applications that actually have discovered tests."""
    modules = list_modules("web")["modules"]
    apps = []
    for app_id, spec in WEB_APPLICATIONS.items():
        owned = [m for m in modules if m["path"].startswith(spec["root"] + "/")]
        if not owned:
            continue
        apps.append({
            "id": app_id,
            "name": spec["name"],
            "framework": spec["framework"],
            "root": spec["root"],
            "modules": len(owned),
            "tests": sum(m["test_count"] for m in owned),
        })
    return apps


def web_modules(application: str) -> List[dict]:
    spec = WEB_APPLICATIONS.get(application)
    if spec is None:
        raise ValueError(f"Unknown web application '{application}'. "
                         f"Known: {', '.join(WEB_APPLICATIONS)}")
    return [m for m in list_modules("web")["modules"] if m["path"].startswith(spec["root"] + "/")]


# ── Resolution ──────────────────────────────────────────────────────────────

def available_modules(test_type: str, application: str, role: Optional[str] = None) -> List[dict]:
    if test_type == "mobile":
        return mobile_modules(role or next(iter(ROLE_LABELS)))
    if test_type == "web":
        return web_modules(application)
    raise ValueError(f"No registry for test type '{test_type}' yet")


def resolve(
    test_type: str,
    application: str,
    modules: List[str],
    *,
    role: Optional[str] = None,
    test_types: Optional[List[str]] = None,
) -> Resolution:
    """Turn selected module ids into the pytest targets to execute.

    A module id is its path (that is what GET /test-management/modules returns);
    a module name is accepted too, so a caller can send "login".
    """
    catalogue = available_modules(test_type, application, role)
    by_id: Dict[str, dict] = {m["id"]: m for m in catalogue}
    by_name: Dict[str, dict] = {m["name"].lower(): m for m in catalogue}

    chosen: List[dict] = []
    skipped: List[dict] = []
    wanted = modules or [m["id"] for m in catalogue if m["exists"]]

    for selection in wanted:
        module = by_id.get(selection) or by_name.get(str(selection).lower())
        if module is None:
            skipped.append({"module": selection, "reason": "not in the registry"})
        elif not module["exists"]:
            skipped.append({"module": module["name"], "reason": "no test file on disk yet"})
        else:
            chosen.append(module)

    if not chosen:
        return Resolution(targets=[], modules=[], test_count=0, skipped=skipped)

    # Narrow to the selected test types (functional, smoke, …) — per test case.
    selection = resolve_run_selection([m["path"] for m in chosen], test_types or [])
    by_path: Dict[str, List[str]] = {}
    for case in selection["cases"]:
        by_path.setdefault(case["id"].split("::")[0], []).append(case["id"])

    resolved: List[ResolvedModule] = []
    for module in chosen:
        node_ids = by_path.get(module["path"], [])
        if test_types and not node_ids:
            skipped.append({"module": module["name"], "reason": "no test case of the selected test type(s)"})
            continue
        resolved.append(ResolvedModule(
            id=module["id"],
            name=module["name"],
            path=module["path"],
            node_ids=node_ids,
            test_count=len(node_ids) if node_ids else module["test_count"],
        ))

    skipped += selection["skipped"]
    return Resolution(
        targets=list(selection["targets"]),
        modules=resolved,
        test_count=selection["case_count"],
        skipped=skipped,
    )
