from pydantic import BaseModel
from typing import List, Dict, Optional

class RunCompleteEvent(BaseModel):
    report_url: str

class ExistingTestRequest(BaseModel):
    apk_name: str
    tests_to_run: Optional[List[Dict[str, str]]] = None
    test_types: List[str] = []          # ids from GET /test-management/test-types
    environment: Optional[str] = None
    device: Optional[str] = None

class LogMessage(BaseModel):
    message: str
    status: str = "INFO"

class TestRequest(BaseModel):
    url: str
    tests_to_run: Optional[List[Dict[str, str]]] = None

class WebTestRequest(BaseModel):
    """Web modules selected in Web Testing → Run Selected Modules."""
    tests_to_run: List[Dict[str, str]]
    test_types: List[str] = []          # ids from GET /test-management/test-types
    environment: Optional[str] = None
    browser: Optional[str] = None
    headless: bool = False
    workers: int = 1
