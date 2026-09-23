"""
The execution request the frontend sends, and the live context of one run.

One model covers every test type; fields that do not apply to a type stay empty
(a web run has no device, a mobile run has no browser).

Environment is accepted for backward compatibility but never influences
selection or execution (see the platform's execution rules).
"""
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from .execution_state import ExecutionState

TestType = Literal["web", "mobile", "api", "performance", "custom"]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class DeviceSelection(BaseModel):
    udid: Optional[str] = None
    name: Optional[str] = None
    platform: str = "Android"
    platform_version: Optional[str] = None


class AppSelection(BaseModel):
    source: Literal["existing", "download", "none"] = "existing"
    apk: Optional[str] = None            # file name in the APK folder
    url: Optional[str] = None            # Google Drive URL when source=download


class ExecutionSettings(BaseModel):
    parallel: bool = False
    workers: int = 1
    retry: int = 0
    headless: bool = False


class ExecutionRequest(BaseModel):
    """What the Automation screens POST to /api/v1/executions."""
    test_type: TestType
    project: str = "Krishivaas"
    application: str                       # registry id, e.g. krishivaas_unified / krishivaas_web
    role: Optional[str] = None             # mobile only: regular_farmer, regular_client, …
    browser: Optional[str] = None          # web only: chromium, chrome, msedge, firefox, webkit
    device: DeviceSelection = Field(default_factory=DeviceSelection)
    app: AppSelection = Field(default_factory=AppSelection)
    modules: List[str] = Field(default_factory=list)      # module ids from the registry
    test_types: List[str] = Field(default_factory=list)   # test-type filter (functional, smoke, …)
    execution: ExecutionSettings = Field(default_factory=ExecutionSettings)
    # Accepted, never used to select or route anything.
    environment: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


@dataclass
class ModuleRun:
    """One module inside a run, as Live Execution shows it."""
    id: str
    name: str
    path: Optional[str] = None
    status: str = "pending"
    node_ids: List[str] = field(default_factory=list)
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    message: str = ""

    def as_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "path": self.path,
            "status": self.status,
            "tests": len(self.node_ids),
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "message": self.message,
        }


@dataclass
class ExecutionContext:
    """Everything one run owns. Nothing here is shared with another run."""
    run_id: str
    request: ExecutionRequest
    state: ExecutionState = ExecutionState.CREATED
    created_at: str = field(default_factory=utc_now)
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    error: Optional[str] = None
    modules: List[ModuleRun] = field(default_factory=list)
    events: List[dict] = field(default_factory=list)       # capped history for late subscribers
    logs: List[dict] = field(default_factory=list)         # capped log lines
    result: Optional[dict] = None
    artifacts: Dict[str, Any] = field(default_factory=dict)
    resources: Dict[str, Any] = field(default_factory=dict)  # device, browser, appium, apk…
    role_validation: Dict[str, Any] = field(default_factory=dict)
    results_dir: Optional[str] = None
    report_url: Optional[str] = None
    cancel_requested: bool = False

    # Set by the engine so the orchestrator can stop the run.
    process: Any = None

    @property
    def duration_seconds(self) -> Optional[float]:
        if not self.started_at:
            return None
        end = datetime.fromisoformat(self.finished_at) if self.finished_at else datetime.now(timezone.utc)
        return round((end - datetime.fromisoformat(self.started_at)).total_seconds(), 2)

    def summary(self) -> dict:
        """The shape the frontend reads (Execution Matrix, Live Execution, Reports)."""
        request = self.request
        return {
            "run_id": self.run_id,
            "status": self.state.value,
            "test_type": request.test_type,
            "project": request.project,
            "application": request.application,
            "role": request.role,
            "browser": request.browser,
            "device": request.device.model_dump(exclude_none=True) if request.device else {},
            "app": request.app.model_dump(exclude_none=True) if request.app else {},
            "modules": [m.as_dict() for m in self.modules],
            "test_types": request.test_types,
            "execution": request.execution.model_dump(),
            "created_at": self.created_at,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "duration": self.duration_seconds,
            "error": self.error,
            "result": self.result,
            "artifacts": self.artifacts,
            "resources": self.resources,
            "role_validation": self.role_validation,
            "report_url": self.report_url,
            "cancel_requested": self.cancel_requested,
        }
