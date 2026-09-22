from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse

from .models import ImportRequest, TestCaseInput
from .service import (
    build_matrix, build_queue, get_flow, list_all_cases, list_flows, list_runs, list_suites,
)
from .store import CSV_TEMPLATE, create_case, delete_case, import_cases, update_case

router = APIRouter()

# Handlers are sync on purpose: they read files from disk, so FastAPI runs
# them in its threadpool instead of blocking the event loop.

@router.get("/cases")
def test_cases(
    suite: str | None = Query(None),
    platform: str | None = Query(None, pattern="^(mobile|web)$"),
    source: str | None = Query(None, pattern="^(automated|manual)$"),
):
    cases = list_all_cases()
    if suite:
        cases = [c for c in cases if c["suite"] == suite or c["variant"] == suite]
    if platform:
        cases = [c for c in cases if c["platform"] == platform]
    if source:
        cases = [c for c in cases if c["source"] == source]
    return {"total": len(cases), "cases": cases}


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
