#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Import products from CSV/Excel and create asset directories compatible with the pipeline."""

from __future__ import annotations

import csv
import json
import re
import shutil
from pathlib import Path
from typing import Any


def sanitize_filename(text: str, max_len: int = 40) -> str:
    text = re.sub(r'[\\/:*?"<>|]', "_", text)
    return text.strip()[:max_len]


def import_from_csv(
    csv_path: Path,
    images_source_dir: Path,
    output_base_dir: Path,
    id_column: str = "product_id",
    title_column: str = "product_name",
    price_column: str = "price",
    category_column: str = "category",
) -> list[Path]:
    """
    Read a CSV where each row represents a product.
    Expected columns: product_id, product_name, price, category, script_template (optional)
    Images are expected to live under images_source_dir / {product_id} /
    """
    rows: list[dict[str, str]] = []
    with csv_path.open("r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append({k: (v or "").strip() for k, v in row.items()})

    created: list[Path] = []
    for row in rows:
        pid = row.get(id_column, "").strip()
        title = row.get(title_column, "").strip()
        price = row.get(price_column, "").strip()
        category = row.get(category_column, "default").strip().lower()
        script_template = row.get("script_template", "").strip()

        if not pid:
            continue

        safe_title = sanitize_filename(title) or "product"
        product_dir = output_base_dir / f"{pid}_{safe_title}"
        product_dir.mkdir(parents=True, exist_ok=True)

        # Copy images from source
        source_img_dir = images_source_dir / pid
        if source_img_dir.exists() and source_img_dir.is_dir():
            for img in sorted(source_img_dir.iterdir()):
                if img.is_file() and img.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
                    shutil.copy2(img, product_dir / img.name)

        # Write meta.json compatible with creative_plan_builder
        meta = {
            "item": {
                "num_iid": pid,
                "title": title,
                "price": price,
                "orginal_price": row.get("original_price", "").strip(),
                "sales": row.get("sales", "").strip(),
                "brand": row.get("brand", "").strip(),
                "location": row.get("location", "").strip(),
                "props": [],
                "seller_info": {"shop_name": row.get("shop_name", "").strip()},
            },
            "category": category,
            "script_template": script_template,
        }
        (product_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        created.append(product_dir)

    return created


def import_single_product(
    product_id: str,
    title: str,
    price: str,
    images_dir: Path,
    output_base_dir: Path,
    category: str = "default",
    script_template: str = "",
    extra_meta: dict[str, Any] | None = None,
) -> Path:
    """Import a single product directory directly (useful for drag-and-drop uploads)."""
    safe_title = sanitize_filename(title) or "product"
    product_dir = output_base_dir / f"{product_id}_{safe_title}"
    product_dir.mkdir(parents=True, exist_ok=True)

    if images_dir.exists() and images_dir.is_dir():
        for img in sorted(images_dir.iterdir()):
            if img.is_file() and img.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
                shutil.copy2(img, product_dir / img.name)

    meta = {
        "item": {
            "num_iid": product_id,
            "title": title,
            "price": price,
            "orginal_price": "",
            "sales": "",
            "brand": "",
            "location": "",
            "props": [],
            "seller_info": {"shop_name": ""},
        },
        "category": category,
        "script_template": script_template,
    }

    if extra_meta:
        # Fields relevant to the item should go into meta["item"], but
        # pipeline-level fields (like description_text) should stay at top level.
        item_keys = {"num_iid", "title", "price", "orginal_price", "sales", "brand", "location", "props", "seller_info", "desc", "desc_short", "detail_url", "pic_url", "item_imgs", "skus"}
        for key, value in extra_meta.items():
            if key in item_keys:
                meta["item"][key] = value
            else:
                meta[key] = value

    (product_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return product_dir
