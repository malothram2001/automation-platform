"""
Execution API — one entry point for every test type.

POST returns as soon as the run is created; the run itself happens in the
background and is followed over /ws/executions/{run_id}.
"""
from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect

from new_backend.engines.base import EngineError
from new_backend.orchestration.execution_context import ExecutionRequest
from new_backend.orchestration.execution_manager import execution_manager
from new_backend.orchestration.execution_state import ExecutionState
from new_backend.orchestration.orchestrator import orchestrator

router = APIRouter()
# Mounted at the app root so the socket stays at /ws/executions/{run_id}.
ws_router = APIRouter()


@router.post("/executions", status_code=202)
def create_execution(request: ExecutionRequest):
    """Start a run. Returns {run_id, status} immediately."""
    try:
        context = orchestrator.engine_for(request.test_type)      # fail fast on unknown type
    except EngineError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    del context

    execution = orchestrator.submit(request)
    return {
        "run_id": execution.run_id,
        "status": execution.state.value,
        "test_type": request.test_type,
        "websocket": f"/ws/executions/{execution.run_id}",
    }


@router.get("/executions")
def list_executions(limit: int = Query(50, ge=1, le=200), active: bool = False):
    runs = execution_manager.active() if active else execution_manager.list(limit)
    return {"runs": [run.summary() for run in runs], "active": len(execution_manager.active())}


@router.get("/executions/{run_id}")
def get_execution(run_id: str):
    context = execution_manager.get(run_id)
    if context is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    return context.summary()


@router.get("/executions/{run_id}/events")
def execution_events(run_id: str, since: int = 0):
    """Event history, for a client that connects after the run started."""
    context = execution_manager.get(run_id)
    if context is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    return {"run_id": run_id, "events": context.events[since:], "total": len(context.events)}


@router.get("/executions/{run_id}/logs")
def execution_logs(run_id: str, tail: int = Query(500, ge=1, le=2000)):
    context = execution_manager.get(run_id)
    if context is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    return {"run_id": run_id, "logs": context.logs[-tail:]}


@router.post("/executions/{run_id}/stop")
def stop_execution(run_id: str):
    if execution_manager.get(run_id) is None:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    stopped = orchestrator.stop(run_id)
    if not stopped:
        raise HTTPException(status_code=409, detail=f"Run {run_id} has already finished")
    return {"run_id": run_id, "status": ExecutionState.CANCELLED.value}


@router.post("/executions/{run_id}/cancel")
def cancel_execution(run_id: str):
    return stop_execution(run_id)


@router.post("/executions/{run_id}/retry", status_code=202)
def retry_execution(run_id: str):
    """Run the same request again as a new run (the original stays untouched)."""
    try:
        context = orchestrator.retry(run_id)
    except EngineError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"run_id": context.run_id, "status": context.state.value, "retry_of": run_id}


@ws_router.websocket("/ws/executions/{run_id}")
async def execution_socket(websocket: WebSocket, run_id: str):
    """Live events for one run: snapshot first, then every new event."""
    await websocket.accept()
    context = execution_manager.get(run_id)
    if context is None:
        await websocket.send_json({"run_id": run_id, "event_type": "EXECUTION_FAILED",
                                   "error": f"Run {run_id} not found"})
        await websocket.close()
        return

    execution_manager.subscribe(run_id, websocket)
    try:
        await websocket.send_json({
            "run_id": run_id,
            "event_type": "SNAPSHOT",
            "execution": context.summary(),
            "events": context.events[-100:],
            "logs": context.logs[-200:],
        })
        while True:
            await websocket.receive_text()          # keep-alive; clients rarely send
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        execution_manager.unsubscribe(run_id, websocket)
