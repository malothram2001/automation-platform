"""
The one pytest process runner used by every engine.

It replaces the module-global `CURRENT_PROC` / `STOP_FLAG` pair in
tests/test_runner.py for platform-started runs: each PytestProcess instance
belongs to exactly one run_id, so two executions can never stop or overwrite
each other.

It executes the real suites — Playwright/Appium pytest tests — and streams
stdout line by line to the caller.
"""
import os
import subprocess
import sys
import threading
from pathlib import Path
from typing import Callable, Dict, List, Optional

PROJECT_ROOT = Path(__file__).resolve().parents[3]

# Failure markers pytest prints; used to mark the active module failed.
FAIL_MARKERS = ("FAILED", "ERROR", "Application Crash Detected")


class PytestProcess:
    """Runs pytest once, streaming output, stoppable at any time."""

    def __init__(
        self,
        targets: List[str],
        results_dir: Path,
        *,
        extra_args: Optional[List[str]] = None,
        env: Optional[Dict[str, str]] = None,
        on_line: Optional[Callable[[str], None]] = None,
        cwd: Optional[Path] = None,
    ) -> None:
        self.targets = list(targets)
        self.results_dir = Path(results_dir)
        self.extra_args = list(extra_args or [])
        self.env_overrides = dict(env or {})
        self.on_line = on_line or (lambda line: None)
        self.cwd = Path(cwd or PROJECT_ROOT)
        self.proc: Optional[subprocess.Popen] = None
        self.stopped = False
        self._reader: Optional[threading.Thread] = None

    # ── command ────────────────────────────────────────────────────────────
    @property
    def command(self) -> List[str]:
        return [
            sys.executable, "-u", "-m", "pytest",
            "-p", "allure_pytest",
            "-s", "-v", "--tb=short",
            f"--alluredir={self.results_dir}",
            "-o", "log_cli=true",
            "-o", "log_cli_level=INFO",
            *self.extra_args,
            *self.targets,
        ]

    def _env(self) -> Dict[str, str]:
        env = os.environ.copy()
        # The suites import helpers from backend/, as the legacy runner does.
        backend_dir = str(self.cwd / "backend")
        existing = env.get("PYTHONPATH", "")
        env["PYTHONPATH"] = f"{backend_dir}{os.pathsep}{existing}" if existing else backend_dir
        env.update({
            "PYTHONIOENCODING": "utf-8",
            "PYTHONUTF8": "1",
            "PYTHONUNBUFFERED": "1",
            # Third-party pytest plugins are opt-in, as in the legacy runner.
            "PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1",
        })
        env.update({k: str(v) for k, v in self.env_overrides.items() if v is not None})
        return env

    # ── lifecycle ──────────────────────────────────────────────────────────
    def start(self) -> None:
        self.results_dir.mkdir(parents=True, exist_ok=True)
        self.proc = subprocess.Popen(
            self.command,
            cwd=str(self.cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=self._env(),
        )
        self._reader = threading.Thread(target=self._pump, name="pytest-stdout", daemon=True)
        self._reader.start()

    def _pump(self) -> None:
        assert self.proc is not None and self.proc.stdout is not None
        for line in self.proc.stdout:
            if self.stopped:
                break
            self.on_line(line.rstrip("\n"))

    def wait(self, timeout: Optional[float] = None) -> int:
        if self.proc is None:
            return -1
        self.proc.wait(timeout=timeout)
        if self._reader is not None:
            self._reader.join(timeout=5)
        return self.proc.returncode

    def stop(self) -> None:
        """Terminate the run (the whole process tree on Windows)."""
        self.stopped = True
        proc = self.proc
        if proc is None or proc.poll() is not None:
            return
        try:
            if os.name == "nt":
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
            else:
                proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
        except Exception:
            proc.kill()

    @property
    def returncode(self) -> Optional[int]:
        return self.proc.returncode if self.proc else None


class ModuleTracker:
    """Turns pytest output into module status transitions.

    pytest prints the node id of each test as it runs, so the module that owns
    the file is the module currently executing — the same rule the legacy runner
    used, kept here so module status stays per run.
    """

    def __init__(self, modules, on_status: Callable[[str, str, str], None]) -> None:
        # module id → normalised path prefix
        self.by_path = {(m.path or "").replace("\\", "/"): m for m in modules if m.path}
        self.on_status = on_status
        self.active = None
        self.failed: set = set()

    def feed(self, line: str) -> None:
        normalised = line.replace("\\", "/")
        for path, module in self.by_path.items():
            if path and path in normalised and "::" in normalised:
                if self.active is not module:
                    self._close_active()
                    self.active = module
                    self.on_status(module.id, "running", "Executing tests…")
                break
        if self.active and any(marker in line for marker in FAIL_MARKERS):
            self.failed.add(self.active.id)
            self.on_status(self.active.id, "failed", "Failure detected in this module")

    def _close_active(self) -> None:
        if self.active and self.active.id not in self.failed:
            self.on_status(self.active.id, "completed", "Module finished")

    def finish(self) -> None:
        self._close_active()
        self.active = None
