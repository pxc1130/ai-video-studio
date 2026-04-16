#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Creative plan builder with externalized prompts and mock mode support.
Adapted from 电商短视频制作 for ai-video-studio backend.
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
from pathlib import Path
from typing import Any

from backend.utils.prompt_loader import load_planning_prompt
from backend.core.mock_client import MockOpenAIClient

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover
    OpenAI = None  # type: ignore


BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
DEFAULT_MODEL = "qwen3.5-flash"
FORBIDDEN_TERMS = ["best", "top", "#1", "100% guaranteed", "zero risk", "no.1", "first-class", "国家级"]


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def select_images(product_dir: Path, max_images: int = 8) -> list[Path]:
    preferred = [
        "main.jpg", "main.png",
        "carousel_1.jpg", "carousel_1.png",
        "carousel_2.jpg", "carousel_2.png",
        "detail_1.jpg", "detail_1.png",
        "sku_1.jpg", "sku_1.png",
    ]
    seen: set[Path] = set()
    images: list[Path] = []
    for name in preferred:
        path = product_dir / name
        if path.exists() and path not in seen:
            seen.add(path)
            images.append(path)
    for path in sorted([p for p in product_dir.iterdir() if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}]):
        if path not in seen:
            seen.add(path)
            images.append(path)
    return images[:max_images]


def encode_image(path: Path) -> str:
    mime, _ = mimetypes.guess_type(path.name)
    mime = mime or "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('utf-8')}"


def looks_english(text: str) -> bool:
    letters = sum(char.isascii() and char.isalpha() for char in text)
    return letters >= max(3, len(text) * 0.3)


def fallback_overlay_text(shot_goal: str, price: str, index: int) -> dict[str, str]:
    headline = "Real product. Real details."
    subline = "See it up close and in action."
    lowered = shot_goal.lower()
    if "comfort" in lowered or "fit" in lowered:
        headline = "Comfort that keeps up"
        subline = "Designed for all-day wear"
    elif "detail" in lowered or "texture" in lowered or "build" in lowered:
        headline = "Built to last"
        subline = "Quality you can see"
    elif "price" in lowered or "deal" in lowered:
        headline = "Worth every dollar"
        subline = "Check the price tag"
    return {
        "headline": headline,
        "subline": subline,
        "price_tag": f"${price}" if index == 0 and price else "",
    }


def build_messages(
    meta: dict[str, Any],
    images: list[Path],
    scene_count: int,
    prompt_name: str,
    category: str,
    system_instruction: str = "",
    run_feedback: str = "",
    script_template: str = "",
) -> list[dict[str, Any]]:
    item = meta.get("item", meta)  # Support both old taobao wrap and flat meta
    product_facts = {
        "product_id": str(item.get("num_iid", item.get("product_id", ""))),
        "title": str(item.get("title", "")),
        "price": str(item.get("price", "")),
        "original_price": str(item.get("orginal_price", item.get("original_price", ""))),
        "sales": str(item.get("sales", item.get("total_sold", ""))),
        "shop_name": str(item.get("shop_name", item.get("seller_info", {}).get("shop_name", ""))),
        "brand": str(item.get("brand", "")),
        "location": str(item.get("location", "")),
        "props": item.get("props", [])[:10],
    }

    ctx = {
        "category": category,
        "product_facts_json": json.dumps(product_facts, ensure_ascii=False),
        "scene_count": str(scene_count),
        "script_template": script_template.strip(),
        "system_instruction": system_instruction.strip(),
        "run_feedback": run_feedback.strip(),
    }
    prompts = load_planning_prompt(name=prompt_name, category=category, context=ctx)
    system_prompt = prompts["system_prompt"]
    if system_instruction.strip():
        system_prompt += f"\nExtra instruction: {system_instruction.strip()}"
    if run_feedback.strip():
        system_prompt += f"\nRun feedback: {run_feedback.strip()}"

    user_prompt = prompts["user_prompt"]
    content: list[dict[str, Any]] = [{"type": "text", "text": user_prompt}]
    for image in images:
        content.append({"type": "image_url", "image_url": {"url": encode_image(image)}})
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": content},
    ]


def normalize_pack(raw: dict[str, Any], meta: dict[str, Any], images: list[Path], scene_count: int) -> dict[str, Any]:
    item = meta.get("item", meta)
    image_names = [img.name for img in images]
    scenes = raw.get("scenes") or []

    product_raw = raw.get("product", {})
    if isinstance(product_raw, str):
        product_raw = {"title": product_raw}
    creative_raw = raw.get("creative_direction", {})
    if isinstance(creative_raw, str):
        creative_raw = {
            "audience": "US TikTok users",
            "tone": "authentic, energetic",
            "hook": creative_raw[:40],
            "core_message": creative_raw,
            "cta": "Check it out",
        }
    compliance_raw = raw.get("compliance", {})
    if isinstance(compliance_raw, str):
        compliance_raw = {"review_summary": compliance_raw}
    material_raw = raw.get("material_analysis", {})
    if isinstance(material_raw, str):
        material_raw = {"subject_summary": material_raw}
    video_style_raw = raw.get("video_style", {})
    if isinstance(video_style_raw, str):
        video_style_raw = {
            "aspect_ratio": "9:16",
            "duration_seconds": 12,
            "style_tags": ["TikTok", "fast-paced"],
            "music_direction": "upbeat",
            "subtitle_style": "bold headline + small subline",
            "transition_style": "hard cut",
        }

    if not scenes:
        fallback_lines = [
            ("Hero shot", "Show the product clearly with strong lighting"),
            ("Detail close-up", "Highlight material and build quality"),
            ("Real usage", "Product in action, authentic context"),
        ]
        for idx, name in enumerate(image_names[:scene_count]):
            title, cam = fallback_lines[idx % len(fallback_lines)]
            scenes.append(
                {
                    "scene_id": f"scene_{idx + 1}",
                    "reference_image": name,
                    "duration_seconds": 4,
                    "shot_goal": title,
                    "camera_language": cam,
                    "wan_prompt": (
                        "A cinematic 4-second product shot for TikTok. Clean background, "
                        "soft natural lighting, subtle camera motion, high-end e-commerce aesthetic. "
                        "No text, no people, no distortion."
                    ),
                    "negative_prompt": "no humans, no distorted products, no text overlay, no watermarks",
                    "overlay_text": fallback_overlay_text(title, str(item.get("price", "")), idx),
                    "energy": "medium",
                }
            )

    normalized = {
        "product": {
            "product_id": str(item.get("num_iid", item.get("product_id", ""))),
            "title": product_raw.get("title") or item.get("title", ""),
            "price": str(item.get("price", "")),
            "original_price": str(item.get("orginal_price", item.get("original_price", ""))),
            "sales": str(item.get("sales", item.get("total_sold", ""))),
            "shop_name": item.get("shop_name", item.get("seller_info", {}).get("shop_name", "")),
            "brand": item.get("brand", ""),
            "facts": [
                f"Price {item.get('price', '')} USD" if item.get('price') else "",
                f"Brand {item.get('brand', '')}" if item.get('brand') else "",
                "Shown based on real product images",
            ],
        },
        "material_analysis": {
            "subject_summary": material_raw.get("subject_summary") or "Product shown with clean lifestyle imagery.",
            "core_selling_points": material_raw.get("core_selling_points") or [
                "Authentic product presentation",
                "Visible details and quality",
                "Clear value for active lifestyle",
            ],
            "image_role_map": [],
            "scene_strategy": [],
        },
        "creative_direction": {
            "audience": creative_raw.get("audience") or "US TikTok users interested in active lifestyle",
            "tone": creative_raw.get("tone") or "authentic, energetic, influencer-style",
            "hook": creative_raw.get("hook") or "See why this is worth it",
            "core_message": creative_raw.get("core_message") or "Real value for real usage",
            "cta": creative_raw.get("cta") or "Check the link for details",
        },
        "compliance": {
            "allowed_claims": compliance_raw.get("allowed_claims") or [
                f"Price around {item.get('price', '')} USD" if item.get('price') else "",
                "Shown based on current product images",
            ],
            "forbidden_claims": compliance_raw.get("forbidden_claims") or FORBIDDEN_TERMS,
            "review_summary": compliance_raw.get("review_summary") or "Avoid absolute claims and unverified promises.",
        },
        "video_style": {
            "aspect_ratio": video_style_raw.get("aspect_ratio") or "9:16",
            "duration_seconds": float(video_style_raw.get("duration_seconds") or 12),
            "style_tags": video_style_raw.get("style_tags") or ["TikTok", "fast-paced", "authentic"],
            "music_direction": video_style_raw.get("music_direction") or "upbeat electronic or indie pop",
            "subtitle_style": video_style_raw.get("subtitle_style") or "bold headline + small subline",
            "transition_style": video_style_raw.get("transition_style") or "hard cut + slight flash",
        },
        "scenes": [],
    }

    # image_role_map fallback
    for idx, image_name in enumerate(image_names):
        role = "hero shot"
        reason = "Primary visual anchor"
        lowered = image_name.lower()
        if "detail" in lowered or "sku" in lowered:
            role = "detail support"
            reason = "Shows texture or variant"
        elif "carousel" in lowered:
            role = "angle support"
            reason = "Complementary perspective"
        normalized["material_analysis"]["image_role_map"].append(
            {"image": image_name, "role": role, "reason": reason, "priority": idx + 1}
        )

    used_images: set[str] = set()
    for idx, scene in enumerate(scenes[:scene_count]):
        requested = scene.get("reference_image")
        image_name = None
        if requested and requested in image_names and requested not in used_images:
            image_name = requested
        else:
            for name in image_names:
                if name not in used_images:
                    image_name = name
                    break
            if not image_name:
                image_name = image_names[min(idx, len(image_names) - 1)]
        used_images.add(image_name)
        shot_goal = scene.get("shot_goal") or scene.get("visual_description") or "Show product clearly"
        overlay_source = scene.get("overlay_text") if isinstance(scene.get("overlay_text"), dict) else {}
        fallback = fallback_overlay_text(str(shot_goal), str(item.get("price", "")), idx)

        raw_wan = str(scene.get("wan_prompt") or scene.get("prompt") or "").strip()
        wan_prompt = raw_wan if raw_wan and looks_english(raw_wan) else (
            f"A cinematic TikTok product shot: {shot_goal}. Clean background, soft lighting, "
            f"subtle camera motion, high-end e-commerce aesthetic. No text, no people, no distortion."
        )
        raw_neg = str(scene.get("negative_prompt") or "").strip()
        negative_prompt = raw_neg if raw_neg and looks_english(raw_neg) else (
            "no humans, no distorted products, no text overlay, no watermarks, no cluttered background"
        )

        normalized["scenes"].append(
            {
                "scene_id": str(scene.get("scene_id") or f"scene_{idx + 1}"),
                "reference_image": image_name,
                "duration_seconds": float(scene.get("duration_seconds") or 4),
                "shot_goal": shot_goal,
                "camera_language": scene.get("camera_language") or scene.get("camera_movement") or "slow push-in, keep subject centered",
                "wan_prompt": wan_prompt,
                "negative_prompt": negative_prompt,
                "overlay_text": {
                    "headline": str(overlay_source.get("headline") or fallback["headline"]).strip(),
                    "subline": str(overlay_source.get("subline") or fallback["subline"]).strip(),
                    "price_tag": str(overlay_source.get("price_tag") or fallback["price_tag"]).strip(),
                },
                "energy": scene.get("energy") or "medium",
            }
        )
        normalized["material_analysis"]["scene_strategy"].append(
            {
                "scene_focus": str(shot_goal),
                "recommended_image": image_name,
                "reason": f"Assigned to image '{image_name}' for shot goal '{shot_goal}'",
            }
        )

    return normalized


def call_model(
    meta: dict[str, Any],
    images: list[Path],
    model: str,
    api_key: str,
    scene_count: int,
    prompt_name: str,
    category: str,
    system_instruction: str = "",
    run_feedback: str = "",
    script_template: str = "",
    use_mock: bool = False,
) -> dict[str, Any]:
    messages = build_messages(meta, images, scene_count, prompt_name, category, system_instruction, run_feedback, script_template)
    if use_mock:
        client = MockOpenAIClient(api_key=api_key, base_url=BASE_URL)
        response = client.chat_completions_create(model=model, messages=messages)
        raw = json.loads(response.choices[0].message.content or "{}")
        for idx, scene in enumerate(raw.get("scenes", [])):
            if idx < len(images):
                scene["reference_image"] = images[idx].name
        return raw
    else:
        if OpenAI is None:
            raise RuntimeError("openai package is required in non-mock mode")
        client = OpenAI(api_key=api_key, base_url=BASE_URL)
        response = client.chat.completions.create(
            model=model,
            temperature=0.6,
            response_format={"type": "json_object"},
            messages=messages,
        )
    return json.loads(response.choices[0].message.content or "{}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate creative plan for ai-video-studio")
    parser.add_argument("product_dir", help="Product asset directory containing meta.json and images")
    parser.add_argument("--api-key", default=os.environ.get("DASHSCOPE_API_KEY", ""))
    parser.add_argument("--model", default=os.environ.get("QWEN_OMNI_MODEL", DEFAULT_MODEL))
    parser.add_argument("--output-dir", default="")
    parser.add_argument("--scene-count", type=int, default=3)
    parser.add_argument("--max-images", type=int, default=8)
    parser.add_argument("--prompt-name", default="tiktok_us_ecommerce", help="Prompt template name under prompts/planning/")
    parser.add_argument("--category", default="default", help="shoes | apparel | outdoor_gear")
    parser.add_argument("--system-instruction", default="")
    parser.add_argument("--run-feedback", default="")
    parser.add_argument("--script-template", default="")
    parser.add_argument("--mock", action="store_true", help="Use mock client instead of real API")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    product_dir = Path(args.product_dir).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve() if args.output_dir else product_dir / "creative_plan_output"
    output_dir.mkdir(parents=True, exist_ok=True)

    meta_path = product_dir / "meta.json"
    meta = load_json(meta_path) if meta_path.exists() else {}
    images = select_images(product_dir, args.max_images)

    raw = call_model(
        meta=meta,
        images=images,
        model=args.model,
        api_key=args.api_key,
        scene_count=args.scene_count,
        prompt_name=args.prompt_name,
        category=args.category,
        system_instruction=args.system_instruction,
        run_feedback=args.run_feedback,
        script_template=args.script_template,
        use_mock=args.mock,
    )
    pack = normalize_pack(raw, meta, images, args.scene_count)

    (output_dir / "creative_plan_raw.json").write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8")
    (output_dir / "creative_plan.json").write_text(json.dumps(pack, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(pack, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
