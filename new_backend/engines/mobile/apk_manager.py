"""
APK Manager — the builds available to a mobile run.

Reuses the existing APK folder and the existing androguard-based metadata reader
(modules/test_runner/gdrive_loader) rather than parsing APKs a second time.
"""
from __future__ import annotations

import os
from typing import List, Optional

from new_backend.modules.test_runner.gdrive_loader import download_apk, get_apk_info
from new_backend.modules.test_runner.service import APKS_DIR


def list_apks() -> List[dict]:
    """Every APK on the backend host, newest first."""
    try:
        names = [n for n in os.listdir(APKS_DIR) if n.lower().endswith((".apk", ".apks"))]
    except OSError:
        return []
    apks = []
    for name in names:
        path = os.path.join(APKS_DIR, name)
        try:
            stat = os.stat(path)
        except OSError:
            continue
        apks.append({
            "name": name,
            "path": path,
            "size_bytes": stat.st_size,
            "modified_at": stat.st_mtime,
        })
    return sorted(apks, key=lambda a: a["modified_at"], reverse=True)


def metadata(path: str) -> dict:
    """Package, app name and version straight from the APK (best effort)."""
    try:
        return get_apk_info(path) or {}
    except Exception:
        return {}


def resolve(apk: Optional[str], *, url: Optional[str] = None, on_progress=None) -> dict:
    """Locate the APK a run should install, downloading it when a URL was given."""
    if url:
        path = download_apk(url, progress_callback=on_progress)
        return {"name": os.path.basename(path), "path": path, **metadata(path)}

    apks = list_apks()
    if not apks:
        raise ValueError(
            f"No APK on the backend host. Download one first (it is stored in {APKS_DIR})."
        )
    if not apk:
        raise ValueError("Select an app build: " + ", ".join(a["name"] for a in apks))

    found = next((a for a in apks if a["name"] == apk), None)
    if found is None:
        raise ValueError(f"App build '{apk}' is not on the backend host. Available: "
                         + ", ".join(a["name"] for a in apks))
    if not os.path.isfile(found["path"]):
        raise ValueError(f"App build '{apk}' is listed but missing at {found['path']}")
    return {**found, **metadata(found["path"])}
