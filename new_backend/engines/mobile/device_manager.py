"""
Device Manager — the Android devices adb really reports.

It wraps the platform's existing adb discovery (modules/platform_hub) instead of
shelling out a second time, and adds what an execution needs: validation of the
device the user picked and the capabilities that go to Appium.
"""
from __future__ import annotations

from typing import List, Optional

from new_backend.modules.platform_hub.service import list_devices


def discover(details: bool = True) -> dict:
    """{adb_available, devices:[…]} with a UI-friendly status per device."""
    raw = list_devices(details=details)
    devices = []
    for device in raw["devices"]:
        devices.append({
            "udid": device["serial"],
            "name": device["model"] or device["serial"],
            "platform": "Android",
            "platform_version": device["android_version"],
            "manufacturer": device["manufacturer"],
            "kind": device["kind"],                     # emulator | physical
            "adb_state": device["state"],
            "status": "available" if device["state"] == "device" else device["state"],
        })
    return {"adb_available": raw["adb_available"], "devices": devices}


def available() -> List[dict]:
    return [d for d in discover()["devices"] if d["status"] == "available"]


def resolve(udid: Optional[str]) -> dict:
    """Validate the selected device, or pick the only available one."""
    state = discover()
    if not state["adb_available"]:
        raise ValueError("adb is not on the backend host's PATH — install Android platform-tools.")

    devices = state["devices"]
    if not devices:
        raise ValueError("No Android device is connected. Start an emulator or plug in a device.")

    if not udid:
        usable = [d for d in devices if d["status"] == "available"]
        if len(usable) != 1:
            raise ValueError(
                "Select a device: " + ", ".join(f"{d['name']} ({d['udid']})" for d in devices)
            )
        return usable[0]

    device = next((d for d in devices if d["udid"] == udid), None)
    if device is None:
        raise ValueError(
            f"Device '{udid}' is not connected. Connected: "
            + (", ".join(d["udid"] for d in devices) or "none")
        )
    if device["status"] != "available":
        raise ValueError(f"Device '{udid}' is {device['status']} — it cannot run tests right now.")
    return device


def capabilities(device: dict) -> dict:
    """Appium capabilities for this device; the suite consumes them via env vars."""
    caps = {
        "platformName": "Android",
        "appium:automationName": "UiAutomator2",
        "appium:udid": device["udid"],
        "appium:deviceName": device["name"],
    }
    if device.get("platform_version"):
        caps["appium:platformVersion"] = device["platform_version"]
    return caps
