"""Apply production recipe content patches to published Recipe rows (SQLite or via env)."""

import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "prisma" / "dev.db"

PATCHES = {
    "iced-horchata-coffee": {"restMinutes": 240},
    "herb-focaccia": {"riseHours": 8, "restMinutes": 75},
    "lemon-sesame-bars": {"restMinutes": 120},
    "breakfast-tortillas": {"image": ""},
    "roasted-market-vegetables": {"image": ""},
}


def merge_values(slug: str, values: dict) -> dict:
    patch = PATCHES.get(slug)
    if not patch:
        return values
    return {**values, **patch}


def main() -> None:
    if not DB.exists():
        raise SystemExit(f"No database at {DB}")

    conn = sqlite3.connect(DB)
    rows = conn.execute(
        "SELECT id, slug, \"values\" FROM Recipe WHERE status = 'published'"
    ).fetchall()

    updated = 0
    for recipe_id, slug, raw in rows:
        if slug not in PATCHES:
            continue
        try:
            values = json.loads(raw or "{}")
        except json.JSONDecodeError:
            values = {}
        merged = merge_values(slug, values)
        conn.execute(
            "UPDATE Recipe SET \"values\" = ? WHERE id = ?",
            (json.dumps(merged, ensure_ascii=False), recipe_id),
        )
        updated += 1
        print(f"patched {slug}")

    conn.commit()
    conn.close()
    print(f"updated {updated} published recipes")


if __name__ == "__main__":
    main()
