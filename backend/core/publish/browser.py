from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
STEALTH_JS_PATH = ROOT / "backend" / "utils" / "assets" / "stealth.min.js"


async def set_init_script(context):
    if STEALTH_JS_PATH.exists() and STEALTH_JS_PATH.is_file():
        await context.add_init_script(path=str(STEALTH_JS_PATH))
    return context


async def launch_chromium(playwright, *, headless: bool = True):
    launch_kwargs: dict[str, object] = {"headless": headless}
    executable_path = os.getenv("PUBLISH_BROWSER_EXECUTABLE_PATH", "").strip()
    browser_channel = os.getenv("PUBLISH_BROWSER_CHANNEL", "").strip()

    if executable_path:
        launch_kwargs["executable_path"] = executable_path
    elif browser_channel:
        launch_kwargs["channel"] = browser_channel

    return await playwright.chromium.launch(**launch_kwargs)
