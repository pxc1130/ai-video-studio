#!/usr/bin/env python3
import csv
import os
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

OUTPUT_DIR = Path("/tmp/large_batch_test")
OUTPUT_DIR.mkdir(exist_ok=True)
(IMAGES_DIR := OUTPUT_DIR / "images").mkdir(exist_ok=True)

CATEGORIES = ["shoes", "apparel", "outdoor_gear"]
COLORS = [(255, 99, 71), (60, 179, 113), (30, 144, 255), (255, 215, 0), (238, 130, 238)]

def generate(count: int):
    rows = []
    for i in range(1, count + 1):
        pid = f"P{i:03d}"
        cat = CATEGORIES[i % 3]
        price = round(19.99 + (i * 1.5), 2)
        rows.append({
            "product_id": pid,
            "product_name": f"Test Product {pid}",
            "price": price,
            "category": cat,
            "image_1": f"{pid}_main.jpg",
            "image_2": f"{pid}_detail.jpg",
        })

        for idx, suffix in enumerate(["main", "detail"]):
            img = Image.new("RGB", (720, 1280), COLORS[i % len(COLORS)])
            draw = ImageDraw.Draw(img)
            try:
                font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 60)
            except Exception:
                font = ImageFont.load_default()
            text = f"{pid}\n{suffix}"
            draw.text((360, 640), text, fill=(255, 255, 255), font=font, anchor="mm")
            img.save(IMAGES_DIR / f"{pid}_{suffix}.jpg")

    csv_path = OUTPUT_DIR / "products.csv"
    with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=["product_id", "product_name", "price", "category", "image_1", "image_2"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"✅ 生成完成：{csv_path}（{count} 行）")
    print(f"✅ 图片目录：{IMAGES_DIR}（共 {len(list(IMAGES_DIR.iterdir()))} 张）")

if __name__ == "__main__":
    import sys
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 50
    generate(count)
