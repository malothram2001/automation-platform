"""
Engine contract.

The orchestrator owns the lifecycle; an engine owns *how* one kind of test runs.
Engines never talk to routes, never create Jira issues and never decide what the
user selected — they execute the resolved request and report what happened.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path

from new_backend.orchestration.execution_context import ExecutionContext

PROJECT_ROOT = Path(__file__).resolve().parents[2]
RUNS_DIR = PROJECT_ROOT / "var" / "runs"


class EngineError(RuntimeError):
    """A run cannot start or continue — the message reaches the user unchanged."""


class ExecutionEngine(ABC):
    test_type: str = ""

    @abstractmethod
    def validate(self, context: ExecutionContext) -> None:
        """Raise EngineError when the request cannot run (unknown device, no tests…)."""

    @abstractmethod
    def prepare(self, context: ExecutionContext) -> None:
        """Allocate resources: browser, device, Appium, APK, results directory."""

    @abstractmethod
    def execute(self, context: ExecutionContext) -> int:
        """Run the real suites. Returns the pytest exit code."""

    def cleanup(self, context: ExecutionContext) -> None:
        """Release anything prepare() allocated. Must not raise."""


def run_results_dir(run_id: str) -> Path:
    """Per-run Allure results, so two runs never mix their results."""
    path = RUNS_DIR / run_id / "allure-results"
    path.mkdir(parents=True, exist_ok=True)
    return path
