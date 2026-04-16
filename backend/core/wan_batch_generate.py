#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import argparse
import base64
import concurrent.futures
import json
import mimetypes
import os
import random
import time
import urllib.request
from pathlib import Path
from typing import Any

import requests


API_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis"
TASK_URL = "https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}"


def encode_image(path: Path) -> str:
    mime, _ = mimetypes.guess_type(path.name)
    mime = mime or "image/jpeg"
    data = base64.b64encode(path.read_bytes()).decode("utf-8")
    return f"data:{mime};base64,{data}"


def submit_job(
    api_key: str,
    model: str,
    prompt: str,
    image_path: Path,
    resolution: str,
    duration: int,
    seed: int,
) -> dict[str, Any]:
    image_url = encode_image(image_path)
    if model.startswith("wan2.7"):
        payload = {
            "model": model,
            "input": {
                "prompt": prompt,
                "media": [
                    {
                        "type": "first_frame",
                        "url": image_url,
                    }
                ],
            },
            "parameters": {
                "resolution": resolution,
                "prompt_extend": True,
                "duration": duration,
                "watermark": False,
            },
        }
    else:
        payload = {
            "model": model,
            "input": {
                "prompt": prompt,
                "img_url": image_url,
            },
            "parameters": {
                "resolution": resolution,
                "prompt_extend": True,
                "duration": duration,
                "audio": False,
            },
        }
    if seed >= 0:
        payload["parameters"]["seed"] = seed
    response = requests.post(
        API_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "X-DashScope-Async": "enable",
        },
        json=payload,
        timeout=120,
    )
    if not response.ok:
        raise requests.HTTPError(
            f"{response.status_code} {response.reason}: {response.text}",
            response=response,
        )
    return response.json()


def poll_job(api_key: str, task_id: str, interval: int, max_wait: int) -> dict[str, Any]:
    headers = {"Authorization": f"Bearer {api_key}"}
    deadline = time.time() + max_wait
    url = TASK_URL.format(task_id=task_id)
    while True:
        response = requests.get(url, headers=headers, timeout=60)
        response.raise_for_status()
        data = response.json()
        status = data.get("output", {}).get("task_status")
        if status in {"SUCCEEDED", "FAILED", "CANCELED", "UNKNOWN"}:
            return data
        if time.time() >= deadline:
            raise TimeoutError(f"任务超时: {task_id}")
        time.sleep(interval)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="批量生成 Wan 图生视频镜头")
    parser.add_argument("creative_plan", help="creative_plan.json")
    parser.add_argument("--assets-dir", required=True, help="商品素材目录")
    parser.add_argument("--api-key", default=os.environ.get("DASHSCOPE_API_KEY", ""))
    parser.add_argument("--model", default="wan2.6-i2v-flash")
    parser.add_argument("--resolution", default="720P")
    parser.add_argument("--duration", type=int, default=5)
    parser.add_argument("--seed", type=int, default=-1, help="随机种子，-1 表示不传")
    parser.add_argument("--interval", type=int, default=15)
    parser.add_argument("--max-wait", type=int, default=900)
    parser.add_argument("--output-dir", default="", help="输出目录")
    parser.add_argument("--limit", type=int, default=0, help="仅生成前 N 个镜头，0 为全部")
    parser.add_argument("--parallelism", type=int, default=3, help="并行生成镜头数")
    parser.add_argument("--scene-id", default="", help="仅生成指定 scene_id")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.api_key:
        raise SystemExit("缺少 DASHSCOPE_API_KEY")

    prompt_pack_path = Path(args.creative_plan).expanduser().resolve()
    assets_dir = Path(args.assets_dir).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve() if args.output_dir else prompt_pack_path.parent
    output_dir.mkdir(parents=True, exist_ok=True)

    pack = json.loads(prompt_pack_path.read_text(encoding="utf-8"))
    scenes = pack["scenes"][: args.limit or None]
    if args.scene_id:
        scenes = [scene for scene in scenes if str(scene.get("scene_id")) == str(args.scene_id)]
        if not scenes:
            raise SystemExit(f"未找到 scene_id={args.scene_id}")
    records: list[dict[str, Any]] = []

    def run_scene(scene: dict[str, Any]) -> dict[str, Any]:
        image_path = assets_dir / scene["reference_image"]
        scene_model = scene.get("video_model", args.model)
        scene_duration = int(scene.get("duration_seconds", args.duration))
        scene_seed = scene.get("seed", args.seed)
        if scene_seed is None or int(scene_seed) < 0:
            scene_seed = random.randint(10000000, 99999999)
        submit_data = submit_job(
            api_key=args.api_key,
            model=scene_model,
            prompt=scene["wan_prompt"],
            image_path=image_path,
            resolution=args.resolution,
            duration=scene_duration,
            seed=int(scene_seed),
        )
        task_id = submit_data["output"]["task_id"]
        poll_data = poll_job(args.api_key, task_id, args.interval, args.max_wait)
        record = {
            "scene_id": scene["scene_id"],
            "reference_image": scene["reference_image"],
            "video_model": scene_model,
            "duration_seconds": scene_duration,
            "seed": int(scene_seed),
            "submit": submit_data,
            "result": poll_data,
        }
        if poll_data.get("output", {}).get("task_status") == "SUCCEEDED":
            video_url = poll_data["output"]["video_url"]
            local_path = output_dir / f"{scene['scene_id']}_wan.mp4"
            urllib.request.urlretrieve(video_url, local_path)
            record["local_video"] = str(local_path)
        return record

    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.parallelism)) as executor:
        future_map = {executor.submit(run_scene, scene): scene for scene in scenes}
        for future in concurrent.futures.as_completed(future_map):
            record = future.result()
            records.append(record)
            records.sort(key=lambda item: str(item.get("scene_id")))
            (output_dir / "wan_batch_results.json").write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(records, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
