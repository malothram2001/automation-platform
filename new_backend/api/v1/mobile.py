"""Mobile Testing data: the unified application, its roles, devices, APKs, modules."""
from fastapi import APIRouter, HTTPException, Query

from new_backend.engines.mobile import apk_manager, appium_manager, device_manager
from new_backend.test_registry import registry

router = APIRouter()


@router.get("/mobile/applications")
def mobile_applications():
    """One unified application; the four historical apps are its roles."""
    application = registry.mobile_application()
    return {"applications": [application], "default": application["id"]}


@router.get("/mobile/roles")
def mobile_roles():
    return {"roles": registry.mobile_application()["roles"]}


@router.get("/mobile/devices")
def mobile_devices(details: bool = True):
    return device_manager.discover(details=details)


@router.get("/mobile/apks")
def mobile_apks():
    return {"apks": apk_manager.list_apks()}


@router.get("/mobile/modules")
def mobile_modules(role: str = Query(..., description="Role id, e.g. regular_farmer")):
    try:
        modules = registry.mobile_modules(role)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "application": registry.MOBILE_APPLICATION_ID,
        "role": role,
        "modules": modules,
        "tests": sum(m["test_count"] for m in modules),
    }


@router.get("/mobile/appium")
def appium_status():
    return appium_manager.status()


@router.post("/mobile/appium/start")
def appium_start():
    try:
        return appium_manager.start()
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/mobile/appium/stop")
def appium_stop():
    return appium_manager.stop()
