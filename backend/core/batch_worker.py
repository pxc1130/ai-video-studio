#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Background worker that processes batch jobs one by one.
Lightweight: uses a daemon thread + SQLite queue.
"""

from __future__ import annotations

import json
import shutil
import threading
import time
import traceback
from pathlib import Path
from typing import Any

# When imported from api.py, absolute imports work via sys.path
from backend.core.batch_queue import BatchQueue
from backend.utils.csv_importer import import_single_product
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

try:
    from backend.core.wan_batch_generate import submit_job, poll_job
except Exception:
    submit_job = None
    poll_job = None

import os

MOCK_MODE = os.getenv("MOCK_MODE", "true").lower() in ("1", "true", "yes")
DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "")
QWEN_PLAN_MODEL = os.getenv("QWEN_PLAN_MODEL", "qwen3.5-flash")
QWEN_COPY_MODEL = os.getenv("QWEN_COPY_MODEL", "qwen3.5-flash")
WAN_MODEL = os.getenv("WAN_MODEL", "wan2.6-i2v-flash")
WAN_RESOLUTION = os.getenv("WAN_RESOLUTION", "720P")
MOCK_VIDEO_SOURCE_RAW = os.getenv("MOCK_VIDEO_SOURCE", "").strip()
DEFAULT_MOCK_VIDEO_SOURCE = Path(r"D:\ai-workflow\微信视频2026-04-16_194935_072.mp4")

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "backend_data"
RUNS_DIR = DATA_DIR / "runs"
UPLOADS_DIR = DATA_DIR / "uploads"
BATCH_UPLOADS = UPLOADS_DIR / "batch"


def _now() -> str:
    from datetime import datetime
    return datetime.now().isoformat(timespec="seconds")


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
    import subprocess

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
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return

    subprocess.run(
        [
            ffmpeg, "-y", "-f", "lavfi",
            "-i", f"color=c=black:s=1080x1920:d={duration}",
            "-pix_fmt", "yuv420p",
            str(path),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _write_placeholder_mp4(path: Path, duration: float = 4.0) -> None:
    import subprocess
    path.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg = _ffmpeg_executable()
    subprocess.run(
        [
            ffmpeg, "-y", "-f", "lavfi",
            "-i", f"color=c=black:s=1080x1920:d={duration}",
            "-pix_fmt", "yuv420p",
            str(path),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _format_srt_time(seconds: float) -> str:
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{hrs:02d}:{mins:02d}:{secs:02d},{ms:03d}"


def _generate_srt(script: str, audio_duration: float, srt_path: Path) -> None:
    import re
    sentences = [s.strip() for s in re.split(r'[.!?]', script) if s.strip()]
    if not sentences:
        return
    total_words = sum(len(s.split()) for s in sentences)
    current_time = 0.0
    lines: list[str] = []
    for i, sentence in enumerate(sentences):
        words = len(sentence.split())
        duration = (words / total_words) * audio_duration if total_words > 0 else audio_duration / len(sentences)
        start = current_time
        end = min(current_time + duration, audio_duration)
        lines.append(str(i + 1))
        lines.append(f"{_format_srt_time(start)} --> {_format_srt_time(end)}")
        lines.append(sentence)
        lines.append("")
        current_time = end
    srt_path.write_text("\n".join(lines), encoding="utf-8")


def _get_audio_duration(path: Path) -> float:
    try:
        import wave

        with wave.open(str(path), "rb") as wav_file:
            frame_count = wav_file.getnframes()
            frame_rate = wav_file.getframerate()
            if frame_rate:
                return frame_count / float(frame_rate)
    except Exception:
        return 5.0


def _ensure_run_dirs(run_id: str) -> dict[str, Path]:
    run_dir = RUNS_DIR / run_id
    dirs = {
        "run_dir": run_dir,
        "plan_dir": run_dir / "plan",
        "renders_dir": run_dir / "renders",
        "deliverables_dir": run_dir / "deliverables",
    }
    for p in dirs.values():
        p.mkdir(parents=True, exist_ok=True)
    return dirs


def _run_pipeline_for_item(
    queue: BatchQueue,
    item: dict[str, Any],
    batch_upload_dir: Path,
) -> None:
    item_id = item["id"]
    batch_id = item["batch_id"]
    product_id = item["product_id"]
    product_name = item["product_name"]
    price = item["price"] or ""
    category = item["category"] or "default"
    script_template = item["script_template"] or ""
    image_names = json.loads(item["image_names"] or "[]")

    # Prepare product images
    product_images_dir = batch_upload_dir / batch_id / "images"
    selected_images: list[Path] = []
    ffmpeg = _ffmpeg_executable()
    for name in image_names:
        candidate = product_images_dir / name
        if candidate.exists():
            selected_images.append(candidate)

    # Fallback: if no explicit matches, use any image in the folder
    if not selected_images and product_images_dir.exists():
        selected_images = sorted(product_images_dir.iterdir())
        selected_images = [p for p in selected_images if p.is_file() and p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp")]

    # Create a dedicated run
    import uuid
    run_id = uuid.uuid4().hex[:12]
    dirs = _ensure_run_dirs(run_id)

    # Copy images into product dir expected by importer
    import_dir = dirs["run_dir"] / "product"
    import_dir.mkdir(parents=True, exist_ok=True)
    for idx, img_path in enumerate(selected_images[:8]):
        ext = img_path.suffix
        target_name = f"image_{idx + 1}{ext}"
        if idx == 0:
            target_name = f"main{ext}"
        shutil.copy2(img_path, import_dir / target_name)

    try:
        # 1) Import product metadata
        product_dir = import_single_product(
            product_id=run_id,
            title=product_name,
            price=price,
            output_base_dir=RUNS_DIR,
            images_dir=import_dir,
            category=category,
            script_template=script_template,
        )
        queue.update_item(
            item_id=item_id,
            status="running",
            product_dir=str(product_dir),
            run_id=run_id,
        )

        # 2) Planning
        images = select_images(product_dir, max_images=8)
        meta_path = product_dir / "meta.json"
        meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}

        raw = call_planning_model(
            meta=meta,
            images=images,
            model="mock" if MOCK_MODE else QWEN_PLAN_MODEL,
            api_key="mock" if MOCK_MODE else DASHSCOPE_API_KEY,
            scene_count=3,
            prompt_name="tiktok_us_ecommerce",
            category=category,
            system_instruction="",
            run_feedback="",
            script_template=script_template,
            use_mock=MOCK_MODE,
        )
        pack = normalize_pack(raw, meta, images, 3)
        for scene in pack.get("scenes", []):
            scene["duration_seconds"] = 3
        if pack.get("video_style"):
            pack["video_style"]["duration_seconds"] = 3 * len(pack.get("scenes", []))

        plan_path = dirs["plan_dir"] / "creative_plan.json"
        plan_path.write_text(json.dumps(pack, ensure_ascii=False, indent=2), encoding="utf-8")

        # 3) Render scenes (mock for now, same as api.py Plan A)
        scenes = pack.get("scenes", [])
        for scene in scenes:
            placeholder_path = dirs["renders_dir"] / f"{scene['scene_id']}_wan.mp4"
            _write_mock_video(placeholder_path, duration=scene.get("duration_seconds", 3))

        # 4) Voice branch
        script = ""
        if MOCK_MODE:
            title = pack.get("product", {}).get("title", "")
            script = f"Check out {title or 'this product'} — solid pick for everyday use."
        else:
            try:
                script = build_script_with_model(
                    api_key=DASHSCOPE_API_KEY,
                    model=QWEN_COPY_MODEL,
                    prompt_pack=pack,
                    use_mock=False,
                )
            except Exception:
                title = pack.get("product", {}).get("title", "")
                script = f"Check out {title or 'this product'} — solid pick for everyday use."

        voiceover_path = dirs["deliverables_dir"] / "voiceover.wav"
        if MOCK_MODE:
            MockTTSClient().synthesize(script, voiceover_path)
        else:
            audio_url = synthesize_tts_dashscope(DASHSCOPE_API_KEY, script, "Cherry", "qwen3-tts-instruct-flash")
            tts_download_file(audio_url, voiceover_path)

        voice_json_path = dirs["deliverables_dir"] / "voiceover.json"
        voice_json_path.write_text(
            json.dumps(
                {
                    "copy_model": "mock" if MOCK_MODE else QWEN_COPY_MODEL,
                    "tts_model": "mock" if MOCK_MODE else "qwen3-tts-instruct-flash",
                    "voice": "mock" if MOCK_MODE else "Cherry",
                    "script": script,
                    "local_audio": str(voiceover_path),
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

        # 5) Assemble
        import subprocess
        scenes = pack.get("scenes", [])
        concat_path = dirs["deliverables_dir"] / "concat.txt"
        with open(concat_path, "w", encoding="utf-8") as f:
            for scene in scenes:
                f.write(f"file '{dirs['renders_dir'] / f'{scene['scene_id']}_wan.mp4'}'\n")

        silent_video = dirs["deliverables_dir"] / "final_silent.mp4"
        demo_video_source = _mock_video_source() if MOCK_MODE else None
        if demo_video_source:
            shutil.copyfile(demo_video_source, silent_video)
        else:
            subprocess.run(
                [
                    ffmpeg, "-y", "-f", "concat", "-safe", "0",
                    "-i", str(concat_path), "-an", "-c:v", "libx264", "-preset", "ultrafast",
                    str(silent_video),
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

        # 5.1) Subtitles
        srt_path = dirs["deliverables_dir"] / "voiceover.srt"
        audio_duration = _get_audio_duration(voiceover_path)
        _generate_srt(script, audio_duration, srt_path)

        # 5.2) BGM + voiceover mix
        bgm_path = Path(__file__).resolve().parent.parent / "assets" / "bgm_default.mp3"
        mixed_audio_path = dirs["deliverables_dir"] / "mixed_audio.wav"
        if bgm_path.exists():
            subprocess.run(
                [
                    ffmpeg, "-y",
                    "-i", str(voiceover_path),
                    "-stream_loop", "-1", "-i", str(bgm_path),
                    "-filter_complex",
                    "[1:a]volume=0.12[bgm];[0:a][bgm]amix=inputs=2:duration=first[aout]",
                    "-map", "[aout]",
                    "-c:a", "pcm_s16le",
                    str(mixed_audio_path),
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            audio_for_mux = mixed_audio_path
        else:
            audio_for_mux = voiceover_path

        # 5.3) Final mux with subtitles burned in
        final_video = dirs["deliverables_dir"] / "final_with_voice.mp4"
        if srt_path.exists() and srt_path.stat().st_size > 0:
            subprocess.run(
                [
                    ffmpeg, "-y",
                    "-i", str(silent_video),
                    "-i", str(audio_for_mux),
                    "-vf", f"subtitles='{str(srt_path)}':force_style='FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2'",
                    "-map", "0:v:0",
                    "-map", "1:a:0",
                    "-c:v", "libx264",
                    "-preset", "ultrafast",
                    "-c:a", "aac",
                    "-shortest",
                    str(final_video),
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        else:
            subprocess.run(
                [
                    ffmpeg, "-y",
                    "-i", str(silent_video),
                    "-i", str(audio_for_mux),
                    "-map", "0:v:0",
                    "-map", "1:a:0",
                    "-c:v", "libx264",
                    "-preset", "ultrafast",
                    "-c:a", "aac",
                    "-shortest",
                    str(final_video),
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

        queue.update_item(
            item_id=item_id,
            status="completed",
            run_id=run_id,
            plan_path=str(plan_path),
            deliverables_dir=str(dirs["deliverables_dir"]),
        )

    except Exception as e:
        queue.update_item(
            item_id=item_id,
            status="failed",
            run_id=run_id,
            error_message=str(e),
        )
        traceback.print_exc()


def _process_one_batch(queue: BatchQueue) -> None:
    batch_id = queue.claim_next_pending_batch()
    if not batch_id:
        return

    print(f"[BatchWorker] Starting batch {batch_id}")
    items = queue.get_batch_items(batch_id)
    batch_upload_dir = BATCH_UPLOADS

    completed = 0
    failed = 0
    start_time = time.time()

    for item in items:
        _run_pipeline_for_item(queue, item, batch_upload_dir)
        item_status = queue.get_batch_items(batch_id)
        this_item = next((i for i in item_status if i["id"] == item["id"]), None)
        if this_item and this_item["status"] == "completed":
            completed += 1
        elif this_item:
            failed += 1

        elapsed = time.time() - start_time
        avg_per_item = elapsed / (completed + failed) if (completed + failed) > 0 else elapsed
        remaining_items = len(items) - (completed + failed)
        eta = int(avg_per_item * remaining_items)
        queue.update_batch_progress(
            batch_id=batch_id,
            completed=completed,
            failed=failed,
            eta_seconds=eta,
        )

    # After all items, create ZIP if any succeeded
    from backend.core.batch_queue import create_zip_for_batch
    zip_path = create_zip_for_batch(batch_id, RUNS_DIR)
    final_status = "completed" if completed > 0 else "failed"
    queue.update_batch_progress(
        batch_id=batch_id,
        status=final_status,
        zip_path=str(zip_path) if zip_path.exists() else None,
    )
    print(f"[BatchWorker] Batch {batch_id} finished: {completed} ok, {failed} failed")


def worker_loop() -> None:
    queue = BatchQueue()
    while True:
        try:
            _process_one_batch(queue)
        except Exception:
            traceback.print_exc()
        time.sleep(3)


_worker_started = False


def start_worker() -> None:
    global _worker_started
    if _worker_started:
        return
    _worker_started = True
    t = threading.Thread(target=worker_loop, daemon=True)
    t.start()
    print("[BatchWorker] Daemon thread started")
