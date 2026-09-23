"""Web Testing data: applications, browsers this host can drive, modules."""
from fastapi import APIRouter, HTTPException, Query

from new_backend.engines.web import browser_manager
from new_backend.test_registry import registry

router = APIRouter()


@router.get("/web/applications")
def web_applications():
    applications = registry.web_applications()
    return {
        "applications": applications,
        "default": applications[0]["id"] if applications else None,
    }


@router.get("/web/browsers")
def web_browsers():
    """Real availability — Playwright's bundled engines and the installed Chrome/Edge."""
    return browser_manager.list_available()


@router.get("/web/modules")
def web_modules(application: str = Query(..., description="Web application id")):
    try:
        modules = registry.web_modules(application)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "application": application,
        "modules": modules,
        "tests": sum(m["test_count"] for m in modules),
    }
