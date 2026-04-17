#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lightweight FastAPI backend for ai-video-studio. Supports mock mode for local development."""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

# Allow absolute imports when running this file directly
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from backend.core.creative_plan_builder import (
    call_model as call_planning_model,
    normalize_pack,
    select_images,
)
from backend.core.tts_voiceover_builder import (
    build_script_with_model,
    synthesize_tts_dashscope,
    download_file as tts_download_file,
)
from backend.core.mock_client import MockTTSClient
from backend.utils.csv_importer import import_single_product
from backend.core.batch_queue import BatchQueue, parse_spreadsheet_and_match_images, create_zip_for_batch
from backend.core.batch_worker import start_worker
from backend.core.publish.account_store import (
    ensure_unique_account_name,
    is_account_name_valid,
    list_accounts as list_native_publish_accounts,
    normalize_account_name,
    resolve_account_file,
)
from backend.core.publish.douyin import (
    DouyinVideoUploadRequest,
    douyin_setup,
    runtime_check as douyin_runtime_check,
    upload_video as upload_douyin_video,
)

try:
    from backend.core.wan_batch_generate import submit_job, poll_job
except Exception:
    submit_job = None  # type: ignore
    poll_job = None  # type: ignore

# ---------------------------------------------------------------------------
# Mode configuration
# ---------------------------------------------------------------------------
MOCK_MODE = os.getenv("MOCK_MODE", "true").lower() in ("1", "true", "yes")
DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "")
QWEN_PLAN_MODEL = os.getenv("QWEN_PLAN_MODEL", "qwen3.5-flash")
QWEN_COPY_MODEL = os.getenv("QWEN_COPY_MODEL", "qwen3.5-flash")
WAN_MODEL = os.getenv("WAN_MODEL", "wan2.6-i2v-flash")
WAN_RESOLUTION = os.getenv("WAN_RESOLUTION", "720P")
WAN_RENDER_LIMIT = int(os.getenv("WAN_RENDER_LIMIT", "0"))  # 0 = all scenes
MOCK_VIDEO_SOURCE_RAW = os.getenv("MOCK_VIDEO_SOURCE", "").strip()
DEFAULT_MOCK_VIDEO_SOURCE = Path(r"D:\ai-workflow\微信视频2026-04-16_194935_072.mp4")

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "backend_data"
RUNS_DIR = DATA_DIR / "runs"
UPLOADS_DIR = DATA_DIR / "uploads"

PUBLISH_MODE = os.getenv("PUBLISH_MODE", "native_internal").strip().lower()
PUBLISH_HEADLESS = os.getenv("PUBLISH_HEADLESS", "false").lower() in ("1", "true", "yes")
PUBLISH_TASK_MAX_ENTRIES = int(os.getenv("PUBLISH_TASK_MAX_ENTRIES", "200"))
PUBLISH_LOGIN_SESSION_MAX_ENTRIES = int(os.getenv("PUBLISH_LOGIN_SESSION_MAX_ENTRIES", "100"))
PUBLISH_LOGIN_FORCE_SCAN = os.getenv("PUBLISH_LOGIN_FORCE_SCAN", "true").lower() in ("1", "true", "yes")
PUBLISH_LOGIN_KEEP_BROWSER_OPEN_SECONDS = int(os.getenv("PUBLISH_LOGIN_KEEP_BROWSER_OPEN_SECONDS", "20"))
PUBLISH_LOGIN_POLL_INTERVAL_SECONDS = float(os.getenv("PUBLISH_LOGIN_POLL_INTERVAL_SECONDS", "2"))
PUBLISH_LOGIN_MAX_CHECKS = int(os.getenv("PUBLISH_LOGIN_MAX_CHECKS", "180"))
AUTO_PUBLISH_DOUYIN_AFTER_ASSEMBLE = os.getenv("AUTO_PUBLISH_DOUYIN_AFTER_ASSEMBLE", "false").lower() in ("1", "true", "yes")
AUTO_PUBLISH_DOUYIN_ACCOUNT = os.getenv("AUTO_PUBLISH_DOUYIN_ACCOUNT", "").strip()
AUTO_PUBLISH_DOUYIN_TAGS_RAW = os.getenv("AUTO_PUBLISH_DOUYIN_TAGS", "")
AUTO_PUBLISH_DOUYIN_TITLE_PREFIX = os.getenv("AUTO_PUBLISH_DOUYIN_TITLE_PREFIX", "")

for d in (DATA_DIR, RUNS_DIR, UPLOADS_DIR):
    d.mkdir(parents=True, exist_ok=True)

# Global in-memory run state (sufficient for single-user local dev)
CURRENT_RUN: dict[str, Any] = {
    "run_id": "",
    "status": "idle",
    "product_dir": "",
    "plan_path": "",
    "renders_dir": "",
    "deliverables_dir": "",
    "logs": [],
}

PUBLISH_TASKS: dict[str, dict[str, Any]] = {}
PUBLISH_TASKS_LOCK = threading.Lock()
PUBLISH_LOGIN_SESSIONS: dict[str, dict[str, Any]] = {}
PUBLISH_LOGIN_SESSIONS_LOCK = threading.Lock()

app = FastAPI(title="ai-video-studio backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def log(step: str, detail: str = "") -> None:
    CURRENT_RUN["logs"].append({"time": now_iso(), "step": step, "detail": detail})


def reset_run() -> None:
    run_id = uuid.uuid4().hex[:12]
    CURRENT_RUN.update(
        {
            "run_id": run_id,
            "status": "idle",
            "product_dir": "",
            "plan_path": "",
            "renders_dir": "",
            "deliverables_dir": "",
            "logs": [{"time": now_iso(), "step": "run_created", "detail": run_id}],
        }
    )


def ensure_run_dirs() -> dict[str, Path]:
    if not CURRENT_RUN["run_id"]:
        reset_run()
    run_dir = RUNS_DIR / CURRENT_RUN["run_id"]
    dirs = {
        "run_dir": run_dir,
        "plan_dir": run_dir / "plan",
        "renders_dir": run_dir / "renders",
        "deliverables_dir": run_dir / "deliverables",
    }
    for p in dirs.values():
        p.mkdir(parents=True, exist_ok=True)
    CURRENT_RUN["renders_dir"] = str(dirs["renders_dir"])
    CURRENT_RUN["deliverables_dir"] = str(dirs["deliverables_dir"])
    return dirs


def load_plan() -> dict[str, Any]:
    path = Path(CURRENT_RUN["plan_path"]) if CURRENT_RUN["plan_path"] else None
    if path and path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}


class DouyinPublishRequest(BaseModel):
    run_id: str
    account_name: str
    title: str
    desc: str = ""
    tags: list[str] = Field(default_factory=list)


class DouyinLoginStartRequest(BaseModel):
    account_name: str = ""
    headless: bool | None = None
    force_scan: bool | None = None
    keep_browser_open_seconds: int | None = None


def _is_publish_enabled() -> bool:
    if PUBLISH_MODE != "native_internal":
        return False
    available, _ = douyin_runtime_check()
    return available


def _publish_disabled_hint() -> str:
    if PUBLISH_MODE != "native_internal":
        return "当前仅支持 PUBLISH_MODE=native_internal。"
    _, reason = douyin_runtime_check()
    return reason or "发布功能不可用"


def _discover_publish_accounts(platform: str) -> list[str]:
    if platform != "douyin":
        return []
    return list_native_publish_accounts("douyin")


def _resolve_run_dir(run_id: str) -> Path | None:
    candidates = [RUNS_DIR / run_id] + list(RUNS_DIR.glob(f"{run_id}_*"))
    for c in candidates:
        if c.exists() and c.is_dir():
            return c
    return None


def _resolve_publish_video(run_dir: Path) -> Path | None:
    preferred = run_dir / "deliverables" / "final_with_voice.mp4"
    if preferred.exists() and preferred.is_file():
        return preferred

    deliverables_dir = run_dir / "deliverables"
    if not deliverables_dir.exists() or not deliverables_dir.is_dir():
        return None

    candidates = sorted(deliverables_dir.glob("*.mp4"))
    for p in candidates:
        if p.name == "final_silent.mp4":
            continue
        return p
    return candidates[0] if candidates else None


def _resolve_publish_video_with_source(run_dir: Path, *, allow_mock_fallback: bool = False) -> tuple[Path | None, str | None]:
    video_path = _resolve_publish_video(run_dir)
    if video_path:
        return video_path, "manual_run_artifact"

    if allow_mock_fallback and MOCK_MODE:
        mock_video = _mock_video_source()
        if mock_video:
            return mock_video, "manual_mock_fallback"

    return None, None


def _sanitize_tags(tags: list[str]) -> list[str]:
    normalized: list[str] = []
    for raw in tags:
        clean = raw.strip().lstrip("#")
        if clean and clean not in normalized:
            normalized.append(clean)
    return normalized[:20]


def _resolve_publish_video_safe(video_path: Path) -> Path:
    resolved_video = video_path.resolve()
    runs_root = RUNS_DIR.resolve()
    if not resolved_video.exists() or not resolved_video.is_file():
        raise RuntimeError("未找到可发布视频文件")
    if not str(resolved_video).startswith(str(runs_root)):
        raise RuntimeError("可发布视频必须位于 backend_data/runs 目录内")
    return resolved_video


def _read_voice_script(deliverables_dir: Path) -> str:
    voiceover_json = deliverables_dir / "voiceover.json"
    if not voiceover_json.exists():
        return ""
    try:
        data = json.loads(voiceover_json.read_text(encoding="utf-8"))
    except Exception:
        return ""
    script = str(data.get("script", "") or "").strip()
    return script[:2000]


def _path_str_or_none(path: Path | None) -> str | None:
    if not path:
        return None
    return str(path)


def _mock_fallback_plan() -> dict[str, Any]:
    return {
        "product": {
            "title": "Mock 演示视频",
        },
        "video_style": {
            "duration_seconds": 4,
            "style_tags": ["mock", "demo"],
        },
        "creative_direction": {
            "audience": "演示预览",
            "hook": "使用本地视频直接替代生成结果",
            "cta": "发布到抖音",
        },
        "material_analysis": {
            "subject_summary": "当前使用本地演示视频作为成片来源，便于验证发布流程。",
        },
        "scenes": [
            {
                "scene_id": "mock_scene_01",
                "reference_image": "",
                "duration_seconds": 4,
                "shot_goal": "本地演示视频替代生成结果",
                "camera_language": "mock",
                "wan_prompt": "mock local source video",
                "negative_prompt": "",
                "overlay_text": {
                    "headline": "Mock Preview",
                    "subline": "Local source video",
                    "price_tag": "",
                },
                "energy": "demo",
            }
        ],
    }


def _derive_auto_publish_title(run_id: str, plan: dict[str, Any]) -> str:
    base_title = str(plan.get("product", {}).get("title", "") or "").strip()
    if not base_title:
        base_title = f"AI视频成片 {run_id}"
    if AUTO_PUBLISH_DOUYIN_TITLE_PREFIX:
        return f"{AUTO_PUBLISH_DOUYIN_TITLE_PREFIX}{base_title}"
    return base_title


def _derive_auto_publish_tags(plan: dict[str, Any]) -> list[str]:
    tags: list[str] = []
    style_tags = plan.get("video_style", {}).get("style_tags", [])
    if isinstance(style_tags, list):
        tags.extend([str(t) for t in style_tags])
    if AUTO_PUBLISH_DOUYIN_TAGS_RAW:
        tags.extend(AUTO_PUBLISH_DOUYIN_TAGS_RAW.split(","))
    return _sanitize_tags(tags)


def _ffmpeg_executable() -> str:
    local_app_data = os.getenv("LOCALAPPDATA", "")
    if local_app_data:
        candidate = Path(local_app_data) / "ms-playwright" / "ffmpeg-1011" / "ffmpeg-win64.exe"
        if candidate.exists() and candidate.is_file():
            return str(candidate)
    try:
        import imageio_ffmpeg

        executable = imageio_ffmpeg.get_ffmpeg_exe()
        if executable:
            return executable
    except Exception:
        pass
    return "ffmpeg"


def _mock_video_source() -> Path | None:
    if not MOCK_VIDEO_SOURCE_RAW:
        if DEFAULT_MOCK_VIDEO_SOURCE.exists() and DEFAULT_MOCK_VIDEO_SOURCE.is_file():
            return DEFAULT_MOCK_VIDEO_SOURCE
        return None
    source = Path(MOCK_VIDEO_SOURCE_RAW).expanduser()
    if source.exists() and source.is_file():
        return source
    return None


def _write_mock_video(path: Path, duration: float = 4.0) -> None:
    source = _mock_video_source()
    path.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg = _ffmpeg_executable()

    if source:
        subprocess.run(
            [
                ffmpeg,
                "-y",
                "-stream_loop",
                "-1",
                "-i",
                str(source),
                "-t",
                str(duration),
                "-vf",
                "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black",
                "-an",
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-pix_fmt",
                "yuv420p",
                str(path),
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        return

    subprocess.run(
        [
            ffmpeg,
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"color=c=black:s=720x1280:d={duration}",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=44100:cl=mono",
            "-shortest",
            "-pix_fmt",
            "yuv420p",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            str(path),
        ],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def _get_publish_task(task_id: str) -> dict[str, Any] | None:
    with PUBLISH_TASKS_LOCK:
        task = PUBLISH_TASKS.get(task_id)
        return dict(task) if task else None


def _list_publish_tasks_for_run(run_id: str) -> list[dict[str, Any]]:
    with PUBLISH_TASKS_LOCK:
        tasks = [dict(task) for task in PUBLISH_TASKS.values() if task.get("run_id") == run_id]
    tasks.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return tasks


def _update_publish_task(task_id: str, **fields: Any) -> None:
    with PUBLISH_TASKS_LOCK:
        if task_id in PUBLISH_TASKS:
            PUBLISH_TASKS[task_id].update(fields)


def _create_publish_task(task: dict[str, Any]) -> None:
    with PUBLISH_TASKS_LOCK:
        PUBLISH_TASKS[task["id"]] = task
        if len(PUBLISH_TASKS) > PUBLISH_TASK_MAX_ENTRIES:
            # Keep memory bounded: drop oldest completed tasks first.
            sorted_tasks = sorted(PUBLISH_TASKS.values(), key=lambda x: x.get("created_at", ""))
            removable = [t for t in sorted_tasks if t.get("status") in ("succeeded", "failed")]
            for t in removable:
                if len(PUBLISH_TASKS) <= PUBLISH_TASK_MAX_ENTRIES:
                    break
                PUBLISH_TASKS.pop(t["id"], None)


def _create_login_session(session: dict[str, Any]) -> None:
    with PUBLISH_LOGIN_SESSIONS_LOCK:
        PUBLISH_LOGIN_SESSIONS[session["id"]] = session
        if len(PUBLISH_LOGIN_SESSIONS) > PUBLISH_LOGIN_SESSION_MAX_ENTRIES:
            sorted_sessions = sorted(PUBLISH_LOGIN_SESSIONS.values(), key=lambda x: x.get("created_at", ""))
            for s in sorted_sessions:
                if len(PUBLISH_LOGIN_SESSIONS) <= PUBLISH_LOGIN_SESSION_MAX_ENTRIES:
                    break
                if s.get("status") in ("succeeded", "failed"):
                    PUBLISH_LOGIN_SESSIONS.pop(s["id"], None)


def _get_login_session(session_id: str) -> dict[str, Any] | None:
    with PUBLISH_LOGIN_SESSIONS_LOCK:
        session = PUBLISH_LOGIN_SESSIONS.get(session_id)
        return dict(session) if session else None


def _update_login_session(session_id: str, **fields: Any) -> None:
    with PUBLISH_LOGIN_SESSIONS_LOCK:
        if session_id in PUBLISH_LOGIN_SESSIONS:
            PUBLISH_LOGIN_SESSIONS[session_id].update(fields)


def _start_douyin_publish_task(
    *,
    run_id: str,
    account_name: str,
    title: str,
    desc: str,
    tags: list[str],
    video_path: Path,
    source: str,
) -> dict[str, Any]:
    if source == "manual_mock_fallback":
        safe_video_path = video_path.resolve()
        if not safe_video_path.exists() or not safe_video_path.is_file():
            raise RuntimeError("鏈壘鍒板彲鍙戝竷瑙嗛鏂囦欢")
    else:
        safe_video_path = _resolve_publish_video_safe(video_path)
    task_id = uuid.uuid4().hex[:12]
    task = {
        "id": task_id,
        "platform": "douyin",
        "status": "pending",
        "run_id": run_id,
        "account_name": account_name,
        "title": title,
        "desc": desc[:2000],
        "tags": _sanitize_tags(tags),
        "video_path": str(safe_video_path),
        "source": source,
        "message": "任务已创建，等待执行",
        "created_at": now_iso(),
        "started_at": None,
        "finished_at": None,
        "exit_code": None,
        "stdout": "",
        "stderr": "",
        "command": [],
    }
    _create_publish_task(task)

    if CURRENT_RUN["run_id"] == run_id:
        log("publish_douyin_start", f"task={task_id},source={source},account={account_name}")

    thread = threading.Thread(target=_run_douyin_publish_task, args=(task_id,), daemon=True)
    thread.start()
    return task


def _run_douyin_publish_task(task_id: str) -> None:
    task = _get_publish_task(task_id)
    if not task:
        return

    _update_publish_task(task_id, status="running", started_at=now_iso(), message="正在提交抖音发布任务")

    try:
        if not _is_publish_enabled():
            raise RuntimeError(_publish_disabled_hint())

        command = ["native_internal", "douyin.upload_video"]
        _update_publish_task(task_id, command=command)

        request = DouyinVideoUploadRequest(
            account_name=task["account_name"],
            video_file=Path(task["video_path"]),
            title=task["title"],
            description=task["desc"],
            tags=task["tags"],
            headless=PUBLISH_HEADLESS,
        )
        asyncio.run(upload_douyin_video(request))

        _update_publish_task(
            task_id,
            status="succeeded",
            message="已提交到抖音，请在创作者中心确认审核状态",
            finished_at=now_iso(),
            exit_code=0,
            stdout="",
            stderr="",
        )
        if CURRENT_RUN["run_id"] == task["run_id"]:
            log("publish_douyin_done", f"task={task_id}")

    except Exception as exc:
        _update_publish_task(
            task_id,
            status="failed",
            message=str(exc) or "发布失败",
            finished_at=now_iso(),
            exit_code=-1,
            stderr=str(exc),
        )
        if CURRENT_RUN["run_id"] == task.get("run_id"):
            log("publish_douyin_failed", str(exc))


def _run_douyin_login_session(
    session_id: str,
    account_name: str,
    headless: bool,
    force_scan: bool,
    keep_browser_open_seconds: int,
) -> None:
    session = _get_login_session(session_id)
    if not session:
        return

    provisional_account_name = normalize_account_name(account_name, fallback="douyin_default")
    account_file = resolve_account_file("douyin", provisional_account_name)
    _update_login_session(
        session_id,
        status="initializing",
        message="正在打开抖音登录窗口，请稍候",
        updated_at=now_iso(),
        account_file=str(account_file),
    )

    def _qrcode_callback(payload: dict[str, Any]) -> None:
        _update_login_session(
            session_id,
            status="waiting_scan",
            message="请使用抖音 App 扫码登录",
            qrcode=payload,
            updated_at=now_iso(),
        )

    try:
        result = asyncio.run(
            douyin_setup(
                str(account_file),
                handle=True,
                return_detail=True,
                qrcode_callback=_qrcode_callback,
                headless=headless,
                force_scan=force_scan,
                keep_browser_open_seconds=keep_browser_open_seconds,
                login_poll_interval=max(0.8, PUBLISH_LOGIN_POLL_INTERVAL_SECONDS),
                login_max_checks=max(30, PUBLISH_LOGIN_MAX_CHECKS),
            )
        )
        if result.get("success"):
            resolved_account_name = normalize_account_name(
                result.get("account_name") or provisional_account_name,
                fallback=provisional_account_name,
            )
            final_account_name = resolved_account_name
            final_account_file = resolve_account_file("douyin", final_account_name)
            if final_account_file != account_file:
                if final_account_file.exists():
                    final_account_name = ensure_unique_account_name("douyin", resolved_account_name, fallback=provisional_account_name)
                    final_account_file = resolve_account_file("douyin", final_account_name)
                if account_file.exists():
                    account_file.replace(final_account_file)
            _update_login_session(
                session_id,
                account_name=final_account_name,
                status="succeeded",
                message=result.get("message") or "登录成功",
                updated_at=now_iso(),
                qrcode=result.get("qrcode") or session.get("qrcode"),
                account_file=str(final_account_file),
            )
        else:
            _update_login_session(
                session_id,
                status="failed",
                message=result.get("message") or "登录失败",
                updated_at=now_iso(),
                qrcode=result.get("qrcode") or session.get("qrcode"),
            )
    except Exception as exc:
        _update_login_session(
            session_id,
            status="failed",
            message=str(exc),
            updated_at=now_iso(),
        )


def _parse_description_file(file: UploadFile) -> tuple[str, str]:
    """Read and normalize a product description file (.txt / .json / .md)."""
    content = file.file.read().decode("utf-8", errors="ignore")
    ext = (Path(file.filename or "unknown.txt").suffix or ".txt").lower()
    if ext == ".json":
        try:
            data = json.loads(content)
            # If it's a Taobao-style meta.json, try to extract a readable summary
            if isinstance(data, dict):
                item = data.get("item") or data
                parts = []
                for key in ("title", "desc_short", "desc", "props", "sales"):
                    val = item.get(key) if isinstance(item, dict) else data.get(key)
                    if val:
                        if key == "props" and isinstance(val, list):
                            parts.append("Properties:\n" + "\n".join(f"- {p.get('name','')}: {p.get('value','')}" for p in val if isinstance(p, dict)))
                        else:
                            parts.append(f"{key}: {val}")
                return "\n\n".join(parts), "json"
        except Exception:
            pass
        return content, "json"
    return content, ext.lstrip(".")


def auto_read_product_description(folder: Path) -> dict[str, Any]:
    """Reserved interface: auto-read product description from a folder containing meta.json / summary.json / description.txt."""
    result: dict[str, Any] = {"found": False, "source": None, "title": "", "description_text": "", "extra": {}}
    if not folder.exists() or not folder.is_dir():
        return result

    # Priority: description.txt > summary.json > meta.json
    desc_txt = folder / "description.txt"
    if desc_txt.exists():
        result["found"] = True
        result["source"] = "description.txt"
        result["description_text"] = desc_txt.read_text(encoding="utf-8", errors="ignore")
        return result

    summary_json = folder / "summary.json"
    if summary_json.exists():
        try:
            data = json.loads(summary_json.read_text(encoding="utf-8"))
            result["found"] = True
            result["source"] = "summary.json"
            result["title"] = data.get("title", "")
            result["description_text"] = json.dumps(data, ensure_ascii=False, indent=2)
            result["extra"] = {k: v for k, v in data.items() if k not in ("title",)}
            return result
        except Exception:
            pass

    meta_json = folder / "meta.json"
    if meta_json.exists():
        try:
            data = json.loads(meta_json.read_text(encoding="utf-8"))
            item = data.get("item", data)
            parts = []
            for key in ("title", "desc_short", "desc", "price", "orginal_price", "sales", "brand", "location"):
                val = item.get(key) if isinstance(item, dict) else data.get(key)
                if val:
                    parts.append(f"{key}: {val}")
            props = item.get("props") if isinstance(item, dict) else data.get("props")
            if isinstance(props, list):
                parts.append("Properties:\n" + "\n".join(f"- {p.get('name','')}: {p.get('value','')}" for p in props if isinstance(p, dict)))
            result["found"] = True
            result["source"] = "meta.json"
            result["title"] = item.get("title", "") if isinstance(item, dict) else data.get("title", "")
            result["description_text"] = "\n\n".join(parts)
            result["extra"] = data
            return result
        except Exception:
            pass

    return result


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "mock_mode": "true" if MOCK_MODE else "false",
        "mock_video_source": _path_str_or_none(_mock_video_source()) if MOCK_MODE else None,
        "model": QWEN_PLAN_MODEL,
    }


@app.get("/api/mock-video-source", response_model=None)
def mock_video_source():
    if not MOCK_MODE:
        return JSONResponse({"detail": "Mock 模式未启用"}, status_code=404)

    source = _mock_video_source()
    if not source:
        return JSONResponse({"detail": "Mock 视频源不存在"}, status_code=404)

    return FileResponse(str(source))


@app.post("/api/products/import")
async def import_product(
    productName: str = Form(...),
    price: str = Form(""),
    category: str = Form("default"),
    scriptTemplate: str = Form(""),
    images: list[UploadFile] = File(default_factory=list),
    descriptionFile: UploadFile | None = File(None),
) -> JSONResponse:
    if not productName or not productName.strip():
        return JSONResponse({"status": "error", "message": "商品名称为空，请填写或上传包含商品信息的 JSON 文件。为避免浪费 AI 生成额度，必填项必须完整。"}, status_code=400)
    reset_run()
    upload_session = UPLOADS_DIR / CURRENT_RUN["run_id"]
    upload_session.mkdir(parents=True, exist_ok=True)

    for img in images:
        if img.filename:
            dest = upload_session / Path(img.filename).name
            with dest.open("wb") as f:
                f.write(await img.read())

    extra_meta: dict[str, Any] = {}
    if descriptionFile and descriptionFile.filename:
        desc_text, desc_format = _parse_description_file(descriptionFile)
        extra_meta["description_text"] = desc_text
        extra_meta["description_format"] = desc_format

    product_dir = import_single_product(
        product_id=CURRENT_RUN["run_id"],
        title=productName,
        price=price,
        images_dir=upload_session,
        output_base_dir=RUNS_DIR,
        category=category,
        script_template=scriptTemplate,
        extra_meta=extra_meta,
    )
    CURRENT_RUN["product_dir"] = str(product_dir)
    CURRENT_RUN["status"] = "uploaded"
    log("import", str(product_dir))
    return JSONResponse({"status": "ok", "run_id": CURRENT_RUN["run_id"], "product_dir": str(product_dir)})


@app.get("/api/products/detect-description")
def detect_description(folder_path: str) -> JSONResponse:
    """Reserved interface: auto-detect and extract product description from a local folder."""
    result = auto_read_product_description(Path(folder_path).expanduser())
    return JSONResponse({"status": "ok", "result": result})


@app.post("/api/pipeline/plan")
def pipeline_plan(
    scene_count: int = 3,
    scene_duration: int | None = None,
    prompt_name: str = "tiktok_us_ecommerce",
    category: str = "",
    system_instruction: str = "",
    run_feedback: str = "",
) -> JSONResponse:
    dirs = ensure_run_dirs()
    product_dir = Path(CURRENT_RUN["product_dir"])
    meta_path = product_dir / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
    actual_category = category or meta.get("category", "default")
    script_template = meta.get("script_template", "")
    images = select_images(product_dir, max_images=8)

    CURRENT_RUN["status"] = "planning"
    log("planning_start")

    if MOCK_MODE:
        raw = call_planning_model(
            meta=meta,
            images=images,
            model="mock",
            api_key="mock",
            scene_count=scene_count,
            prompt_name=prompt_name,
            category=actual_category,
            system_instruction=system_instruction,
            run_feedback=run_feedback,
            script_template=script_template,
            use_mock=True,
        )
    else:
        if not DASHSCOPE_API_KEY:
            return JSONResponse({"status": "error", "message": "真实模式需要设置 DASHSCOPE_API_KEY 环境变量"}, status_code=500)
        raw = call_planning_model(
            meta=meta,
            images=images,
            model=QWEN_PLAN_MODEL,
            api_key=DASHSCOPE_API_KEY,
            scene_count=scene_count,
            prompt_name=prompt_name,
            category=actual_category,
            system_instruction=system_instruction,
            run_feedback=run_feedback,
            script_template=script_template,
            use_mock=False,
        )
    pack = normalize_pack(raw, meta, images, scene_count)
    if scene_duration is not None:
        for scene in pack.get("scenes", []):
            scene["duration_seconds"] = scene_duration
        if pack.get("video_style"):
            pack["video_style"]["duration_seconds"] = scene_duration * len(pack.get("scenes", []))

    plan_path = dirs["plan_dir"] / "creative_plan.json"
    plan_path.write_text(json.dumps(pack, ensure_ascii=False, indent=2), encoding="utf-8")
    CURRENT_RUN["plan_path"] = str(plan_path)
    CURRENT_RUN["status"] = "planned"
    log("planning_done", str(plan_path))
    return JSONResponse({"status": "ok", "plan": pack, "run_id": CURRENT_RUN["run_id"]})


@app.get("/api/run/current")
def get_current_run() -> JSONResponse:
    plan = load_plan()
    return JSONResponse(
        {
            "run_id": CURRENT_RUN["run_id"],
            "status": CURRENT_RUN["status"],
            "product_dir": CURRENT_RUN["product_dir"],
            "plan": plan,
            "logs": CURRENT_RUN["logs"],
        }
    )


@app.post("/api/pipeline/render-scenes/start")
def pipeline_start_render_scenes() -> JSONResponse:
    plan = load_plan()
    if not plan:
        if not MOCK_MODE:
            return JSONResponse({"status": "error", "message": "No plan available"}, status_code=400)
        plan = _mock_fallback_plan()
        if not CURRENT_RUN["plan_path"]:
            dirs = ensure_run_dirs()
            plan_path = dirs["plan_dir"] / "creative_plan.json"
            plan_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
            CURRENT_RUN["plan_path"] = str(plan_path)

    dirs = ensure_run_dirs()
    CURRENT_RUN["status"] = "rendering_scenes"
    log("render_scenes_start")

    scenes = plan.get("scenes", [])
    records = []
    mock_source_video = _mock_video_source()

    # Plan A: always mock video render regardless of MOCK_MODE to save API costs
    # while planning and TTS can run in real mode.
    if True:
        if not scenes:
            scenes = _mock_fallback_plan()["scenes"]
        for scene in scenes:
            record = {
                "scene_id": scene["scene_id"],
                "status": "SUCCEEDED",
                "mock": True,
                "message": "Video generation simulated (mock mode).",
            }
            placeholder_path = dirs["renders_dir"] / f"{scene['scene_id']}_wan.mp4"
            if mock_source_video:
                shutil.copyfile(mock_source_video, placeholder_path)
            else:
                _write_mock_video(placeholder_path, duration=scene.get("duration_seconds", 4))
            record["local_video"] = str(placeholder_path)
            records.append(record)
    else:
        if not DASHSCOPE_API_KEY:
            return JSONResponse({"status": "error", "message": "真实模式需要设置 DASHSCOPE_API_KEY 环境变量"}, status_code=500)
        if submit_job is None or poll_job is None:
            return JSONResponse({"status": "error", "message": "wan_batch_generate 模块加载失败"}, status_code=500)

        product_dir = Path(CURRENT_RUN["product_dir"])
        limit = WAN_RENDER_LIMIT or len(scenes)
        for scene in scenes[:limit]:
            image_path = product_dir / scene["reference_image"]
            if not image_path.exists():
                records.append({
                    "scene_id": scene["scene_id"],
                    "status": "FAILED",
                    "message": f"Reference image not found: {scene['reference_image']}",
                })
                continue

            try:
                submit_data = submit_job(
                    api_key=DASHSCOPE_API_KEY,
                    model=WAN_MODEL,
                    prompt=scene["wan_prompt"],
                    image_path=image_path,
                    resolution=WAN_RESOLUTION,
                    duration=int(scene.get("duration_seconds", 5)),
                    seed=-1,
                )
                task_id = submit_data["output"]["task_id"]
                poll_data = poll_job(DASHSCOPE_API_KEY, task_id, interval=15, max_wait=900)
                record = {
                    "scene_id": scene["scene_id"],
                    "status": poll_data.get("output", {}).get("task_status", "UNKNOWN"),
                    "submit": submit_data,
                    "result": poll_data,
                }
                if record["status"] == "SUCCEEDED":
                    import urllib.request
                    video_url = poll_data["output"]["video_url"]
                    local_path = dirs["renders_dir"] / f"{scene['scene_id']}_wan.mp4"
                    urllib.request.urlretrieve(video_url, local_path)
                    record["local_video"] = str(local_path)
                records.append(record)
            except Exception as exc:
                records.append({
                    "scene_id": scene["scene_id"],
                    "status": "FAILED",
                    "message": str(exc),
                })

        # For any scene beyond the limit, write placeholder so assemble doesn't break
        for scene in scenes[limit:]:
            placeholder_path = dirs["renders_dir"] / f"{scene['scene_id']}_wan.mp4"
            _write_mock_video(placeholder_path, duration=scene.get("duration_seconds", 4))
            records.append({
                "scene_id": scene["scene_id"],
                "status": "SKIPPED",
                "mock": True,
                "message": "Skipped in real mode due to WAN_RENDER_LIMIT.",
                "local_video": str(placeholder_path),
            })

    (dirs["renders_dir"] / "wan_batch_results.json").write_text(
        json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    CURRENT_RUN["status"] = "scenes_done"
    log("render_scenes_done", f"{len(records)} scenes")
    return JSONResponse({"status": "ok", "records": records, "run_id": CURRENT_RUN["run_id"]})


def _write_placeholder_mp4(path: Path, duration: float = 4.0) -> None:
    """Use ffmpeg to generate a black silent placeholder mp4."""
    cmd = [
        "ffmpeg",
        "-y",
        "-f", "lavfi",
        "-i", f"color=c=black:s=720x1280:d={duration}",
        "-f", "lavfi",
        "-i", "anullsrc=r=44100:cl=mono",
        "-shortest",
        "-pix_fmt", "yuv420p",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        str(path),
    ]
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except Exception:
        path.write_bytes(b"")


@app.post("/api/pipeline/voice-branch/start")
def pipeline_start_voice_branch() -> JSONResponse:
    plan = load_plan()
    if not plan:
        return JSONResponse({"status": "error", "message": "No plan available"}, status_code=400)

    dirs = ensure_run_dirs()
    CURRENT_RUN["status"] = "generating_voice"
    log("voice_start")

    try:
        if MOCK_MODE:
            script = build_script_with_model(
                api_key="mock",
                model="mock",
                prompt_pack=plan,
                prompt_name="tiktok_us_influencer",
                use_mock=True,
            )
        else:
            if not DASHSCOPE_API_KEY:
                return JSONResponse({"status": "error", "message": "真实模式需要设置 DASHSCOPE_API_KEY 环境变量"}, status_code=500)
            script = build_script_with_model(
                api_key=DASHSCOPE_API_KEY,
                model=QWEN_COPY_MODEL,
                prompt_pack=plan,
                prompt_name="tiktok_us_influencer",
                use_mock=False,
            )
    except Exception:
        script = fallback_voice_script(plan)

    voiceover_path = dirs["deliverables_dir"] / "voiceover.wav"

    if MOCK_MODE:
        MockTTSClient().synthesize(script, voiceover_path)
        audio_url = "mock://local"
        tts_model = "mock"
        voice = "mock"
    else:
        if not DASHSCOPE_API_KEY:
            return JSONResponse({"status": "error", "message": "真实模式需要设置 DASHSCOPE_API_KEY 环境变量"}, status_code=500)
        try:
            audio_url = synthesize_tts_dashscope(DASHSCOPE_API_KEY, script, "Cherry", "qwen3-tts-instruct-flash")
            tts_download_file(audio_url, voiceover_path)
            tts_model = "qwen3-tts-instruct-flash"
            voice = "Cherry"
        except Exception as exc:
            return JSONResponse({"status": "error", "message": f"TTS 失败: {exc}"}, status_code=500)

    metadata = {
        "copy_model": "mock" if MOCK_MODE else QWEN_COPY_MODEL,
        "tts_model": tts_model,
        "voice": voice,
        "script": script,
        "audio_url": audio_url,
        "local_audio": str(voiceover_path),
    }
    voice_json_path = voiceover_path.with_suffix(".json")
    voice_json_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")

    CURRENT_RUN["status"] = "voice_done"
    log("voice_done", script)
    return JSONResponse({"status": "ok", "script": script, "run_id": CURRENT_RUN["run_id"]})


def fallback_voice_script(plan: dict) -> str:
    title = plan.get("product", {}).get("title", "")
    return f"Check out {title or 'this product'} — solid pick for everyday use."


@app.post("/api/pipeline/assemble")
def pipeline_assemble() -> JSONResponse:
    dirs = ensure_run_dirs()
    plan = load_plan()
    if not plan:
        if not MOCK_MODE:
            return JSONResponse({"status": "error", "message": "No plan available"}, status_code=400)
        plan = _mock_fallback_plan()

    CURRENT_RUN["status"] = "assembling"
    log("assemble_start")

    renders_dir = Path(CURRENT_RUN["renders_dir"])
    deliverables_dir = Path(CURRENT_RUN["deliverables_dir"])
    scene_videos = sorted(renders_dir.glob("*_wan.mp4"))
    source_video = _mock_video_source() if MOCK_MODE else None
    if not scene_videos and not source_video:
        return JSONResponse({"status": "error", "message": "No scene videos to assemble"}, status_code=400)

    ffmpeg = _ffmpeg_executable()

    silent_video = deliverables_dir / "final_silent.mp4"
    if source_video:
        log("assemble_mock_source", str(source_video))
        shutil.copyfile(source_video, silent_video)
    elif scene_videos:
        concat_file = deliverables_dir / "concat.txt"
        concat_file.write_text("\n".join([f"file '{p}'" for p in scene_videos]), encoding="utf-8")
        subprocess.run(
            [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(concat_file), "-an", "-c:v", "libx264", "-preset", "ultrafast", str(silent_video)],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    else:
        _write_mock_video(silent_video, duration=4.0)

    voiceover_path = deliverables_dir / "voiceover.wav"
    final_video = deliverables_dir / "final_with_voice.mp4"
    if voiceover_path.exists() and not source_video:
        subprocess.run(
            [
                ffmpeg, "-y",
                "-i", str(silent_video),
                "-i", str(voiceover_path),
                "-map", "0:v:0",
                "-map", "1:a:0",
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-c:a", "aac",
                "-shortest",
                str(final_video),
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    else:
        final_video = silent_video

    CURRENT_RUN["status"] = "completed"
    log("assemble_done", str(final_video))

    auto_publish_task: dict[str, Any] | None = None
    if AUTO_PUBLISH_DOUYIN_AFTER_ASSEMBLE:
        if not _is_publish_enabled():
            log("publish_douyin_skipped", f"AUTO_PUBLISH_DOUYIN_AFTER_ASSEMBLE=true 但发布功能不可用: {_publish_disabled_hint()}")
        elif not AUTO_PUBLISH_DOUYIN_ACCOUNT:
            log("publish_douyin_skipped", "AUTO_PUBLISH_DOUYIN_ACCOUNT 未配置")
        elif not is_account_name_valid(AUTO_PUBLISH_DOUYIN_ACCOUNT):
            log("publish_douyin_skipped", "AUTO_PUBLISH_DOUYIN_ACCOUNT 格式不合法")
        else:
            try:
                auto_publish_task = _start_douyin_publish_task(
                    run_id=CURRENT_RUN["run_id"],
                    account_name=AUTO_PUBLISH_DOUYIN_ACCOUNT,
                    title=_derive_auto_publish_title(CURRENT_RUN["run_id"], plan),
                    desc=_read_voice_script(deliverables_dir),
                    tags=_derive_auto_publish_tags(plan),
                    video_path=final_video,
                    source="auto_after_assemble",
                )
            except Exception as exc:
                log("publish_douyin_failed", f"自动发布触发失败: {exc}")

    return JSONResponse(
        {
            "status": "ok",
            "final_video": str(final_video),
            "silent_video": str(silent_video),
            "run_id": CURRENT_RUN["run_id"],
            "auto_publish_task": auto_publish_task,
        }
    )


@app.get("/api/artifacts/{run_id}/{path:path}", response_model=None)
def serve_artifact(run_id: str, path: str):
    candidates = [RUNS_DIR / run_id] + list(RUNS_DIR.glob(f"{run_id}_*"))
    for run_dir in candidates:
        if not run_dir.exists() or not run_dir.is_dir():
            continue
        target = (run_dir / path).resolve()
        base = run_dir.resolve()
        if str(target).startswith(str(base)) and target.exists():
            return FileResponse(str(target))
    return JSONResponse({"status": "not_found"}, status_code=404)


@app.get("/api/run/summary")
def run_summary(run_id: str) -> JSONResponse:
    """Return a full summary of a run: plan, voiceover metadata, and artifact file list."""
    candidates = [RUNS_DIR / run_id] + list(RUNS_DIR.glob(f"{run_id}_*"))
    run_dir: Path | None = None
    for c in candidates:
        if c.exists() and c.is_dir():
            run_dir = c
            break
    if not run_dir:
        return JSONResponse({"status": "error", "message": "Run not found"}, status_code=404)

    plan_path = run_dir / "plan" / "creative_plan.json"
    plan = json.loads(plan_path.read_text(encoding="utf-8")) if plan_path.exists() else {}

    voiceover_json = run_dir / "deliverables" / "voiceover.json"
    voiceover = json.loads(voiceover_json.read_text(encoding="utf-8")) if voiceover_json.exists() else {}

    deliverables_dir = run_dir / "deliverables"
    silent_video_path = deliverables_dir / "final_silent.mp4"
    final_video_path = deliverables_dir / "final_with_voice.mp4"

    artifacts: list[dict[str, Any]] = []
    renders_dir = run_dir / "renders"

    if deliverables_dir.exists():
        for f in sorted(deliverables_dir.iterdir()):
            if f.is_file():
                artifacts.append({
                    "name": f.name,
                    "kind": "deliverable",
                    "path": f"deliverables/{f.name}",
                    "size": f.stat().st_size,
                })
    if renders_dir.exists():
        for f in sorted(renders_dir.iterdir()):
            if f.is_file():
                artifacts.append({
                    "name": f.name,
                    "kind": "render",
                    "path": f"renders/{f.name}",
                    "size": f.stat().st_size,
                })

    publish_tasks = _list_publish_tasks_for_run(run_id)

    return JSONResponse({
        "status": "ok",
        "run_id": run_id,
        "plan": plan,
        "voiceover": voiceover,
        "artifacts": artifacts,
        "publish_tasks": publish_tasks,
        "mock_mode": "true" if MOCK_MODE else "false",
        "mock_video_source": _path_str_or_none(_mock_video_source()) if MOCK_MODE else None,
        "silent_video": _path_str_or_none(silent_video_path if silent_video_path.exists() else None),
        "final_video": _path_str_or_none(final_video_path if final_video_path.exists() else None),
    })


# ---------------------------------------------------------------------------
# Publish endpoints (Douyin MVP)
# ---------------------------------------------------------------------------

@app.post("/api/publish/douyin/start")
def publish_douyin_start(payload: DouyinPublishRequest) -> JSONResponse:
    if not _is_publish_enabled():
        return JSONResponse(
            {
                "detail": _publish_disabled_hint(),
            },
            status_code=503,
        )

    run_id = payload.run_id.strip()
    if not run_id:
        return JSONResponse({"detail": "run_id 不能为空"}, status_code=400)

    account_name = normalize_account_name(payload.account_name.strip(), fallback="douyin_account")
    if not is_account_name_valid(account_name):
        return JSONResponse(
            {
                "detail": "账号名仅支持字母、数字、点、下划线和连字符（1-64 位）",
            },
            status_code=400,
        )

    known_accounts = _discover_publish_accounts("douyin")
    if known_accounts and account_name not in known_accounts:
        return JSONResponse(
            {
                "detail": "账号未在已登录列表中，请先扫码登录后重试",
            },
            status_code=400,
        )

    title = payload.title.strip()
    if not title:
        return JSONResponse({"detail": "标题不能为空"}, status_code=400)

    run_dir = _resolve_run_dir(run_id)
    if not run_dir:
        return JSONResponse({"detail": "未找到对应 run_id"}, status_code=404)

    video_path, source = _resolve_publish_video_with_source(run_dir, allow_mock_fallback=True)
    if not video_path:
        return JSONResponse(
            {
                "detail": "未找到可发布视频，请先完成导出并生成 final_with_voice.mp4",
            },
            status_code=400,
        )

    try:
        task = _start_douyin_publish_task(
            run_id=run_id,
            account_name=account_name,
            title=title,
            desc=payload.desc.strip(),
            tags=payload.tags,
            video_path=video_path,
            source=source or "manual_run_artifact",
        )
    except Exception as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)

    return JSONResponse({"status": "ok", "task": task})


@app.post("/api/publish/douyin/login/start")
def publish_douyin_login_start(payload: DouyinLoginStartRequest) -> JSONResponse:
    if not _is_publish_enabled():
        return JSONResponse(
            {
                "detail": _publish_disabled_hint(),
            },
            status_code=503,
        )

    session_id = uuid.uuid4().hex[:12]
    raw_account_name = payload.account_name.strip()
    if raw_account_name:
        account_name = normalize_account_name(raw_account_name, fallback="douyin_default")
    else:
        account_name = "douyin_default"
    if not is_account_name_valid(account_name):
        return JSONResponse(
            {
                "detail": "账号名仅支持字母、数字、点、下划线和连字符（1-64 位）",
            },
            status_code=400,
        )

    session = {
        "id": session_id,
        "platform": "douyin",
        "account_name": account_name,
        "status": "pending",
        "message": "会话已创建，等待启动",
        "qrcode": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    _create_login_session(session)

    headless = False if payload.headless is None else bool(payload.headless)
    force_scan = PUBLISH_LOGIN_FORCE_SCAN if payload.force_scan is None else bool(payload.force_scan)
    keep_browser_open_seconds = (
        PUBLISH_LOGIN_KEEP_BROWSER_OPEN_SECONDS
        if payload.keep_browser_open_seconds is None
        else int(payload.keep_browser_open_seconds)
    )
    keep_browser_open_seconds = max(0, min(300, keep_browser_open_seconds))

    _update_login_session(
        session_id,
        message="登录会话已创建，正在启动扫码窗口",
        updated_at=now_iso(),
    )

    thread = threading.Thread(
        target=_run_douyin_login_session,
        args=(session_id, account_name, headless, force_scan, keep_browser_open_seconds),
        daemon=True,
    )
    thread.start()

    return JSONResponse({"status": "ok", "session": session})


@app.get("/api/publish/douyin/login/sessions/{session_id}")
def publish_douyin_login_session(session_id: str) -> JSONResponse:
    session = _get_login_session(session_id)
    if not session:
        return JSONResponse({"detail": "登录会话不存在"}, status_code=404)
    return JSONResponse({"status": "ok", "session": session})


@app.get("/api/publish/accounts")
def publish_accounts(platform: str = "douyin") -> JSONResponse:
    normalized = platform.strip().lower()
    if normalized != "douyin":
        return JSONResponse({"detail": "当前仅支持 douyin"}, status_code=400)

    if not _is_publish_enabled():
        return JSONResponse(
            {
                "status": "ok",
                "platform": "douyin",
                "enabled": False,
                "accounts": [],
                "hint": _publish_disabled_hint(),
            }
        )

    accounts = _discover_publish_accounts("douyin")
    hint = ""
    if not accounts:
        hint = "未发现已登录抖音账号，请先扫码登录。"

    return JSONResponse(
        {
            "status": "ok",
            "platform": "douyin",
            "enabled": True,
            "accounts": accounts,
            "hint": hint,
        }
    )


@app.get("/api/publish/tasks/{task_id}")
def publish_task_status(task_id: str) -> JSONResponse:
    task = _get_publish_task(task_id)
    if not task:
        return JSONResponse({"detail": "发布任务不存在"}, status_code=404)
    return JSONResponse({"status": "ok", "task": task})


# ---------------------------------------------------------------------------
# Batch endpoints
# ---------------------------------------------------------------------------

BATCH_UPLOADS = UPLOADS_DIR / "batch"
BATCH_QUEUE = BatchQueue()

@app.post("/api/batch/upload")
async def batch_upload(
    spreadsheet: UploadFile = File(...),
    images: list[UploadFile] = File(default_factory=list),
) -> JSONResponse:
    allowed_exts = (".csv", ".txt", ".xlsx", ".xls")
    if not spreadsheet.filename or not spreadsheet.filename.lower().endswith(allowed_exts):
        return JSONResponse({"status": "error", "message": "请上传 CSV 或 Excel（.xlsx/.xls）文件"}, status_code=400)
    if not images:
        return JSONResponse({"status": "error", "message": "请至少上传一张商品图片"}, status_code=400)

    file_bytes = await spreadsheet.read()
    image_names = [img.filename for img in images if img.filename]

    try:
        items = parse_spreadsheet_and_match_images(file_bytes, spreadsheet.filename, image_names)
    except ValueError as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=400)

    if len(items) == 0:
        return JSONResponse({"status": "error", "message": "表格中没有可识别的商品数据"}, status_code=400)
    if len(items) > 100:
        return JSONResponse({"status": "error", "message": "单次最多支持 100 个商品"}, status_code=400)

    batch_id = BATCH_QUEUE.create_batch(items)

    # Persist images on disk for the worker to pick up
    batch_img_dir = BATCH_UPLOADS / batch_id / "images"
    batch_img_dir.mkdir(parents=True, exist_ok=True)
    for img in images:
        if img.filename:
            data = await img.read()
            (batch_img_dir / img.filename).write_bytes(data)

    return JSONResponse({"status": "ok", "batch_id": batch_id, "item_count": len(items)})


@app.get("/api/batch/list")
def batch_list(limit: int = 50) -> JSONResponse:
    batches = BATCH_QUEUE.list_batches(limit=limit)
    return JSONResponse({"status": "ok", "batches": batches})


@app.get("/api/batch/{batch_id}/status")
def batch_status(batch_id: str) -> JSONResponse:
    batch = BATCH_QUEUE.get_batch(batch_id)
    if not batch:
        return JSONResponse({"status": "error", "message": "批次不存在"}, status_code=404)
    items = BATCH_QUEUE.get_batch_items(batch_id)
    return JSONResponse({"status": "ok", "batch": batch, "items": items})


@app.get("/api/batch/{batch_id}/download")
def batch_download(batch_id: str):
    batch = BATCH_QUEUE.get_batch(batch_id)
    if not batch:
        return JSONResponse({"status": "error", "message": "批次不存在"}, status_code=404)
    zip_path = batch.get("zip_path")
    if not zip_path or not Path(zip_path).exists():
        # Try to regenerate on the fly
        regenerated = create_zip_for_batch(batch_id, RUNS_DIR)
        if regenerated.exists():
            return FileResponse(str(regenerated), filename=f"{batch_id}.zip")
        return JSONResponse({"status": "error", "message": "ZIP 尚未生成，请等待批次完成"}, status_code=400)
    return FileResponse(str(zip_path), filename=f"{batch_id}.zip")


# ---------------------------------------------------------------------------
# Startup worker
# ---------------------------------------------------------------------------
start_worker()

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.api:app", host="127.0.0.1", port=8000, reload=True)
