"""
MobileEngine — runs the existing Appium + pytest suites against the unified app.

The mobile application is ONE app (Krishivaas Unified) and the four historical
apps are roles inside it. The engine resolves role → modules → real test files,
allocates the device, APK and Appium server, and hands everything to pytest as
execution-time configuration; nothing is hard-coded in conftest.py.

Role validation (login → detect role → switch role) is reported honestly: the
engine passes the expected role to the suite and records what the suite reports
back. While tests/managers/ (login_manager, role_detector, role_switcher) does
not exist in this repository, the status stays NOT_IMPLEMENTED rather than
claiming a match.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import List

from new_backend.engines.base import EngineError, ExecutionEngine, run_results_dir
from new_backend.engines.common.pytest_process import ModuleTracker, PytestProcess
from new_backend.orchestration.execution_context import ExecutionContext, ModuleRun
from new_backend.orchestration.execution_manager import execution_manager
from new_backend.orchestration.execution_state import EventType
from new_backend.test_registry import registry

from . import apk_manager, appium_manager, device_manager

ROLE_REPORT_FILE = "role_validation.json"      # written by the suite when it can


class MobileEngine(ExecutionEngine):
    test_type = "mobile"

    # ── validate ───────────────────────────────────────────────────────────
    def validate(self, context: ExecutionContext) -> None:
        request = context.request
        application = registry.mobile_application()
        if request.application not in (application["id"], "", None):
            raise EngineError(
                f"Unknown mobile application '{request.application}'. "
                f"This platform runs one unified app: {application['id']}"
            )
        roles = {role["id"] for role in application["roles"]}
        if request.role not in roles:
            raise EngineError(
                f"Select a role for the unified app. Available: {', '.join(sorted(roles))}"
            )

        try:
            device = device_manager.resolve(request.device.udid if request.device else None)
        except ValueError as exc:
            raise EngineError(str(exc)) from exc
        context.resources["device"] = device

        try:
            apk = apk_manager.resolve(request.app.apk if request.app else None,
                                      url=request.app.url if request.app else None)
        except ValueError as exc:
            raise EngineError(str(exc)) from exc
        context.resources["apk"] = apk

        resolution = registry.resolve(
            "mobile", application["id"], request.modules,
            role=request.role, test_types=request.test_types,
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
        device = context.resources["device"]
        apk = context.resources["apk"]

        modules: List[ModuleRun] = [
            ModuleRun(id=m.id, name=m.name, path=m.path, node_ids=m.node_ids)
            for m in resolution.modules
        ]
        execution_manager.set_modules(context, modules)
        context.results_dir = str(run_results_dir(context.run_id))

        execution_manager.emit(context, EventType.DEVICE_STATUS, {
            "device": device["udid"], "name": device["name"], "status": device["status"],
        })
        try:
            appium = appium_manager.ensure_running()
        except RuntimeError as exc:
            raise EngineError(str(exc)) from exc
        context.resources["appium"] = appium
        execution_manager.emit(context, EventType.APPIUM_STATUS, {
            "status": appium["status"], "url": appium["url"],
            "managed_by_platform": appium["managed_by_platform"],
        })

        context.role_validation = {
            "expected_role": context.request.role,
            "detected_role": None,
            "status": "PENDING",
        }
        execution_manager.emit(context, EventType.ROLE_STATUS, dict(context.role_validation))
        execution_manager.log(
            context,
            f"App build {apk['name']}"
            + (f" · {apk.get('package_name')} {apk.get('app_version', '')}".rstrip() if apk.get("package_name") else ""),
            "INFO",
        )
        for skipped in resolution.skipped:
            execution_manager.log(
                context, f"Skipped {skipped.get('module') or skipped.get('path')} — {skipped['reason']}", "WARN",
            )

    # ── execute ────────────────────────────────────────────────────────────
    def execute(self, context: ExecutionContext) -> int:
        request = context.request
        resolution = context.resources["resolution"]
        device = context.resources["device"]
        apk = context.resources["apk"]
        appium = context.resources["appium"]
        settings = request.execution

        extra_args = [
            f"--apk={apk['path']}",
            f"--app-name={apk.get('app_name') or 'Krishivaas Unified App'}",
            f"--app-version={apk.get('app_version') or 'Unknown Version'}",
        ]
        if settings.retry:
            extra_args += ["--reruns", str(settings.retry)]

        env = {
            # tests/conftest.py consumes these — device, APK, server and role are
            # execution-time configuration, never literals in the suite.
            "TAP_RUN_ID": context.run_id,
            "TAP_APPLICATION": registry.MOBILE_APPLICATION_ID,
            "TAP_EXPECTED_ROLE": request.role or "",
            "TAP_MODULES": ",".join(m.name for m in resolution.modules),
            "TAP_TEST_TYPES": ",".join(request.test_types),
            "TAP_RESULTS_DIR": context.results_dir,
            "DEVICE_UDID": device["udid"],
            "ANDROID_SERIAL": device["udid"],
            "DEVICE_NAME": device["name"],
            "DEVICE_PLATFORM_VERSION": device.get("platform_version") or "",
            "APPIUM_URL": appium["url"],
            "APK_PATH": apk["path"],
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
            f"pytest {' '.join(resolution.targets)} · role {request.role} · device {device['udid']}",
            "INFO",
        )
        process.start()
        code = process.wait()
        tracker.finish()
        self._collect_role_validation(context)
        return code

    # ── role validation ────────────────────────────────────────────────────
    def _collect_role_validation(self, context: ExecutionContext) -> None:
        """Read what the suite reported about the logged-in role, if anything.

        The suite writes <results_dir>/role_validation.json when a role detector
        exists. Without it the status stays NOT_IMPLEMENTED — the platform never
        claims a role was verified when nothing verified it.
        """
        report = Path(context.results_dir or "") / ROLE_REPORT_FILE
        expected = context.request.role
        if report.is_file():
            try:
                data = json.loads(report.read_text(encoding="utf-8"))
                detected = data.get("detected_role")
                context.role_validation = {
                    "expected_role": expected,
                    "detected_role": detected,
                    "switched": bool(data.get("switched")),
                    "status": data.get("status") or (
                        "ROLE_MATCH" if detected == expected else "ROLE_MISMATCH"
                    ),
                }
            except (OSError, ValueError):
                context.role_validation = {
                    "expected_role": expected, "detected_role": None,
                    "status": "UNREADABLE_REPORT",
                }
        else:
            context.role_validation = {
                "expected_role": expected,
                "detected_role": None,
                "status": "NOT_IMPLEMENTED",
                "detail": (
                    "No role detector reported a role. Add tests/managers/role_detector.py and write "
                    f"{ROLE_REPORT_FILE} into TAP_RESULTS_DIR to have the platform validate the role."
                ),
            }
        execution_manager.emit(context, EventType.ROLE_STATUS, dict(context.role_validation))

    def cleanup(self, context: ExecutionContext) -> None:
        context.process = None
        # Appium keeps running for the next run; the user stops it from the UI.
        os.environ.pop("ANDROID_SERIAL", None)
