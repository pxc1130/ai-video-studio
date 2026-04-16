#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Mock API client for local development. Returns realistic fake data without calling real APIs."""

from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Any


class MockChatCompletion:
    """Simulates OpenAI chat completion response for creative planning."""

    def __init__(self, payload: dict[str, Any]):
        self.payload = payload

    @property
    def choices(self):
        class Message:
            def __init__(self, content: str):
                self.content = content

        class Choice:
            def __init__(self, message: Message):
                self.message = message

        return [Choice(Message(json.dumps(self.payload, ensure_ascii=False)))]


class MockOpenAIClient:
    """Drop-in mock for OpenAI client. Respects MOCK_MODE env var."""

    def __init__(self, *, api_key: str = "mock", base_url: str = ""):
        self.api_key = api_key
        self.base_url = base_url

    @classmethod
    def is_mock(cls) -> bool:
        return True  # Always mock in this implementation; switch to env check later if needed

    def chat_completions_create(self, *, model: str, messages: list[dict], temperature: float = 0.6, response_format: dict | None = None) -> MockChatCompletion:
        return self._generate_plan(messages)

    def _generate_plan(self, messages: list[dict]) -> MockChatCompletion:
        """Parse the user prompt to extract context, then return a realistic fake plan."""
        user_text = ""
        for msg in messages:
            if msg.get("role") == "user":
                content = msg.get("content", "")
                if isinstance(content, list):
                    for item in content:
                        if item.get("type") == "text":
                            user_text += item.get("text", "")
                else:
                    user_text += content

        # Try to extract product facts from the prompt
        try:
            payload = json.loads(user_text)
            product_facts = payload.get("product_facts", {})
            category = payload.get("category_context", "default")
        except Exception:
            product_facts = {}
            category = "default"

        title = str(product_facts.get("title", "Amazing Outdoor Product"))
        price = str(product_facts.get("price", "29.99"))
        brand = str(product_facts.get("brand", "TrailBlaze"))

        category_scenes = {
            "shoes": [
                ("All-day comfort you can feel", "Cushioned sole + breathable mesh", "$" + price),
                ("Built for the trail", "Grip that handles mud and rock", ""),
                ("Lightweight, not bulky", "Perfect for runs and hikes", ""),
            ],
            "apparel": [
                ("Sweat-wicking that works", "Keeps you dry on long trails", "$" + price),
                ("Move freely", "Stretch fabric that follows you", ""),
                ("Layer up or down", "All-season utility", ""),
            ],
            "outdoor_gear": [
                ("Compact, ready anywhere", "Fits in your pack", "$" + price),
                ("Built tough", "Real outdoor tested", ""),
                ("One tool, endless uses", "Camping, hiking, everyday", ""),
            ],
        }

        scenes_data = category_scenes.get(category, category_scenes["outdoor_gear"])
        scenes = []
        for idx, (headline, subline, price_tag) in enumerate(scenes_data, start=1):
            scenes.append(
                {
                    "scene_id": f"scene_{idx}",
                    "reference_image": f"main.jpg",
                    "duration_seconds": 5,
                    "shot_goal": headline,
                    "camera_language": "slow push-in, keep subject centered",
                    "wan_prompt": (
                        f"A cinematic 5-second product shot for TikTok: {headline}. "
                        f"{subline}. Clean background, soft natural lighting, subtle camera push-in, "
                        f"high-end e-commerce aesthetic. No text, no people, no distortion."
                    ),
                    "negative_prompt": "no humans, no distorted products, no text overlay, no watermarks, no cluttered background",
                    "overlay_text": {
                        "headline": headline,
                        "subline": subline,
                        "price_tag": price_tag if idx == 1 else "",
                    },
                    "energy": "high" if idx == 1 else "medium",
                }
            )

        plan = {
            "product": {
                "product_id": product_facts.get("product_id", "MOCK-001"),
                "title": title,
                "price": price,
                "original_price": product_facts.get("original_price", ""),
                "sales": str(product_facts.get("sales", "1,240")),
                "shop_name": product_facts.get("shop_name", "Mock Store"),
                "brand": brand,
                "facts": [
                    f"Price {price} USD",
                    f"Brand {brand}",
                    "Based on real product images",
                ],
            },
            "material_analysis": {
                "subject_summary": f"A {category} product showcased with clean lifestyle imagery.",
                "core_selling_points": [scenes[0]["shot_goal"], scenes[1]["shot_goal"], scenes[2]["shot_goal"]],
                "image_role_map": [
                    {"image": "main.jpg", "role": "hero shot", "reason": "Primary visual anchor", "priority": 1},
                    {"image": "carousel_2.jpg", "role": "detail support", "reason": "Shows texture or fit", "priority": 2},
                ],
                "scene_strategy": [
                    {"scene_focus": s["shot_goal"], "recommended_image": s["reference_image"], "reason": "Matches shot goal"}
                    for s in scenes
                ],
            },
            "creative_direction": {
                "audience": "US TikTok users interested in outdoor and fitness lifestyle",
                "tone": "authentic, energetic, influencer-style",
                "hook": f"Why {brand} is worth the hype",
                "core_message": f"{title} delivers real value for active lifestyles",
                "cta": "Check the link for details",
            },
            "compliance": {
                "allowed_claims": [f"Price around {price} USD", f"Brand {brand}", "Shown based on real images"],
                "forbidden_claims": ["best", "top", "100% guaranteed", "#1"],
                "review_summary": "Avoid absolute claims and unverified performance promises.",
            },
            "video_style": {
                "aspect_ratio": "9:16",
                "duration_seconds": sum(s["duration_seconds"] for s in scenes),
                "style_tags": ["TikTok native", "fast-paced", "authentic", "lifestyle"],
                "music_direction": "upbeat electronic or indie pop, 120-130 BPM",
                "subtitle_style": "bold headline + small subline, minimal",
                "transition_style": "hard cut + slight flash",
            },
            "scenes": scenes,
        }
        return MockChatCompletion(plan)


class MockTTSClient:
    """Mock TTS that writes a silent placeholder WAV."""

    def synthesize(self, text: str, output_path: Path) -> str:
        """Create a tiny valid WAV file (silent) so FFmpeg can process it."""
        import struct
        import wave

        duration_sec = 2
        sample_rate = 16000
        num_samples = duration_sec * sample_rate

        output_path.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(output_path), "w") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            for _ in range(num_samples):
                wf.writeframes(struct.pack("<h", 0))
        return str(output_path)
