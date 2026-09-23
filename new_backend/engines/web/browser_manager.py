"""
Browser Manager — which browsers this host can really drive with Playwright.

Playwright ships its own Chromium, Firefox and WebKit; Chrome and Edge run
through the copy installed on the machine (a Playwright "channel"). Availability
is probed, never assumed, so the UI can grey out what will not launch.
"""
from __future__ import annotations

import importlib.metadata
import importlib.util
import os
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional

# engine id → how it is launched and which system browser (if any) it needs
BROWSERS: Dict[str, dict] = {
    "chromium": {"label": "Chromium (bundled)", "engine": "chromium", "channel": None, "system": None},
    "chrome": {"label": "Google Chrome", "engine": "chromium", "channel": "chrome", "system": "Google Chrome"},
    "msedge": {"label": "Microsoft Edge", "engine": "chromium", "channel": "msedge", "system": "Microsoft Edge"},
    "firefox": {"label": "Firefox (bundled)", "engine": "firefox", "channel": None, "system": None},
    "webkit": {"label": "WebKit (bundled)", "engine": "webkit", "channel": None, "system": None},
}

DEFAULT_BROWSER = "chromium"

# Where `playwright install` puts the bundled browsers.
_BUNDLE_DIRS = {
    "chromium": "chromium",
    "firefox": "firefox",
    "webkit": "webkit",
}


def playwright_version() -> Optional[str]:
    try:
        return importlib.metadata.version("playwright")
    except importlib.metadata.PackageNotFoundError:
        return None


def playwright_installed() -> bool:
    return importlib.util.find_spec("playwright") is not None


@lru_cache(maxsize=1)
def _browsers_path() -> Optional[Path]:
    override = os.getenv("PLAYWRIGHT_BROWSERS_PATH")
    if override and override != "0":
        return Path(override)
    local = os.getenv("LOCALAPPDATA") or os.path.expanduser("~/.cache")
    candidate = Path(local) / "ms-playwright"
    return candidate if candidate.is_dir() else None


def _bundle_installed(engine: str) -> Optional[bool]:
    """True/False when we can tell, None when the browser cache is not readable."""
    root = _browsers_path()
    if root is None:
        return None
    prefix = _BUNDLE_DIRS.get(engine)
    return any(child.name.startswith(prefix) for child in root.iterdir()) if prefix else None


def _system_browsers() -> Dict[str, dict]:
    # Reuse the platform's existing detection instead of a second implementation.
    from new_backend.modules.platform_hub.service import list_browsers

    return {b["name"]: b for b in list_browsers()["browsers"]}


def list_available() -> dict:
    """Everything the Web Testing screen needs to populate its Browser select."""
    system = _system_browsers()
    installed = playwright_installed()
    browsers = []
    for browser_id, spec in BROWSERS.items():
        detail = ""
        if not installed:
            available = False
            detail = "Playwright is not installed on the backend host"
        elif spec["system"]:
            found = system.get(spec["system"], {})
            available = bool(found.get("installed"))
            detail = found.get("path") or "Not found on this host"
        else:
            bundled = _bundle_installed(spec["engine"])
            available = bool(bundled) if bundled is not None else True
            detail = ("Bundled with Playwright" if bundled
                      else "Run `playwright install` to download it" if bundled is False
                      else "Bundled with Playwright (cache not readable)")
        browsers.append({
            "id": browser_id,
            "label": spec["label"],
            "engine": spec["engine"],
            "channel": spec["channel"],
            "available": available,
            "detail": detail,
        })
    return {
        "browsers": browsers,
        "default": DEFAULT_BROWSER,
        "playwright_version": playwright_version(),
        "playwright_installed": installed,
    }


def resolve(browser: Optional[str]) -> dict:
    """Validate a requested browser and return how the suite should launch it."""
    browser_id = (browser or DEFAULT_BROWSER).lower()
    spec = BROWSERS.get(browser_id)
    if spec is None:
        raise ValueError(f"Unknown browser '{browser}'. Choose one of: {', '.join(BROWSERS)}")
    return {"id": browser_id, **spec}
