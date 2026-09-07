/**
 * Optional one-off: register owned Recipe.values.image URLs as MediaAsset rows.
 * Does not mutate Recipe content. Safe to re-run (skips existing URLs).
 *
 * Usage: npx tsx scripts/backfill-media-assets.ts
 */
import { importOwnedRecipeImagesAsMediaAssets } from "../src/lib/media-asset-server.ts";

async function main() {
  const result = await importOwnedRecipeImagesAsMediaAssets();
  console.log(`MediaAsset backfill: created=${result.created} skipped=${result.skipped}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
