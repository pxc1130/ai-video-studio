#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Voiceover builder with externalized prompts and mock mode support.
Adapted from 电商短视频制作 for ai-video-studio backend.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from backend.utils.prompt_loader import load_copy_prompt
from backend.core.mock_client import MockTTSClient

try:
    import requests
except ImportError:  # pragma: no cover
    requests = None  # type: ignore

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover
    OpenAI = None  # type: ignore


TTS_ENDPOINT = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
CHAT_ENDPOINT = "https://dashscope.aliyuncs.com/compatible-mode/v1"
DEFAULT_COPY_MODEL = "qwen3.5-flash"


def fallback_script(prompt_pack: dict) -> str:
    product = prompt_pack.get("product", {})
    title = product.get("title", "").strip()
    price = product.get("price", "").strip()
    if title and price:
        return f"{title}. Around ${price}. Great value for everyday use."
    if title:
        return f"{title}. Solid pick, check it out."
    return "Check out this product."


def build_script_with_model(
    api_key: str,
    model: str,
    prompt_pack: dict,
    copy_instruction: str = "",
    prompt_name: str = "tiktok_us_influencer",
    use_mock: bool = False,
) -> str:
    product = prompt_pack.get("product", {})
    scenes = prompt_pack.get("scenes", [])

    scene_focuses = [
        {"shot_goal": scene.get("shot_goal", ""), "overlay_text": scene.get("overlay_text", {})}
        for scene in scenes[:4]
    ]

    ctx = {
        "product_json": json.dumps(product, ensure_ascii=False),
        "scene_focuses_json": json.dumps(scene_focuses, ensure_ascii=False),
        "copy_instruction": copy_instruction.strip(),
    }
    prompts = load_copy_prompt(name=prompt_name, context=ctx)

    messages = [
        {"role": "system", "content": prompts["system_prompt"]},
        {"role": "user", "content": prompts["user_prompt"]},
    ]
    if copy_instruction.strip():
        messages.append({"role": "user", "content": f"Extra instruction: {copy_instruction.strip()}"})

    if use_mock:
        from backend.core.mock_client import MockOpenAIClient
        client = MockOpenAIClient(api_key=api_key, base_url=CHAT_ENDPOINT)
        resp = client.chat_completions_create(model=model, messages=messages)
    else:
        if OpenAI is None:
            raise RuntimeError("openai package is required")
        client = OpenAI(api_key=api_key, base_url=CHAT_ENDPOINT)
        resp = client.chat.completions.create(
            model=model,
            temperature=0.7,
            response_format={"type": "json_object"},
            messages=messages,
        )
    raw = json.loads(resp.choices[0].message.content or "{}")
    script = str(raw.get("script", "")).strip()
    return script or fallback_script(prompt_pack)


def synthesize_tts_dashscope(api_key: str, text: str, voice: str, model: str) -> str:
    if requests is None:
        raise RuntimeError("requests package is required")
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": model,
        "input": {"text": text, "voice": voice, "language_type": "English"},
    }
    response = requests.post(TTS_ENDPOINT, headers=headers, json=payload, timeout=180)
    response.raise_for_status()
    data = response.json()
    return data["output"]["audio"]["url"]


def download_file(url: str, output_path: Path) -> None:
    if requests is None:
        raise RuntimeError("requests package is required")
    with requests.get(url, stream=True, timeout=180) as response:
        response.raise_for_status()
        with output_path.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 256):
                if chunk:
                    handle.write(chunk)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate English voiceover for ai-video-studio")
    parser.add_argument("creative_plan", help="Path to creative_plan.json")
    parser.add_argument("--api-key", default=os.getenv("DASHSCOPE_API_KEY", ""))
    parser.add_argument("--copy-model", default=os.getenv("QWEN_COPY_MODEL", DEFAULT_COPY_MODEL))
    parser.add_argument("--voice", default="Cherry")
    parser.add_argument("--tts-model", default="qwen3-tts-instruct-flash")
    parser.add_argument("--script", default="", help="Override script, skip copy generation")
    parser.add_argument("--copy-instruction", default="")
    parser.add_argument("--output", default="")
    parser.add_argument("--copy-only", action="store_true")
    parser.add_argument("--prompt-name", default="tiktok_us_influencer", help="Prompt template under prompts/copy/")
    parser.add_argument("--mock", action="store_true", help="Use mock TTS (writes silent wav)")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    prompt_pack_path = Path(args.creative_plan).expanduser().resolve()
    prompt_pack = json.loads(prompt_pack_path.read_text(encoding="utf-8"))

    voice_script = args.script.strip() or build_script_with_model(
        args.api_key,
        args.copy_model,
        prompt_pack,
        args.copy_instruction,
        args.prompt_name,
    )

    output_path = Path(args.output).expanduser().resolve() if args.output else prompt_pack_path.parent / "voiceover.wav"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    metadata = {
        "copy_model": args.copy_model,
        "tts_model": args.tts_model,
        "voice": args.voice,
        "copy_instruction": args.copy_instruction.strip(),
        "script": voice_script,
        "audio_url": "",
        "local_audio": "",
    }

    if not args.copy_only:
        if args.mock:
            MockTTSClient().synthesize(voice_script, output_path)
            metadata["audio_url"] = "mock://local"
        else:
            audio_url = synthesize_tts_dashscope(args.api_key, voice_script, args.voice, args.tts_model)
            download_file(audio_url, output_path)
            metadata["audio_url"] = audio_url
        metadata["local_audio"] = str(output_path)

    metadata_path = output_path.with_suffix(".json")
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
