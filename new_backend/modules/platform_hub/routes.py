from fastapi import APIRouter
from .service import build_sidebar, build_context, build_dashboard, list_integrations, list_devices, list_browsers

router = APIRouter()

# Sync handlers: they shell out (adb) and read files, so FastAPI runs them in
# its threadpool instead of blocking the event loop.

@router.get("/sidebar")
def sidebar_badges():
    return build_sidebar()

@router.get("/context")
def workspace_context():
    return build_context()

@router.get("/dashboard")
def dashboard():
    return build_dashboard()

@router.get("/integrations")
def integrations():
    return {"integrations": list_integrations()}

@router.get("/devices")
def devices():
    return list_devices()

@router.get("/browsers")
def browsers():
    return list_browsers()
