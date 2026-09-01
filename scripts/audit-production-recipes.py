import sqlite3
import json
from pathlib import Path

DB = Path(__file__).resolve().parents[1] / "prisma" / "dev.db"
conn = sqlite3.connect(DB)
rows = conn.execute(
    """
    SELECT slug, title, excerpt, "values", status
    FROM Recipe
    ORDER BY title
    """
).fetchall()

published = [r for r in rows if r[4] == "published"]
print(f"total={len(rows)} published={len(published)}")

for slug, title, excerpt, values_raw, status in published:
    try:
        values = json.loads(values_raw or "{}")
    except json.JSONDecodeError:
        values = {}
    image = values.get("image", "")
    print(
        json.dumps(
            {
                "slug": slug,
                "title": title,
                "image": image,
                "imageAlt": values.get("imageAlt", ""),
                "gallery": values.get("gallery", [])[:5],
                "prepMinutes": values.get("prepMinutes"),
                "cookMinutes": values.get("cookMinutes"),
                "bakeMinutes": values.get("bakeMinutes"),
                "restMinutes": values.get("restMinutes"),
                "riseHours": values.get("riseHours"),
                "servings": values.get("servings"),
                "servingsUnit": values.get("servingsUnit"),
                "excerpt": excerpt,
            },
            ensure_ascii=False,
        )
    )

conn.close()
