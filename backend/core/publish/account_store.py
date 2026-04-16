from __future__ import annotations

import json
import re
from pathlib import Path

INVALID_ACCOUNT_NAME_RE = re.compile(r'[<>:"/\\|?*\x00-\x1F]')
MAX_ACCOUNT_NAME_LENGTH = 64

ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT / "backend_data"
COOKIES_DIR = DATA_DIR / "cookies"


def ensure_cookie_dir() -> Path:
    COOKIES_DIR.mkdir(parents=True, exist_ok=True)
    return COOKIES_DIR


def is_account_name_valid(account_name: str) -> bool:
    return bool(account_name) and len(account_name) <= MAX_ACCOUNT_NAME_LENGTH and not INVALID_ACCOUNT_NAME_RE.search(account_name)


def normalize_account_name(account_name: str, fallback: str = "douyin_account") -> str:
    normalized = INVALID_ACCOUNT_NAME_RE.sub("_", str(account_name or "").strip())
    normalized = re.sub(r"\s+", "_", normalized).strip(" .")
    normalized = normalized[:MAX_ACCOUNT_NAME_LENGTH]
    if is_account_name_valid(normalized):
        return normalized

    fallback_name = INVALID_ACCOUNT_NAME_RE.sub("_", fallback).strip(" .")[:MAX_ACCOUNT_NAME_LENGTH] or "douyin_account"
    return fallback_name


def ensure_unique_account_name(platform: str, preferred_name: str, fallback: str = "douyin_account") -> str:
    candidate = normalize_account_name(preferred_name, fallback=fallback)
    cookies_dir = ensure_cookie_dir()
    prefix = f"{platform}_"
    suffix = 2

    while (cookies_dir / f"{prefix}{candidate}.json").exists():
        base = candidate[: max(1, MAX_ACCOUNT_NAME_LENGTH - len(f"_{suffix}"))].rstrip(" .")
        next_candidate = f"{base}_{suffix}"
        if next_candidate == candidate:
            break
        candidate = next_candidate
        suffix += 1

    return candidate


def resolve_account_file(platform: str, account_name: str) -> Path:
    if not is_account_name_valid(account_name):
        raise ValueError("账号名仅支持字母、数字、点、下划线和连字符（1-64 位）")
    cookies_dir = ensure_cookie_dir()
    return cookies_dir / f"{platform}_{account_name}.json"


def list_accounts(platform: str) -> list[str]:
    cookies_dir = ensure_cookie_dir()
    prefix = f"{platform}_"
    accounts: set[str] = set()
    for cookie_file in cookies_dir.glob(f"{platform}_*.json"):
        stem = cookie_file.stem
        if not stem.startswith(prefix):
            continue
        account_name = stem[len(prefix):].strip()
        if is_account_name_valid(account_name):
            accounts.add(account_name)
    return sorted(accounts)


def has_valid_cookie_file(platform: str, account_name: str) -> bool:
    account_file = resolve_account_file(platform, account_name)
    if not account_file.exists() or not account_file.is_file():
        return False
    try:
        data = json.loads(account_file.read_text(encoding="utf-8"))
    except Exception:
        return False
    return isinstance(data, dict)
