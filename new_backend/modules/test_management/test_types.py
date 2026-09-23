"""
Test types — the one list the whole platform uses.

Nothing else hard-codes a test type: screens read GET /test-management/test-types,
execution filters on the type each test case carries, and reports group by it.

A test case gets its type from (first match wins):
  1. an explicit allure label   @allure.label("testType", "smoke")
  2. an allure tag              @allure.tag("smoke")
  3. a pytest marker            @pytest.mark.smoke
  4. the stored value of a manually authored case
  5. DEFAULT_TEST_TYPE

To add a type, drop new_backend/data/test_types.json next to the test-case store:

    {"default": "functional",
     "types": [{"id": "security", "label": "Security Testing", "short": "Security",
                "aliases": ["sec"], "description": "…"}]}

Entries with an existing id override the built-in one; new ids are appended.
"""
import json
import re
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
CONFIG_FILE = DATA_DIR / "test_types.json"

DEFAULT_TEST_TYPE = "functional"

BUILT_IN_TEST_TYPES = [
    {"id": "functional", "label": "Functional Testing", "short": "Functional", "color": "#2563eb",
     "aliases": ["function", "func"],
     "description": "Verifies a feature behaves as specified."},
    {"id": "smoke", "label": "Smoke Testing", "short": "Smoke", "color": "#16a34a",
     "aliases": ["build_verification", "bvt"],
     "description": "Shallow checks that the build is worth testing."},
    {"id": "sanity", "label": "Sanity Testing", "short": "Sanity", "color": "#0891b2",
     "aliases": [],
     "description": "Narrow checks after a fix or small change."},
    {"id": "regression", "label": "Regression Testing", "short": "Regression", "color": "#7c3aed",
     "aliases": ["regress"],
     "description": "Confirms existing behaviour still works."},
    {"id": "system", "label": "System Testing", "short": "System", "color": "#d97706",
     "aliases": ["system_test"],
     "description": "The complete, integrated system against its requirements."},
    {"id": "e2e", "label": "End-to-End (E2E) Testing", "short": "E2E", "color": "#db2777",
     "aliases": ["end_to_end", "endtoend", "end2end"],
     "description": "A whole user journey across screens and services."},
    {"id": "uat", "label": "User Acceptance Testing (UAT)", "short": "UAT", "color": "#059669",
     "aliases": ["acceptance", "user_acceptance"],
     "description": "Business sign-off that the software is fit for use."},
    {"id": "integration", "label": "Integration Testing", "short": "Integration", "color": "#ea580c",
     "aliases": ["integrations", "contract"],
     "description": "Interaction between modules, services or systems."},
]

_cache: dict | None = None
_cache_stamp: float | None = None


def _read_overrides() -> dict:
    try:
        with open(CONFIG_FILE, encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _config() -> dict:
    """Built-in types merged with new_backend/data/test_types.json (re-read when it changes)."""
    global _cache, _cache_stamp
    stamp = CONFIG_FILE.stat().st_mtime if CONFIG_FILE.is_file() else None
    if _cache is not None and stamp == _cache_stamp:
        return _cache

    overrides = _read_overrides()
    types = [dict(t) for t in BUILT_IN_TEST_TYPES]
    by_id = {t["id"]: t for t in types}
    for extra in overrides.get("types", []):
        if not isinstance(extra, dict) or not extra.get("id"):
            continue
        extra = {**extra, "id": slugify(extra["id"])}
        if extra["id"] in by_id:
            by_id[extra["id"]].update(extra)
        else:
            types.append({"label": extra["id"].title(), "short": extra["id"].title(),
                          "color": "#64748b", "aliases": [], "description": "", **extra})
            by_id[extra["id"]] = types[-1]

    default = slugify(overrides.get("default") or DEFAULT_TEST_TYPE)
    _cache = {"types": types, "default": default if default in by_id else DEFAULT_TEST_TYPE}
    _cache_stamp = stamp
    return _cache


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(value or "").strip().lower()).strip("_")


def list_test_types() -> list[dict]:
    return [dict(t) for t in _config()["types"]]


def default_test_type() -> str:
    return _config()["default"]


def _lookup() -> dict[str, str]:
    """Every spelling we accept → canonical id."""
    table: dict[str, str] = {}
    for t in _config()["types"]:
        keys = [t["id"], t.get("label", ""), t.get("short", ""), *t.get("aliases", [])]
        # "End-to-End (E2E) Testing" → e2e / end_to_end_e2e_testing / end_to_end …
        keys.append(re.sub(r"\s*testing\s*$", "", t.get("label", ""), flags=re.I))
        for key in keys:
            if key:
                table[slugify(key)] = t["id"]
    return table


def resolve(value: str | None) -> str | None:
    """Canonical id for a label / marker / stored value, or None when it is not a type."""
    if not value:
        return None
    return _lookup().get(slugify(value))


def normalise(value: str | None, *, keep_unknown: bool = True) -> str | None:
    """Like resolve(), but keeps an unrecognised value as its own (custom) id.

    Manually authored cases from earlier versions carry labels such as "Negative"
    or "Usability"; they must keep working, so they become custom ids.
    """
    known = resolve(value)
    if known:
        return known
    if not value or not keep_unknown:
        return None
    return slugify(value) or None


def from_metadata(markers=(), tags=(), labels=None) -> str | None:
    """Type declared on an automated test, or None when it declares nothing."""
    labels = labels or {}
    for key in ("testType", "test_type", "testtype", "type"):
        known = resolve(labels.get(key))
        if known:
            return known
    for tag in tags:
        known = resolve(tag)
        if known:
            return known
    for marker in markers:
        known = resolve(marker)
        if known:
            return known
    return None


def label_for(type_id: str | None) -> str:
    if not type_id:
        return ""
    for t in _config()["types"]:
        if t["id"] == type_id:
            return t["label"]
    return str(type_id).replace("_", " ").title()


def short_label(type_id: str | None) -> str:
    if not type_id:
        return ""
    for t in _config()["types"]:
        if t["id"] == type_id:
            return t.get("short") or t["label"]
    return str(type_id).replace("_", " ").title()


def describe(type_ids) -> list[dict]:
    """[{id, label, short}] for a list of ids — what screens render as chips."""
    return [{"id": t, "label": label_for(t), "short": short_label(t)} for t in (type_ids or [])]


def selection_labels(type_ids) -> str:
    """Human summary for logs, Allure metadata and notifications."""
    ids = list(type_ids or [])
    return ", ".join(label_for(t) for t in ids) if ids else "All test types"
