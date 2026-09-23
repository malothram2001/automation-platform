"""Per-run reports: the normalized result of one execution and its artifacts."""
from pathlib import Path

from fastapi import APIRouter, HTTPException

from new_backend.orchestration.execution_manager import execution_manager

router = APIRouter()


@router.get("/reports/{run_id}")
def run_report(run_id: str):
    """Normalized result of one run (empty until it has finished)."""
    context = execution_manager.get(run_id)
    if context is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    return {
        "run_id": run_id,
        "status": context.state.value,
        "execution": context.summary(),
        "result": context.result,
    }


@router.get("/reports/{run_id}/artifacts")
def run_artifacts(run_id: str):
    """Files the run produced (Allure results, attachments)."""
    context = execution_manager.get(run_id)
    if context is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")

    results_dir = Path(context.results_dir) if context.results_dir else None
    files = []
    if results_dir and results_dir.is_dir():
        for item in sorted(results_dir.iterdir()):
            if item.is_file():
                files.append({
                    "name": item.name,
                    "kind": "allure-result" if item.name.endswith("-result.json")
                    else "attachment" if "attachment" in item.name else "file",
                    "size_bytes": item.stat().st_size,
                })
    return {
        "run_id": run_id,
        "results_dir": context.results_dir,
        "files": files,
        "artifacts": context.artifacts,
    }
