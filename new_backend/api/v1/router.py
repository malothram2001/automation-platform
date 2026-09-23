"""/api/v1 — the versioned API the frontend migrates onto.

The legacy routes (/test/*, /test-management/*, /platform/*, /reports/*) stay
mounted until every screen has moved, so nothing breaks mid-migration.
"""
from fastapi import APIRouter

from . import executions, mobile, reports, web

api_router = APIRouter()
api_router.include_router(executions.router, tags=["executions"])
api_router.include_router(web.router, tags=["web"])
api_router.include_router(mobile.router, tags=["mobile"])
api_router.include_router(reports.router, tags=["reports"])
