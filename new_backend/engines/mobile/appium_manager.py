"""
Appium Manager — owns the Appium server process.

Routes must not spawn Appium themselves; they ask the orchestrator, which asks
the engine, which asks this manager. It keeps using core.state.appium_proc so the
existing /test/appium/* endpoints and this manager always agree on one server.
"""
from __future__ import annotations

import os
import shutil
import socket
import subprocess
import time
from typing import Optional

from new_backend.core import state as core_state
from new_backend.core.logger import logger

DEFAULT_PORT = core_state.APPIUM_PORT
START_TIMEOUT = 45          # seconds Appium may take to bind its port


def server_url(port: int = DEFAULT_PORT) -> str:
    return os.getenv("APPIUM_URL") or f"http://127.0.0.1:{port}"


def port_open(port: int = DEFAULT_PORT, timeout: float = 0.5) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(timeout)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def status(port: int = DEFAULT_PORT) -> dict:
    running = port_open(port)
    owned = core_state.appium_proc is not None and core_state.appium_proc.poll() is None
    return {
        "status": "running" if running else "stopped",
        "port": port,
        "url": server_url(port),
        "managed_by_platform": owned,
        "appium_cli": shutil.which("appium") is not None,
    }


def start(port: int = DEFAULT_PORT, wait: bool = True) -> dict:
    """Start Appium when nothing is listening yet. Idempotent."""
    if port_open(port):
        return {**status(port), "started": False, "message": "Appium was already running"}

    if shutil.which("appium") is None:
        raise RuntimeError("Appium is not installed on the backend host (`npm i -g appium`).")

    core_state.appium_proc = subprocess.Popen(
        ["appium", "-p", str(port)],
        shell=os.name == "nt",
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if wait and not wait_until_ready(port):
        raise RuntimeError(f"Appium did not start listening on port {port} within {START_TIMEOUT}s")
    return {**status(port), "started": True, "message": f"Appium started on port {port}"}


def wait_until_ready(port: int = DEFAULT_PORT, timeout: int = START_TIMEOUT) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if port_open(port):
            return True
        time.sleep(0.5)
    return False


def stop(port: int = DEFAULT_PORT) -> dict:
    """Stop only the server this platform started."""
    proc: Optional[subprocess.Popen] = core_state.appium_proc
    if proc is None:
        return {**status(port), "stopped": False, "message": "Appium was not started by the platform"}
    try:
        if os.name == "nt":
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        else:
            proc.terminate()
            proc.wait(timeout=10)
    except Exception:
        logger.exception("Failed to stop Appium")
        proc.kill()
    finally:
        core_state.appium_proc = None
    return {**status(port), "stopped": True, "message": "Appium stopped"}


def ensure_running(port: int = DEFAULT_PORT) -> dict:
    """What a mobile run needs before it can talk to a device."""
    if port_open(port):
        return {**status(port), "started": False}
    return start(port)
