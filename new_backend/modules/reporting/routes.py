from fastapi import APIRouter
from new_backend.modules.test_management.service import build_matrix
from .service import build_summary, build_intelligence

router = APIRouter()

# Sync handlers: file reads run in FastAPI's threadpool.

@router.get("/summary")
def report_summary():
    return build_summary()

@router.get("/intelligence")
def report_intelligence():
    return build_intelligence(coverage_pct=build_matrix()["coverage_pct"])
