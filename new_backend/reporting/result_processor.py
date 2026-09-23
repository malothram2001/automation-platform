"""
Result Processor — one normalized result shape for every engine.

Results are read from the Allure results the run itself produced (each run writes
to var/runs/<run_id>/allure-results), so nothing is inferred and nothing is
invented: a test that did not run has no result.

After processing, the run's results are also published into the repository-level
allure-results/ so the existing Reports and Allure screens keep working while the
frontend migrates to per-run reports.
"""
from __future__ import annotations

import shutil
from pathlib import Path
from typing import Optional

from new_backend.core.logger import logger
from new_backend.modules.reporting.service import ALLURE_RESULTS_DIR, attach_test_types, load_results_from
from new_backend.modules.test_management import test_types as tt
from new_backend.orchestration.execution_context import ExecutionContext

FAIL_STATUSES = {"failed", "broken"}


def process(context: ExecutionContext, exit_code: Optional[int]) -> dict:
    """Normalize one run's outcome. Returns the result dict stored on the run."""
    results = []
    if context.results_dir:
        results = attach_test_types(load_results_from(Path(context.results_dir)))

    statistic = {"passed": 0, "failed": 0, "broken": 0, "skipped": 0, "unknown": 0}
    for result in results:
        key = result["status"] if result["status"] in statistic else "unknown"
        statistic[key] += 1

    total = len(results)
    failed = statistic["failed"] + statistic["broken"]
    request = context.request

    result = {
        "run_id": context.run_id,
        "test_type": request.test_type,
        "application": request.application,
        "role": request.role,
        "browser": request.browser,
        "device": (request.device.udid if request.device else None),
        "app_build": (request.app.apk if request.app else None),
        "modules": [m.as_dict() for m in context.modules],
        "test_types": tt.describe(request.test_types),
        "total": total,
        "passed": statistic["passed"],
        "failed": failed,
        "skipped": statistic["skipped"],
        "unknown": statistic["unknown"],
        "pass_rate": round(statistic["passed"] * 100 / total, 1) if total else None,
        "duration": context.duration_seconds,
        "exit_code": exit_code,
        "tests": [
            {
                "name": r["name"],
                "status": r["status"],
                "duration_ms": r["duration_ms"],
                "suite": r["suite"],
                "test_type": r.get("test_type"),
                "test_type_label": r.get("test_type_label"),
                "message": r["message"],
                "failure": r["failure"],
                "failed_step": r["failed_step"],
            }
            for r in results
        ],
        "role_validation": context.role_validation or None,
    }

    # pytest exit code 5 = "no tests ran"; say so instead of reporting a green run.
    if total == 0:
        result["note"] = (
            "No test result was produced. pytest exit code "
            f"{exit_code}" + (" (no tests matched the selection)" if exit_code == 5 else "")
        )
    return result


def publish_to_repository_results(context: ExecutionContext) -> bool:
    """Copy this run's Allure results into allure-results/ (what the Reports read)."""
    source = Path(context.results_dir or "")
    if not source.is_dir():
        return False
    try:
        ALLURE_RESULTS_DIR.mkdir(parents=True, exist_ok=True)
        for existing in ALLURE_RESULTS_DIR.glob("*"):
            if existing.is_file():
                existing.unlink()
            else:
                shutil.rmtree(existing, ignore_errors=True)
        for item in source.iterdir():
            target = ALLURE_RESULTS_DIR / item.name
            shutil.copy2(item, target) if item.is_file() else shutil.copytree(item, target)
        return True
    except OSError:
        logger.exception("Could not publish run results for %s", context.run_id)
        return False
