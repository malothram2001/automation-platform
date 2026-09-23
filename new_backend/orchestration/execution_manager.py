"""
ExecutionManager — the registry of runs.

Each run_id owns its own state, modules, logs, artifacts and process. One run can
never overwrite another (the old global `core.state.runs` + single CURRENT_PROC
could). Events are published per run to /ws/executions/{run_id} and mirrored to
the legacy /ws/test-status stream so the existing Live Execution screen keeps
working while the frontend migrates.
"""
import asyncio
import threading
from datetime import datetime, timezone
from typing import Dict, List, Optional

from new_backend.core.logger import logger
from new_backend.core.websocket import manager as legacy_manager

from .execution_context import ExecutionContext, ExecutionRequest, ModuleRun, utc_now
from .execution_state import ACTIVE_STATES, TERMINAL_STATES, EventType, ExecutionState

MAX_EVENTS = 500            # per run, for late subscribers
MAX_LOGS = 2000             # per run

# Legacy events the current Live Execution screen understands.
_LEGACY_EVENT = {
    EventType.EXECUTION_STARTED: "RUN_START",
    EventType.LOG: "LOG",
    EventType.EXECUTION_COMPLETED: "RUN_COMPLETE",
}


class ExecutionManager:
    def __init__(self) -> None:
        self._runs: Dict[str, ExecutionContext] = {}
        self._subscribers: Dict[str, set] = {}
        self._lock = threading.Lock()
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._counter = 0

    # ── event loop plumbing ────────────────────────────────────────────────
    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Called once at startup so engine threads can publish events."""
        self._loop = loop

    # ── run lifecycle ──────────────────────────────────────────────────────
    def new_run_id(self) -> str:
        with self._lock:
            self._counter += 1
            stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
            return f"RUN-{stamp}-{self._counter:03d}"

    def create(self, request: ExecutionRequest) -> ExecutionContext:
        context = ExecutionContext(run_id=self.new_run_id(), request=request)
        with self._lock:
            self._runs[context.run_id] = context
        self.emit(context, EventType.EXECUTION_CREATED, {"request": request.model_dump()})
        return context

    def get(self, run_id: str) -> Optional[ExecutionContext]:
        return self._runs.get(run_id)

    def list(self, limit: int = 50) -> List[ExecutionContext]:
        runs = sorted(self._runs.values(), key=lambda c: c.created_at, reverse=True)
        return runs[:limit]

    def active(self) -> List[ExecutionContext]:
        return [c for c in self._runs.values() if c.state in ACTIVE_STATES]

    def is_busy(self) -> bool:
        """True while any run holds an execution slot (pytest runs serially today)."""
        return bool(self.active())

    # ── state & events ─────────────────────────────────────────────────────
    def set_state(self, context: ExecutionContext, state: ExecutionState, message: str = "") -> None:
        context.state = state
        if state is ExecutionState.RUNNING and not context.started_at:
            context.started_at = utc_now()
        if state in TERMINAL_STATES and not context.finished_at:
            context.finished_at = utc_now()
        self.emit(context, EventType.STATE_CHANGED, {"state": state.value, "message": message})

    def set_modules(self, context: ExecutionContext, modules: List[ModuleRun]) -> None:
        context.modules = modules
        self.emit(context, EventType.RESOURCE_ALLOCATED, {"modules": [m.as_dict() for m in modules]})

    def module_status(self, context: ExecutionContext, module_id: str, status: str, message: str = "") -> None:
        module = next((m for m in context.modules if m.id == module_id or m.name == module_id), None)
        if module is None:
            return
        module.status = status
        module.message = message
        if status == "running" and not module.started_at:
            module.started_at = utc_now()
        if status in ("completed", "failed", "skipped"):
            module.finished_at = utc_now()
        event = {
            "running": EventType.MODULE_STARTED,
            "completed": EventType.MODULE_COMPLETED,
            "failed": EventType.MODULE_FAILED,
        }.get(status, EventType.MODULE_STARTED)
        self.emit(context, event, {"module": module.name, "module_id": module.id,
                                   "status": status, "message": message})

    def log(self, context: ExecutionContext, message: str, status: str = "INFO") -> None:
        entry = {"timestamp": utc_now(), "message": message, "status": status}
        context.logs.append(entry)
        if len(context.logs) > MAX_LOGS:
            del context.logs[:-MAX_LOGS]
        self.emit(context, EventType.LOG, {"message": message, "status": status}, store=False)

    def emit(self, context: ExecutionContext, event_type: EventType, payload: dict | None = None,
             store: bool = True) -> None:
        """Publish one run-scoped event. Safe to call from engine threads."""
        event = {
            "run_id": context.run_id,
            "event_type": event_type.value,
            "timestamp": utc_now(),
            **(payload or {}),
        }
        if store:
            context.events.append(event)
            if len(context.events) > MAX_EVENTS:
                del context.events[:-MAX_EVENTS]
        self._dispatch(context.run_id, event)

    # ── delivery ───────────────────────────────────────────────────────────
    def _dispatch(self, run_id: str, event: dict) -> None:
        loop = self._loop
        if loop is None:
            return
        try:
            asyncio.run_coroutine_threadsafe(self._deliver(run_id, event), loop)
        except RuntimeError:                       # loop closed during shutdown
            pass

    async def _deliver(self, run_id: str, event: dict) -> None:
        for websocket in list(self._subscribers.get(run_id, ())):
            try:
                await websocket.send_json(event)
            except Exception:
                self.unsubscribe(run_id, websocket)
        await self._mirror_to_legacy(event)

    async def _mirror_to_legacy(self, event: dict) -> None:
        """Keep the existing /ws/test-status screen alive during the migration."""
        legacy_type = _LEGACY_EVENT.get(EventType(event["event_type"]))
        payload = {k: v for k, v in event.items() if k not in ("event_type",)}
        try:
            if legacy_type:
                await legacy_manager.broadcast({"type": legacy_type, "payload": payload})
            elif event["event_type"] in ("MODULE_STARTED", "MODULE_COMPLETED", "MODULE_FAILED"):
                await legacy_manager.broadcast({"type": "MODULE", "payload": payload})
            elif event["event_type"] == "RESOURCE_ALLOCATED" and "modules" in event:
                await legacy_manager.broadcast({
                    "type": "MODULES",
                    "payload": {"run_id": event["run_id"], "modules": event["modules"]},
                })
        except Exception:                          # a broken legacy socket must not break a run
            logger.debug("legacy websocket mirror failed", exc_info=True)

    # ── subscriptions ──────────────────────────────────────────────────────
    def subscribe(self, run_id: str, websocket) -> None:
        self._subscribers.setdefault(run_id, set()).add(websocket)

    def unsubscribe(self, run_id: str, websocket) -> None:
        subscribers = self._subscribers.get(run_id)
        if subscribers:
            subscribers.discard(websocket)
            if not subscribers:
                self._subscribers.pop(run_id, None)

    # ── cancellation ───────────────────────────────────────────────────────
    def request_cancel(self, run_id: str) -> bool:
        context = self.get(run_id)
        if context is None or context.state in TERMINAL_STATES:
            return False
        context.cancel_requested = True
        process = context.process
        if process is not None:
            try:
                process.stop()
            except Exception:
                logger.exception("Failed to stop process for %s", run_id)
        self.log(context, "Stop requested by user", "WARN")
        return True


execution_manager = ExecutionManager()
