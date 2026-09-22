"""
Storage for manually authored test cases.

Automated cases are discovered from the pytest sources and are read-only;
manual cases are authored in the UI and kept in a JSON file next to the
backend, so no database is required to use Test Management.
"""
import csv
import io
import json
import re
import threading
from datetime import datetime, timezone
from pathlib import Path

from .models import ImportRequest, TestCaseInput

STORE_PATH = Path(__file__).resolve().parents[2] / "data" / "test_cases.json"
_LOCK = threading.Lock()

# Column name → field, accepting the spellings people use in exported sheets.
CSV_FIELDS = {
    "id": "id", "test case id": "id", "case id": "id",
    "title": "title", "test case title": "title", "summary": "title", "name": "title",
    "module": "module", "component": "module", "feature": "module",
    "test type": "test_type", "type": "test_type",
    "priority": "priority", "severity": "priority",
    "automation": "automation_status", "automation status": "automation_status",
    "status": "status",
    "variant": "variant", "app variant": "variant",
    "tags": "tags", "labels": "tags",
    "description": "description",
    "preconditions": "preconditions", "pre-conditions": "preconditions",
    "expected result": "expected_result", "expected": "expected_result",
    "test data": "test_data",
    "steps": "steps",
    "author": "author", "owner": "author",
}

ALIASES = {
    "priority": {"blocker": "High", "critical": "High", "high": "High", "major": "High",
                 "medium": "Medium", "normal": "Medium", "minor": "Low", "low": "Low", "trivial": "Low"},
    "automation_status": {"automated": "Automated", "yes": "Automated", "true": "Automated",
                          "manual": "Manual", "no": "Manual", "false": "Manual",
                          "not automated": "Not Automated", "pending": "Not Automated"},
    "status": {"active": "Active", "draft": "Draft", "deprecated": "Deprecated", "obsolete": "Deprecated"},
    "test_type": {"functional": "Functional", "negative": "Negative", "regression": "Regression",
                  "smoke": "Smoke", "integration": "Integration", "usability": "Usability"},
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _read() -> list[dict]:
    try:
        with open(STORE_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, list) else []
    except (OSError, ValueError):
        return []


def _write(cases: list[dict]) -> None:
    STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = STORE_PATH.with_suffix(".json.tmp")
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(cases, fh, indent=2, ensure_ascii=False)
    tmp.replace(STORE_PATH)   # atomic swap so a crash can't truncate the store


def _next_id(cases: list[dict]) -> str:
    highest = 0
    for case in cases:
        match = re.fullmatch(r"TC-(\d+)", str(case.get("id", "")))
        if match:
            highest = max(highest, int(match.group(1)))
    return f"TC-{highest + 1:03d}"


def _normalise(field: str, value: str) -> str:
    return ALIASES.get(field, {}).get(str(value).strip().lower(), value)


def list_manual_cases() -> list[dict]:
    return _read()


def create_case(payload: TestCaseInput, case_id: str | None = None) -> dict:
    with _LOCK:
        cases = _read()
        record = {
            "id": case_id or _next_id(cases),
            **payload.model_dump(),
            "source": "manual",
            "created_at": _now(),
            "updated_at": _now(),
        }
        cases.append(record)
        _write(cases)
    return record


def update_case(case_id: str, payload: TestCaseInput) -> dict | None:
    with _LOCK:
        cases = _read()
        for index, case in enumerate(cases):
            if case.get("id") == case_id:
                cases[index] = {
                    **case,
                    **payload.model_dump(),
                    "id": case_id,
                    "source": "manual",
                    "updated_at": _now(),
                }
                _write(cases)
                return cases[index]
    return None


def delete_case(case_id: str) -> bool:
    with _LOCK:
        cases = _read()
        remaining = [c for c in cases if c.get("id") != case_id]
        if len(remaining) == len(cases):
            return False
        _write(remaining)
    return True


# ── Import ───────────────────────────────────────────────────────────────────

def _row_to_case(row: dict) -> tuple[str | None, TestCaseInput | None, str | None]:
    """(id, case, error) for one imported row."""
    mapped: dict = {}
    for key, raw in row.items():
        field = CSV_FIELDS.get(str(key or "").strip().lower())
        if not field or raw in (None, ""):
            continue
        value = raw if isinstance(raw, (list, dict)) else str(raw).strip()
        if field == "tags":
            mapped[field] = value if isinstance(value, list) else [t.strip() for t in re.split(r"[,;|]", value) if t.strip()]
        elif field == "steps":
            if isinstance(value, list):
                mapped[field] = [s if isinstance(s, dict) else {"action": str(s)} for s in value]
            else:
                mapped[field] = [{"action": s.strip()} for s in re.split(r"\s*(?:\d+[.)]|\n|;)\s*", value) if s.strip()]
        elif field in ALIASES:
            mapped[field] = _normalise(field, value)
        else:
            mapped[field] = value

    case_id = mapped.pop("id", None)
    if not mapped.get("title"):
        return None, None, "missing a title"
    try:
        return case_id, TestCaseInput(**mapped), None
    except Exception as exc:                       # pydantic validation message
        return case_id, None, str(exc).split("\n")[0]


def import_cases(request: ImportRequest) -> dict:
    if request.format == "json":
        try:
            parsed = json.loads(request.content)
        except ValueError as exc:
            return {"imported": 0, "failed": 0, "errors": [f"Invalid JSON: {exc}"]}
        rows = parsed.get("cases", []) if isinstance(parsed, dict) else parsed
        if not isinstance(rows, list):
            return {"imported": 0, "failed": 0, "errors": ["Expected a JSON array of test cases"]}
    else:
        rows = list(csv.DictReader(io.StringIO(request.content)))

    if request.replace:
        with _LOCK:
            _write([])

    imported, errors = [], []
    for number, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            errors.append(f"Row {number}: not an object")
            continue
        case_id, case, error = _row_to_case(row)
        if error:
            errors.append(f"Row {number}: {error}")
            continue
        existing = {c["id"] for c in _read()}
        imported.append(create_case(case, case_id if case_id and case_id not in existing else None))

    return {"imported": len(imported), "failed": len(errors), "errors": errors[:20], "cases": imported}


CSV_TEMPLATE = (
    "ID,Title,Module,Test Type,Priority,Automation,Status,Variant,Tags,Description,Preconditions,Steps,Expected Result\n"
    "TC-101,Verify user can login with valid credentials,Authentication,Functional,High,Automated,Active,"
    "regular_farmer,\"login,smoke\",Log in with a valid mobile number and password,App installed and on the login screen,"
    "\"1. Open the app; 2. Enter mobile number; 3. Enter password; 4. Tap Login\",User lands on the dashboard\n"
)
