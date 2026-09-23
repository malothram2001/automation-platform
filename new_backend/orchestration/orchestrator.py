"""
ExecutionOrchestrator — the one controller every execution goes through.

    request → validate → allocate → start → run → process results → complete

It owns the lifecycle and the events; the engines own how a test type runs. It
contains no application-specific test logic, no Appium calls, no Playwright
calls and no Jira/Slack calls (those consume results afterwards).
"""
from __future__ import annotations

import threading
from typing import Dict, Optional

from new_backend.core.logger import logger
from new_backend.engines.base import EngineError, ExecutionEngine
from new_backend.engines.mobile.engine import MobileEngine
from new_backend.engines.web.engine import WebEngine
from new_backend.reporting import result_processor

from .execution_context import ExecutionContext, ExecutionRequest
from .execution_manager import execution_manager
from .execution_state import EventType, ExecutionState

# Engine per test type. api/performance/custom arrive with their own UI.
ENGINES: Dict[str, type[ExecutionEngine]] = {
    "web": WebEngine,
    "mobile": MobileEngine,
}


class ExecutionOrchestrator:
    def __init__(self) -> None:
        self.manager = execution_manager

    # ── entry point ────────────────────────────────────────────────────────
    def submit(self, request: ExecutionRequest) -> ExecutionContext:
        """Create the run and start it in the background. Returns immediately."""
        context = self.manager.create(request)
        self.manager.set_state(context, ExecutionState.QUEUED)
        thread = threading.Thread(
            target=self._run, args=(context,), name=f"exec-{context.run_id}", daemon=True,
        )
        thread.start()
        return context

    def engine_for(self, test_type: str) -> ExecutionEngine:
        engine_cls = ENGINES.get(test_type)
        if engine_cls is None:
            raise EngineError(
                f"No execution engine for '{test_type}' yet. Available: {', '.join(sorted(ENGINES))}"
            )
        return engine_cls()

    # ── lifecycle ──────────────────────────────────────────────────────────
    def _run(self, context: ExecutionContext) -> None:
        engine: Optional[ExecutionEngine] = None
        try:
            engine = self.engine_for(context.request.test_type)

            self.manager.set_state(context, ExecutionState.VALIDATING)
            self.manager.emit(context, EventType.VALIDATION_STARTED)
            engine.validate(context)
            self.manager.emit(context, EventType.VALIDATION_COMPLETED)
            if self._cancelled(context):
                return

            self.manager.set_state(context, ExecutionState.ALLOCATING_RESOURCES)
            engine.prepare(context)
            if self._cancelled(context):
                return

            self.manager.set_state(context, ExecutionState.STARTING)
            self.manager.emit(context, EventType.EXECUTION_STARTED, {
                "test_type": context.request.test_type,
                "application": context.request.application,
                "role": context.request.role,
                "browser": context.request.browser,
                "modules": [m.as_dict() for m in context.modules],
            })

            self.manager.set_state(context, ExecutionState.RUNNING)
            exit_code = engine.execute(context)

            if context.cancel_requested:
                self._finish(context, ExecutionState.CANCELLED, exit_code)
                return

            self.manager.set_state(context, ExecutionState.PROCESSING_RESULTS)
            self.manager.emit(context, EventType.RESULT_PROCESSING)
            self._finish(context, None, exit_code)

        except EngineError as exc:                     # expected, user-facing problem
            context.error = str(exc)
            self.manager.log(context, str(exc), "FAILED")
            self._finish(context, ExecutionState.FAILED, None)
        except Exception as exc:                        # unexpected: keep the platform up
            logger.exception("Execution %s crashed", context.run_id)
            context.error = f"{type(exc).__name__}: {exc}"
            self.manager.log(context, context.error, "FAILED")
            self._finish(context, ExecutionState.FAILED, None)
        finally:
            if engine is not None:
                try:
                    engine.cleanup(context)
                except Exception:
                    logger.exception("Cleanup failed for %s", context.run_id)

    def _cancelled(self, context: ExecutionContext) -> bool:
        if not context.cancel_requested:
            return False
        self._finish(context, ExecutionState.CANCELLED, None)
        return True

    def _finish(self, context: ExecutionContext, state: Optional[ExecutionState], exit_code) -> None:
        """Process results (when the run got that far) and close the run."""
        try:
            context.result = result_processor.process(context, exit_code)
            if context.results_dir and context.result["total"]:
                if result_processor.publish_to_repository_results(context):
                    self.manager.emit(context, EventType.ALLURE_READY, {
                        "results_dir": context.results_dir,
                    })
        except Exception:
            logger.exception("Result processing failed for %s", context.run_id)

        if state is None:
            executed = (context.result or {}).get("total", 0)
            if executed:
                # Tests ran: the run completed, whether they passed or failed.
                state = ExecutionState.COMPLETED
            else:
                state = ExecutionState.FAILED
                context.error = context.error or (
                    "No test was collected for this selection"
                    if exit_code == 5
                    else f"pytest exited with code {exit_code} without producing any result"
                )

        self.manager.set_state(context, state)
        event = {
            ExecutionState.COMPLETED: EventType.EXECUTION_COMPLETED,
            ExecutionState.FAILED: EventType.EXECUTION_FAILED,
            ExecutionState.CANCELLED: EventType.EXECUTION_CANCELLED,
        }[state]
        self.manager.emit(context, event, {
            "result": context.result,
            "error": context.error,
            "report_url": context.report_url,
        })

    # ── controls ───────────────────────────────────────────────────────────
    def stop(self, run_id: str) -> bool:
        return self.manager.request_cancel(run_id)

    def retry(self, run_id: str) -> ExecutionContext:
        previous = self.manager.get(run_id)
        if previous is None:
            raise EngineError(f"Run {run_id} is unknown")
        return self.submit(previous.request.model_copy(deep=True))


orchestrator = ExecutionOrchestrator()
