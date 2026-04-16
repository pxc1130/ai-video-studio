#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Load and render prompt templates from YAML files."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None  # type: ignore


ROOT = Path(__file__).resolve().parent.parent
PROMPTS_DIR = ROOT / "prompts"


def _load_yaml(path: Path) -> dict[str, Any]:
    if yaml is None:
        raise RuntimeError("PyYAML is required to load prompt templates. Install it via: pip install pyyaml")
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _simple_render(template: str, context: dict[str, Any]) -> str:
    """Ultra-simple Jinja-like renderer without external deps."""
    result = template
    for key, value in context.items():
        placeholder = "{{ " + key + " }}"
        if isinstance(value, str):
            result = result.replace(placeholder, value)
        else:
            result = result.replace(placeholder, json.dumps(value, ensure_ascii=False))
    # Handle {% if key %}...{% endif %} blocks for booleans/strings
    import re

    for key, value in context.items():
        # Simple truthy blocks
        pattern = rf"{{%\s*if\s+{key}\s*%}}(.*?){{%\s*endif\s*%}}"
        if value:
            result = re.sub(pattern, r"\1", result, flags=re.DOTALL)
        else:
            result = re.sub(pattern, "", result, flags=re.DOTALL)
    # Clean up leftover template tags that were not matched by if-blocks
    result = re.sub(r"{%\s*if\s+\w+\s*%}.*?{%\s*endif\s*%}", "", result, flags=re.DOTALL)
    return result.strip()


def load_planning_prompt(name: str = "tiktok_us_ecommerce", category: str = "default", context: dict[str, Any] | None = None) -> dict[str, str]:
    """Load a planning prompt template and render it with context."""
    path = PROMPTS_DIR / "planning" / f"{name}.yaml"
    if not path.exists():
        path = PROMPTS_DIR / "planning" / "tiktok_us_ecommerce.yaml"
    data = _load_yaml(path)

    ctx = context or {}
    category_briefs = data.get("category_briefs", {})
    ctx["category_brief"] = category_briefs.get(category, category_briefs.get("default", ""))

    return {
        "system_prompt": _simple_render(data.get("system_prompt", ""), ctx),
        "user_prompt": _simple_render(data.get("user_payload_template", ""), ctx),
    }


def load_copy_prompt(name: str = "tiktok_us_influencer", context: dict[str, Any] | None = None) -> dict[str, str]:
    """Load a copy/voiceover prompt template and render it with context."""
    path = PROMPTS_DIR / "copy" / f"{name}.yaml"
    if not path.exists():
        path = PROMPTS_DIR / "copy" / "tiktok_us_influencer.yaml"
    data = _load_yaml(path)
    ctx = context or {}
    return {
        "system_prompt": _simple_render(data.get("system_prompt", ""), ctx),
        "user_prompt": _simple_render(data.get("user_payload_template", ""), ctx),
    }


def list_available_prompts() -> dict[str, list[str]]:
    """List available prompt templates by category."""
    result: dict[str, list[str]] = {"planning": [], "copy": []}
    for subdir, key in [("planning", "planning"), ("copy", "copy")]:
        d = PROMPTS_DIR / subdir
        if d.exists():
            result[key] = [p.stem for p in d.glob("*.yaml")]
    return result
