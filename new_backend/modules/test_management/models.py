from typing import List, Literal, Optional

from pydantic import BaseModel, Field

TestType = Literal["Functional", "Negative", "Regression", "Smoke", "Integration", "Usability"]
Priority = Literal["High", "Medium", "Low"]
AutomationStatus = Literal["Automated", "Manual", "Not Automated"]
CaseStatus = Literal["Active", "Draft", "Deprecated"]


class TestStep(BaseModel):
    action: str
    expected: str = ""


class TestCaseInput(BaseModel):
    """A manually authored test case (Test Management → Test Cases → New)."""
    title: str = Field(min_length=1, max_length=300)
    module: str = "General"
    test_type: TestType = "Functional"
    priority: Priority = "Medium"
    automation_status: AutomationStatus = "Manual"
    status: CaseStatus = "Active"
    variant: Optional[str] = None
    tags: List[str] = []
    description: str = ""
    preconditions: str = ""
    expected_result: str = ""
    test_data: str = ""
    steps: List[TestStep] = []
    author: str = ""


class ImportRequest(BaseModel):
    """Bulk import: the file's text content, parsed on the backend."""
    format: Literal["csv", "json"]
    content: str
    replace: bool = False   # true clears existing manual cases first
