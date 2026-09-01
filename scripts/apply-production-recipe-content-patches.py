"""Apply production recipe content patches with compare-and-swap guards."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "prisma" / "dev.db"

LEGACY_MISMATCHED_STOCK_IMAGES = {
    "breakfast-tortillas": (
        "https://images.unsplash.com/photo-1565299585323-38d6b0865b47"
        "?auto=format&fit=crop&w=1600&q=80"
    ),
    "roasted-market-vegetables": (
        "https://images.unsplash.com/photo-1512621776951-a57141f2eefd"
        "?auto=format&fit=crop&w=1600&q=80"
    ),
}

PATCHES = {
    "iced-horchata-coffee": {"restMinutes": 240},
    "herb-focaccia": {"riseHours": 8, "restMinutes": 75},
    "lemon-sesame-bars": {"restMinutes": 120},
    "breakfast-tortillas": {"image": ""},
    "roasted-market-vegetables": {"image": ""},
}


def is_unset_number(value) -> bool:
    if value is None or value == "":
        return True
    if isinstance(value, (int, float)) and (value == 0 or value != value):
        return True
    return False


def plan_field(slug: str, field: str, current, proposed):
    if field == "image" and proposed == "":
        legacy = LEGACY_MISMATCHED_STOCK_IMAGES.get(slug)
        current_str = str(current or "").strip()
        if not legacy:
            return "CONFLICT", "no legacy URL"
        if current_str == "":
            return "SKIP", "already cleared"
        if current_str == legacy:
            return "APPLY", "matches legacy mismatched stock URL"
        return "CONFLICT", "current image differs from legacy mismatched stock"

    if isinstance(proposed, (int, float)):
        if isinstance(current, (int, float)) and current == proposed:
            return "SKIP", "already correct"
        if is_unset_number(current):
            return "APPLY", "legacy unset or zero"
        return "CONFLICT", "nonzero editorial value differs"

    return "CONFLICT", "unsupported patch"


def apply_plan(values: dict, slug: str) -> dict:
    patch = PATCHES.get(slug)
    if not patch:
        return values
    out = dict(values)
    for field, proposed in patch.items():
        action, _ = plan_field(slug, field, values.get(field), proposed)
        if action == "APPLY":
            out[field] = proposed
    return out


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    if not DB.exists():
        raise SystemExit(f"No database at {DB}")

    import sqlite3

    conn = sqlite3.connect(DB)
    rows = conn.execute(
        "SELECT id, slug, \"values\" FROM Recipe WHERE status = 'published'"
    ).fetchall()

    summary = {
        "mode": "dry-run" if dry_run else "apply",
        "recipesInspected": 0,
        "fieldsProposed": 0,
        "fieldsApplied": 0,
        "fieldsAlreadyCorrect": 0,
        "fieldsSkipped": 0,
        "fieldsConflict": 0,
        "recipesUpdated": 0,
    }

    for recipe_id, slug, raw in rows:
        if slug not in PATCHES:
            continue
        try:
            values = json.loads(raw or "{}")
        except json.JSONDecodeError:
            values = {}
        summary["recipesInspected"] += 1
        patch = PATCHES[slug]
        changed = False
        for field, proposed in patch.items():
            current = values.get(field)
            action, reason = plan_field(slug, field, current, proposed)
            print(
                json.dumps(
                    {
                        "slug": slug,
                        "field": field,
                        "current": current,
                        "proposed": proposed,
                        "action": action,
                        "reason": reason,
                    }
                )
            )
            if action == "APPLY":
                summary["fieldsProposed"] += 1
                changed = True
            elif action == "SKIP" and reason == "already correct":
                summary["fieldsAlreadyCorrect"] += 1
            elif action == "SKIP":
                summary["fieldsSkipped"] += 1
            elif action == "CONFLICT":
                summary["fieldsConflict"] += 1

        if changed and not dry_run:
            merged = apply_plan(values, slug)
            conn.execute(
                "UPDATE Recipe SET \"values\" = ? WHERE id = ?",
                (json.dumps(merged, ensure_ascii=False), recipe_id),
            )
            summary["recipesUpdated"] += 1
            summary["fieldsApplied"] = summary["fieldsProposed"]

    if not dry_run:
        conn.commit()
    conn.close()
    print(json.dumps(summary))


if __name__ == "__main__":
    main()
