from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse

from .models import ImportRequest, TestCaseInput
from . import test_types as tt
from .service import (
    build_matrix, build_queue, get_flow, list_all_cases, list_flows, list_modules, list_runs, list_suites,
    resolve_run_selection, type_counts,
)
from .store import CSV_TEMPLATE, create_case, delete_case, import_cases, update_case

router = APIRouter()

# Handlers are sync on purpose: they read files from disk, so FastAPI runs
# them in its threadpool instead of blocking the event loop.

@router.get("/test-types")
def test_type_catalogue():
    """The configurable test-type list every screen and filter reads."""
    types = tt.list_test_types()
    known = {t["id"] for t in types}
    # Types only present on existing cases (e.g. imported long ago) stay selectable.
    in_use = type_counts(list_all_cases())
    custom = [
        {"id": key, "label": tt.label_for(key), "short": tt.short_label(key), "color": "#64748b",
         "aliases": [], "description": "In use by existing test cases", "custom": True}
        for key in sorted(in_use) if key not in known
    ]
    return {
        "types": [{**t, "count": in_use.get(t["id"], 0)} for t in types]
                 + [{**t, "count": in_use.get(t["id"], 0)} for t in custom],
        "default": tt.default_test_type(),
    }


@router.get("/cases")
def test_cases(
    suite: str | None = Query(None),
    platform: str | None = Query(None, pattern="^(mobile|web)$"),
    source: str | None = Query(None, pattern="^(automated|manual)$"),
    test_type: str | None = Query(None, description="Comma-separated test type ids"),
):
    cases = list_all_cases()
    if suite:
        cases = [c for c in cases if c["suite"] == suite or c["variant"] == suite]
    if platform:
        cases = [c for c in cases if c["platform"] == platform]
    if source:
        cases = [c for c in cases if c["source"] == source]
    if test_type:
        wanted = {t.strip() for t in test_type.split(",") if t.strip()}
        cases = [c for c in cases if c["test_type"] in wanted]
    return {"total": len(cases), "cases": cases, "type_counts": type_counts(cases)}


@router.post("/cases", status_code=201)
def add_test_case(payload: TestCaseInput):
    return create_case(payload)


@router.get("/cases/template", response_class=PlainTextResponse)
def test_case_template():
    """CSV template for the Test Cases import dialog."""
    return CSV_TEMPLATE


@router.post("/cases/import")
def import_test_cases(payload: ImportRequest):
    result = import_cases(payload)
    if not result["imported"] and result["errors"]:
        raise HTTPException(status_code=422, detail={"message": "Nothing could be imported", **result})
    return result


@router.put("/cases/{case_id}")
def edit_test_case(case_id: str, payload: TestCaseInput):
    case = update_case(case_id, payload)
    if case is None:
        raise HTTPException(status_code=404, detail=f"Test case '{case_id}' not found, or it is an automated case")
    return case


@router.delete("/cases/{case_id}")
def remove_test_case(case_id: str):
    if not delete_case(case_id):
        raise HTTPException(status_code=404, detail=f"Test case '{case_id}' not found, or it is an automated case")
    return {"deleted": case_id}


@router.get("/suites")
def test_suites():
    return {"suites": list_suites()}

@router.get("/matrix")
def execution_matrix():
    return build_matrix()

@router.get("/modules")
def runnable_modules(
    platform: str = Query("mobile", pattern="^(mobile|web)$"),
    variant: str | None = Query(None),
):
    """Modules a run can select, discovered from the test files on disk."""
    return list_modules(platform, variant)

@router.post("/run-selection")
def run_selection(payload: dict):
    """Preview what a run would execute: module paths + test types → test cases."""
    paths = [p for p in (payload.get("paths") or []) if isinstance(p, str)]
    types = [t for t in (payload.get("test_types") or []) if isinstance(t, str)]
    return resolve_run_selection(paths, types)

@router.get("/runs")
def test_runs():
    return {"runs": list_runs()}

@router.get("/queue")
def test_queue():
    return build_queue()

@router.get("/flows")
def recorded_flows():
    return {"flows": list_flows()}

@router.get("/flows/{flow_id}")
def recorded_flow(flow_id: str):
    flow = get_flow(flow_id)
    if flow is None:
        raise HTTPException(status_code=404, detail=f"Flow '{flow_id}' not found")
    return flow
