/**
 * Local-first Recently Viewed recipes.
 * Browser-only convenience — not analytics, not member history, not cross-device.
 */

export const RECENTLY_VIEWED_STORAGE_KEY = "mesa:recently-viewed:v1";
export const RECENTLY_VIEWED_CHANGED_EVENT = "mesa-recently-viewed-changed";

/** Keep a short local list; UI shows fewer. */
export const RECENTLY_VIEWED_MAX_STORED = 12;
export const RECENTLY_VIEWED_MAX_DISPLAY = 4;
/** Hide the shelf until the visitor has looked at at least this many recipes. */
export const RECENTLY_VIEWED_MIN_DISPLAY = 2;
/** Lazy TTL — expired entries are dropped on read/parse/write (no cron). */
export const RECENTLY_VIEWED_MAX_AGE_DAYS = 90;

export type RecentlyViewedRecipe = {
  /** Stable public identity (`publicRecipeId`). */
  id: string;
  slug: string;
  title: string;
  image: string;
  imageAlt: string;
  viewedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isRecentlyViewedExpired(
  entry: Pick<RecentlyViewedRecipe, "viewedAt">,
  nowMs = Date.now(),
): boolean {
  const viewedAt = Date.parse(entry.viewedAt);
  if (!Number.isFinite(viewedAt)) return true;
  const maxAgeMs = RECENTLY_VIEWED_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  return nowMs - viewedAt > maxAgeMs;
}

export function filterFreshRecentlyViewed(
  entries: RecentlyViewedRecipe[],
  nowMs = Date.now(),
): RecentlyViewedRecipe[] {
  return entries.filter((entry) => !isRecentlyViewedExpired(entry, nowMs));
}

export function normalizeRecentlyViewedEntry(raw: unknown): RecentlyViewedRecipe | null {
  if (!isRecord(raw)) return null;
  const id = String(raw.id ?? "").trim();
  const slug = String(raw.slug ?? "").trim();
  const title = String(raw.title ?? "").trim();
  const image = String(raw.image ?? "").trim();
  if (!id || !slug || !title || !image) return null;
  const imageAlt = String(raw.imageAlt ?? "").trim() || title;
  const viewedAt = String(raw.viewedAt ?? "").trim() || new Date(0).toISOString();
  return { id, slug, title, image, imageAlt, viewedAt };
}

export function parseRecentlyViewedList(
  raw: string | null | undefined,
  nowMs = Date.now(),
): RecentlyViewedRecipe[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: RecentlyViewedRecipe[] = [];
    for (const item of parsed) {
      const entry = normalizeRecentlyViewedEntry(item);
      if (!entry || seen.has(entry.id)) continue;
      if (isRecentlyViewedExpired(entry, nowMs)) continue;
      seen.add(entry.id);
      out.push(entry);
      if (out.length >= RECENTLY_VIEWED_MAX_STORED) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Pure upsert: move to front, dedupe by id, expire, cap. */
export function mergeRecentlyViewedEntry(
  existing: RecentlyViewedRecipe[],
  entry: RecentlyViewedRecipe,
  options?: { nowMs?: number; max?: number },
): RecentlyViewedRecipe[] {
  const nowMs = options?.nowMs ?? Date.now();
  const max = options?.max ?? RECENTLY_VIEWED_MAX_STORED;
  const fresh = filterFreshRecentlyViewed(existing, nowMs);
  return [entry, ...fresh.filter((item) => item.id !== entry.id)].slice(0, max);
}

export function readRecentlyViewed(): RecentlyViewedRecipe[] {
  if (typeof window === "undefined") return [];
  try {
    return parseRecentlyViewedList(localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function writeRecentlyViewed(entries: RecentlyViewedRecipe[]) {
  if (typeof window === "undefined") return;
  const normalized = parseRecentlyViewedList(JSON.stringify(entries)).slice(
    0,
    RECENTLY_VIEWED_MAX_STORED,
  );
  try {
    localStorage.setItem(RECENTLY_VIEWED_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    return;
  }
  window.dispatchEvent(new Event(RECENTLY_VIEWED_CHANGED_EVENT));
}

/** Move recipe to the front; dedupe by stable id. */
export function recordRecentlyViewed(
  input: Omit<RecentlyViewedRecipe, "viewedAt"> & { viewedAt?: string },
): RecentlyViewedRecipe[] {
  const entry = normalizeRecentlyViewedEntry({
    ...input,
    viewedAt: input.viewedAt ?? new Date().toISOString(),
  });
  if (!entry) return readRecentlyViewed();

  const next = mergeRecentlyViewedEntry(readRecentlyViewed(), entry);
  writeRecentlyViewed(next);
  return next;
}

export function clearRecentlyViewed() {
  writeRecentlyViewed([]);
}

/**
 * Join local history against the live catalogue.
 * Prefer stable id, then slug; refresh display fields from live recipe when found.
 * Missing / unpublished recipes are omitted (never surfaced from stale local data).
 */
export function resolveRecentlyViewedRecipes<
  T extends { id?: string | null; slug: string; title: string; image: string; imageAlt: string },
>(
  recent: RecentlyViewedRecipe[],
  catalogue: T[],
  options?: { limit?: number },
): T[] {
  const limit = options?.limit ?? RECENTLY_VIEWED_MAX_DISPLAY;
  const byId = new Map<string, T>();
  const bySlug = new Map<string, T>();
  for (const recipe of catalogue) {
    const id = recipe.id?.trim();
    if (id) byId.set(id, recipe);
    bySlug.set(recipe.slug, recipe);
  }

  const resolved: T[] = [];
  const seen = new Set<string>();
  for (const entry of recent) {
    const live = byId.get(entry.id) ?? bySlug.get(entry.slug);
    if (!live) continue;
    const key = live.id?.trim() || live.slug;
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push(live);
    if (resolved.length >= limit) break;
  }
  return resolved;
}

export function subscribeRecentlyViewed(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === RECENTLY_VIEWED_STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener(RECENTLY_VIEWED_CHANGED_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(RECENTLY_VIEWED_CHANGED_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Responsive grid columns matching Homepage / Member Home shelves. */
export function recentlyViewedGridClass(count: number): string {
  if (count >= 4) return "grid gap-8 sm:grid-cols-2 lg:grid-cols-4";
  if (count === 3) return "grid gap-8 sm:grid-cols-2 lg:grid-cols-3";
  return "grid gap-8 sm:grid-cols-2";
}
