# K_R_F
pip install -r requirements.txt

## Test types

Every test case carries a test type. The catalogue lives in one place —
`new_backend/modules/test_management/test_types.py` — and is served to the UI by
`GET /test-management/test-types`, so no screen, filter or report hard-codes the list.

| Built-in | Id |
|---|---|
| Functional Testing | `functional` (default) |
| Smoke Testing | `smoke` |
| Sanity Testing | `sanity` |
| Regression Testing | `regression` |
| System Testing | `system` |
| End-to-End (E2E) Testing | `e2e` |
| User Acceptance Testing (UAT) | `uat` |
| Integration Testing | `integration` |

### Assigning a type

Automated tests declare their type in the test file (first match wins):

```python
@pytest.mark.smoke                      # pytest marker (registered in pytest.ini)
@allure.tag("regression")               # allure tag
@allure.label("testType", "uat")        # explicit allure label
def test_login(): ...
```

A test that declares nothing counts as the default type (Functional), so existing
suites keep working unchanged. Manually authored cases pick their type in
Test Management → Test Cases; values stored before this list existed are kept as-is.

### Running only one type

Web Testing and Mobile Testing have a **Test Types** picker. Ticking a type filters the
run to the test cases that carry it — the platform expands each selected module to the
matching pytest node ids, so the filter follows the type on each case rather than any
hard-coded rule. Nothing ticked = every test case in the selected modules runs.

The selection is sent as `test_types` to `POST /test/start-web-test` and
`POST /test/start-test-existing`, is stored with the run (Test Runs, Live Execution) and is
written into `allure-results/environment.properties`, so the generated report records which
types were executed.

### Adding a type

Create `new_backend/data/test_types.json` — no code change, no redeploy of the frontend:

```json
{
  "default": "functional",
  "types": [
    {"id": "security", "label": "Security Testing", "short": "Security",
     "color": "#be123c", "aliases": ["sec"], "description": "Authn/authz and data protection"}
  ]
}
```

An entry with an existing id overrides that built-in type; a new id is appended. Add a
matching marker to `pytest.ini` if tests should declare it with `@pytest.mark.security`.
