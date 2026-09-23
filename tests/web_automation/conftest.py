"""
conftest.py — sync Playwright, Windows + anyio safe
=====================================================
Uses sync Playwright API throughout.
No async fixtures = no event loop conflicts with anyio on Windows.
Tests are written as plain `def` (not async def).
"""

import json
import os
import pytest
import allure
from pathlib import Path
from playwright.sync_api import sync_playwright, Page


# ── module-level holders ──────────────────────────────────────────────
_pw      = None
_browser = None
_context = None
_page    = None

# Run configuration, set by the platform (Web Testing → Execution Configuration).
# Defaults keep a plain `pytest` run headed on bundled Chromium.
BROWSER  = os.getenv("WEB_BROWSER", "chromium").lower()
HEADLESS = os.getenv("WEB_HEADLESS", "").strip().lower() in ("1", "true", "yes")
SLOW_MO  = int(os.getenv("WEB_SLOW_MO", "0" if HEADLESS else "200"))

# Chrome and Edge run through the copy installed on the host (a Playwright channel).
_CHANNELS = {"chrome": "chrome", "msedge": "msedge"}


def _launch(pw):
    if BROWSER in _CHANNELS:
        return pw.chromium.launch(headless=HEADLESS, slow_mo=SLOW_MO, channel=_CHANNELS[BROWSER])
    engine = {"firefox": pw.firefox, "webkit": pw.webkit}.get(BROWSER, pw.chromium)
    return engine.launch(headless=HEADLESS, slow_mo=SLOW_MO)


@pytest.fixture(scope="session", autouse=True)
def launch_browser():
    global _pw, _browser, _context, _page

    _pw = sync_playwright().start()
    print(f"[web] launching {BROWSER} (headless={HEADLESS}, slow_mo={SLOW_MO}ms)")
    _browser = _launch(_pw)
    _context = _browser.new_context(
        viewport={"width": 1440, "height": 900},
        permissions=["geolocation"],
        geolocation={
            "latitude": 17.3850,
            "longitude": 78.4867
        }
    )
    _context.set_default_timeout(15_000)
    _page = _context.new_page()

    yield

    _page.close()
    _context.close()
    _browser.close()
    _pw.stop()


@pytest.fixture(scope="session")
def shared_page() -> Page:
    return _page


@pytest.fixture(scope="session")
def test_data():
    path = Path(__file__).parent / "test_data" / "test_data.json"
    with open(path) as f:
        return json.load(f)


@pytest.fixture(scope="session")
def login_page(shared_page):
    from pages.login_page import LoginPage
    return LoginPage(shared_page)


@pytest.fixture(scope="session")
def onboarding_page(shared_page):
    from pages.onboarding_page import OnboardingPage
    return OnboardingPage(shared_page)

@pytest.fixture(scope="session")
def user_onboarding_page(shared_page):
    from pages.user_onboarding_page import UserOnboardingPage
    return UserOnboardingPage(shared_page)


# ── screenshot on failure ─────────────────────────────────────────────
@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()
    if report.when == "call" and report.failed:
        page = item.funcargs.get("shared_page")
        if page:
            try:
                screenshot = page.screenshot()
                allure.attach(screenshot, name=f"failure_{item.name}",
                              attachment_type=allure.attachment_type.PNG)
            except Exception:
                pass