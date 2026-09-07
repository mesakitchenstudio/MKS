import { getDb } from "@/lib/db";

export const REDIRECT_MAX_HOPS = 5;

export type RedirectRecord = {
  id: string;
  fromPath: string;
  toPath: string;
  statusCode: number;
  isActive: boolean;
  source: string;
  createdAt: Date;
  updatedAt: Date;
};

/** Normalize a public pathname for storage and lookup. */
export function normalizeRedirectPath(input: string): string | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  let path = raw;
  try {
    if (/^https?:\/\//i.test(raw)) {
      path = new URL(raw).pathname;
    }
  } catch {
    return null;
  }
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.split("?")[0]?.split("#")[0] || path;
  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (path.length > 512) return null;
  if (!/^\/[a-zA-Z0-9/_-]*$/.test(path)) return null;
  return path;
}

export function recipePublicPath(slug: string): string {
  return `/recipes/${String(slug || "").trim()}`;
}

/**
 * Follow active redirects from `fromPath` up to REDIRECT_MAX_HOPS.
 * Returns the final destination pathname, or null when missing / cyclic / over limit.
 */
export function resolveRedirectChain(
  fromPath: string,
  lookup: (path: string) => { toPath: string; isActive: boolean } | null | undefined,
): string | null {
  const start = normalizeRedirectPath(fromPath);
  if (!start) return null;

  const seen = new Set<string>();
  let current = start;

  for (let hop = 0; hop < REDIRECT_MAX_HOPS; hop += 1) {
    if (seen.has(current)) return null;
    seen.add(current);

    const row = lookup(current);
    if (!row || !row.isActive) return null;

    const next = normalizeRedirectPath(row.toPath);
    if (!next || next === current) return null;

    const nextRow = lookup(next);
    if (!nextRow || !nextRow.isActive) return next;
    current = next;
  }

  return null;
}

/** Resolve an active redirect chain from the database. */
export async function resolveActiveRedirect(fromPath: string): Promise<string | null> {
  const start = normalizeRedirectPath(fromPath);
  if (!start) return null;

  const db = getDb();
  const cache = new Map<string, { toPath: string; isActive: boolean } | null>();

  const lookup = (path: string) => cache.get(path);

  // Warm the chain hop-by-hop (max 5 queries).
  let current = start;
  const seen = new Set<string>();
  for (let hop = 0; hop < REDIRECT_MAX_HOPS; hop += 1) {
    if (seen.has(current)) return null;
    seen.add(current);

    if (!cache.has(current)) {
      const found = await db.redirect.findUnique({
        where: { fromPath: current },
        select: { toPath: true, isActive: true },
      });
      cache.set(current, found);
    }

    const row = lookup(current);
    if (!row || !row.isActive) return null;

    const next = normalizeRedirectPath(row.toPath);
    if (!next || next === current) return null;

    if (!cache.has(next)) {
      const foundNext = await db.redirect.findUnique({
        where: { fromPath: next },
        select: { toPath: true, isActive: true },
      });
      cache.set(next, foundNext);
    }

    const nextRow = lookup(next);
    if (!nextRow || !nextRow.isActive) return next;
    current = next;
  }

  return null;
}

export type UpsertRecipeSlugRedirectResult =
  | { ok: true; id: string; fromPath: string; toPath: string }
  | { ok: false; reason: string };

/**
 * Create or update a redirect when a published recipe slug changes.
 * Draft-only renames do not create redirects.
 * Call AFTER the recipe row has been updated so the old slug is no longer live.
 */
export async function upsertRecipeSlugChangeRedirect(input: {
  previousSlug: string;
  nextSlug: string;
  wasPublished: boolean;
}): Promise<UpsertRecipeSlugRedirectResult | null> {
  if (!input.wasPublished) return null;
  if (input.previousSlug === input.nextSlug) return null;

  const fromPath = normalizeRedirectPath(recipePublicPath(input.previousSlug));
  const toPath = normalizeRedirectPath(recipePublicPath(input.nextSlug));
  if (!fromPath || !toPath) {
    return { ok: false, reason: "invalid_path" };
  }
  if (fromPath === toPath) return null;

  const db = getDb();

  // Refuse if old path is somehow still a published recipe (ordering bug / race).
  const liveAtFrom = await db.recipe.findFirst({
    where: { slug: input.previousSlug, status: "published" },
    select: { id: true },
  });
  if (liveAtFrom) {
    return { ok: false, reason: "from_path_is_live_recipe" };
  }

  // Break immediate reverse cycle (B→A when adding A→B).
  const reverse = await db.redirect.findFirst({
    where: { fromPath: toPath, toPath: fromPath, isActive: true },
    select: { id: true },
  });
  if (reverse) {
    await db.redirect.update({
      where: { id: reverse.id },
      data: { isActive: false },
    });
  }

  const existing = await db.redirect.findUnique({ where: { fromPath } });
  let result: { ok: true; id: string; fromPath: string; toPath: string };
  if (existing) {
    const updated = await db.redirect.update({
      where: { id: existing.id },
      data: {
        toPath,
        statusCode: 301,
        isActive: true,
        source: "recipe_slug_change",
      },
    });
    result = { ok: true, id: updated.id, fromPath, toPath };
  } else {
    const created = await db.redirect.create({
      data: {
        fromPath,
        toPath,
        statusCode: 301,
        isActive: true,
        source: "recipe_slug_change",
      },
    });
    result = { ok: true, id: created.id, fromPath, toPath };
  }

  // Flatten avoidable chains: anything that pointed at the old path now points at the new one.
  // Example: A→B then B→C becomes A→C and B→C (no A→B→C hop).
  await db.redirect.updateMany({
    where: {
      toPath: fromPath,
      isActive: true,
      NOT: { fromPath: toPath },
    },
    data: { toPath },
  });

  // Deactivate accidental self-redirects created by flattening edge cases.
  await db.redirect.updateMany({
    where: { fromPath: toPath, toPath, isActive: true },
    data: { isActive: false },
  });

  return result;
}

export async function listRedirectsForAdmin(): Promise<RedirectRecord[]> {
  return getDb().redirect.findMany({
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
  });
}

export async function setRedirectActive(id: string, isActive: boolean) {
  return getDb().redirect.update({
    where: { id },
    data: { isActive },
  });
}

/** True when a published recipe already occupies this public path. */
export async function isLivePublishedRecipePath(path: string): Promise<boolean> {
  const normalized = normalizeRedirectPath(path);
  if (!normalized?.startsWith("/recipes/")) return false;
  const slug = normalized.slice("/recipes/".length);
  if (!slug || slug.includes("/")) return false;
  const row = await getDb().recipe.findFirst({
    where: { slug, status: "published" },
    select: { id: true },
  });
  return Boolean(row);
}
