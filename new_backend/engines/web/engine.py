"""
WebEngine — runs the existing Playwright + pytest suites.

It resolves the application, browser and modules the user picked, then executes
the real tests under tests/web_automation. It does not decide what to run and it
does not know about environments: Web execution has no environment dimension.
"""
from __future__ import annotations

from typing import List

from new_backend.engines.base import EngineError, ExecutionEngine, run_results_dir
from new_backend.engines.common.pytest_process import ModuleTracker, PytestProcess
from new_backend.orchestration.execution_context import ExecutionContext, ModuleRun
from new_backend.orchestration.execution_manager import execution_manager
from new_backend.orchestration.execution_state import EventType
from new_backend.test_registry import registry

from . import browser_manager


class WebEngine(ExecutionEngine):
    test_type = "web"

    # ── validate ───────────────────────────────────────────────────────────
    def validate(self, context: ExecutionContext) -> None:
        request = context.request
        applications = {app["id"] for app in registry.web_applications()}
        if request.application not in applications:
            raise EngineError(
                f"Unknown web application '{request.application}'. "
                f"Available: {', '.join(sorted(applications)) or 'none discovered under tests/'}"
            )

        try:
            browser = browser_manager.resolve(request.browser)
        except ValueError as exc:
            raise EngineError(str(exc)) from exc
        if not browser_manager.playwright_installed():
            raise EngineError(
                "Playwright is not installed on the backend host — "
                "run `pip install playwright && playwright install` before starting a web run."
            )
        available = {b["id"]: b for b in browser_manager.list_available()["browsers"]}
        if not available[browser["id"]]["available"]:
            raise EngineError(
                f"{browser['label']} cannot be launched on this host: {available[browser['id']]['detail']}"
            )
        context.resources["browser"] = {**browser, "detail": available[browser["id"]]["detail"]}

        resolution = registry.resolve(
            "web", request.application, request.modules, test_types=request.test_types,
        )
        if not resolution.targets:
            raise EngineError(
                "Nothing to run: " + (
                    "; ".join(f"{s['module']} — {s['reason']}" for s in resolution.skipped)
                    or "no module selected"
                )
            )
        context.resources["resolution"] = resolution

    # ── prepare ────────────────────────────────────────────────────────────
    def prepare(self, context: ExecutionContext) -> None:
        resolution = context.resources["resolution"]
        browser = context.resources["browser"]

        modules: List[ModuleRun] = [
            ModuleRun(id=m.id, name=m.name, path=m.path, node_ids=m.node_ids)
            for m in resolution.modules
        ]
        execution_manager.set_modules(context, modules)
        context.results_dir = str(run_results_dir(context.run_id))
        execution_manager.emit(context, EventType.BROWSER_STATUS, {
            "browser": browser["id"], "label": browser["label"], "status": "ready",
        })
        for skipped in resolution.skipped:
            execution_manager.log(
                context, f"Skipped {skipped.get('module') or skipped.get('path')} — {skipped['reason']}", "WARN",
            )

    # ── execute ────────────────────────────────────────────────────────────
    def execute(self, context: ExecutionContext) -> int:
        request = context.request
        resolution = context.resources["resolution"]
        browser = context.resources["browser"]
        settings = request.execution

        extra_args: List[str] = []
        if settings.parallel and settings.workers > 1:
            extra_args += ["-n", str(settings.workers), "--dist", "loadfile"]
        if settings.retry:
            extra_args += ["--reruns", str(settings.retry)]      # honoured when pytest-rerunfailures is installed

        env = {
            # tests/web_automation/conftest.py reads these — the browser is never
            # hard-coded in the suite.
            "WEB_BROWSER": browser["id"],
            "WEB_HEADLESS": "true" if settings.headless else "false",
            "TAP_RUN_ID": context.run_id,
            "TAP_APPLICATION": request.application,
            "TAP_TEST_TYPES": ",".join(request.test_types),
        }

        tracker = ModuleTracker(
            context.modules,
            lambda module_id, status, message: execution_manager.module_status(context, module_id, status, message),
        )

        def on_line(line: str) -> None:
            tracker.feed(line)
            execution_manager.log(context, line)

        process = PytestProcess(
            targets=resolution.targets,
            results_dir=context.results_dir,
            extra_args=extra_args,
            env=env,
            on_line=on_line,
        )
        context.process = process
        execution_manager.log(
            context,
            f"pytest {' '.join(resolution.targets)} · browser {browser['id']} · "
            f"{'headless' if settings.headless else 'headed'}",
            "INFO",
        )
        process.start()
        code = process.wait()
        tracker.finish()
        return code

    def cleanup(self, context: ExecutionContext) -> None:
        context.process = None
