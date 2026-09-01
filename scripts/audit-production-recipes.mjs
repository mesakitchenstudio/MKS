import { getDb } from "../src/lib/db.ts";
import { parseValues } from "../src/lib/recipe-map.ts";
import {
  formatTime,
  totalMinutes,
  countedHeatMinutes,
} from "../src/lib/recipe-utils.ts";
import { publicRestMinutes, riseHoursFromExtras } from "../src/lib/recipe-timing.ts";

const prisma = getDb();

function imageHost(url) {
  if (!url) return "empty";
  if (url.startsWith("/")) return "local-path";
  try {
    return new URL(url).hostname;
  } catch {
    return "invalid-url";
  }
}

function extrasFromRow(row, values) {
  const typeFields = row.type?.fields || [];
  return typeFields.map((f) => ({ key: f.key, value: values[f.key] }));
}

const rows = await prisma.recipe.findMany({
  where: { status: "published" },
  include: {
    categories: { include: { category: true } },
    type: { include: { fields: true } },
  },
  orderBy: { title: "asc" },
});

for (const row of rows) {
  const values = parseValues(row.values);
  const extras = extrasFromRow(row, values);
  const recipeLike = {
    prepMinutes: values.prepMinutes ?? 0,
    cookMinutes: values.cookMinutes ?? 0,
    bakeMinutes: values.bakeMinutes ?? 0,
    restMinutes: values.restMinutes ?? 0,
    extras: extras.map((e) => ({
      key: e.key,
      label: e.key,
      kind: "number",
      value: e.value,
    })),
  };
  const riseHours = riseHoursFromExtras(recipeLike);
  const gallery = Array.isArray(values.gallery) ? values.gallery : [];

  console.log(
    JSON.stringify({
      title: row.title,
      slug: row.slug,
      image: values.image || "",
      imageAlt: values.imageAlt || "",
      imageHost: imageHost(String(values.image || "")),
      gallery: gallery.slice(0, 8),
      prepMinutes: values.prepMinutes,
      cookMinutes: values.cookMinutes,
      bakeMinutes: values.bakeMinutes,
      restMinutes: values.restMinutes,
      riseHours,
      riseHoursField: values.riseHours,
      cardTotal: formatTime(totalMinutes(recipeLike)),
      heat: countedHeatMinutes(recipeLike),
      publicRest: publicRestMinutes(recipeLike),
      servings: values.servings,
      servingsUnit: values.servingsUnit,
      excerpt: row.excerpt,
    }),
  );
}

console.log(JSON.stringify({ publishedCount: rows.length }));
await prisma.$disconnect();
