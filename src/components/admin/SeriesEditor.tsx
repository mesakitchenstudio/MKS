"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  deleteSeriesAction,
  keepRemovedSeriesItemAction,
  linkSeriesToYoutubePlaylistAction,
  refreshSeriesFromYoutubeAction,
  removeSeriesItemAction,
  saveSeriesAction,
} from "@/app/admin/actions";
import { CreateRecipeFromYoutubeVideo } from "@/components/admin/CreateRecipeFromYoutubeVideo";
import {
  SeriesAiFieldBadge,
  SeriesEditorialAiControls,
} from "@/components/admin/SeriesEditorialAiControls";
import {
  adminFocusRing,
  adminInputClass,
  adminLinkClass,
  adminPrimaryButtonClass,
  adminSelectClass,
} from "@/lib/admin-ui";
import type { AdminSeriesDetail, AdminSeriesItemDraft, SeriesPickerCandidate } from "@/lib/series-admin";
import { noteSeriesHumanEdit } from "@/lib/series-ai/provenance";
import {
  itemCustomDescriptionPath,
  itemCustomTitlePath,
  serializeSeriesAiMeta,
  type SeriesAiMeta,
} from "@/lib/series-ai/types";
import { slugify } from "@/lib/fields";
import { ADMIN_IMAGE_ACCEPT, RECIPE_HERO_IMAGE_HELP } from "@/lib/admin-upload";
import { youtubePlaylistUrl } from "@/lib/youtube";

const secondaryBtn =
  "inline-flex h-9 items-center justify-center rounded-sm border border-line bg-paper px-3 text-sm font-semibold text-muted hover:bg-cream hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

function formatSyncedAt(iso: string | null) {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function SeriesEditor({
  series,
  candidates,
  recipeTypes = [],
  linkablePlaylists = [],
  isNew = false,
}: {
  series: AdminSeriesDetail;
  candidates: SeriesPickerCandidate[];
  recipeTypes?: { id: string; name: string }[];
  linkablePlaylists?: { playlistId: string; title: string; videoCount: number }[];
  isNew?: boolean;
}) {
  const isYoutube = series.syncMode === "YOUTUBE" || Boolean(series.youtubePlaylistId);
  const [title, setTitle] = useState(series.title);
  const [slug, setSlug] = useState(series.slug);
  const [shortTitle, setShortTitle] = useState(series.shortTitle);
  const [description, setDescription] = useState(series.description);
  const [intro, setIntro] = useState(series.intro);
  const [heroImage, setHeroImage] = useState(series.heroImage);
  const [heroImageSource, setHeroImageSource] = useState(series.heroImageSource || "");
  const [heroSourceLabel, setHeroSourceLabel] = useState(series.heroSourceLabel || "");
  const [seoTitle, setSeoTitle] = useState(series.seoTitle);
  const [seoDescription, setSeoDescription] = useState(series.seoDescription);
  const [followYoutubeOrder, setFollowYoutubeOrder] = useState(series.followYoutubeOrder);
  const [isPublished, setIsPublished] = useState(series.isPublished);
  const [sortOrder, setSortOrder] = useState(String(series.sortOrder));
  const [items, setItems] = useState<AdminSeriesItemDraft[]>(series.items);
  const [aiMeta, setAiMeta] = useState<SeriesAiMeta>(series.aiMeta);
  const [featuredChosenByHuman, setFeaturedChosenByHuman] = useState(
    Boolean(series.aiMeta.featuredChosenByHuman),
  );
  const [query, setQuery] = useState("");
  const [formatFilter, setFormatFilter] = useState("all");
  const [linkFilter, setLinkFilter] = useState("all");
  const [uploading, setUploading] = useState(false);
  const [linkPlaylistId, setLinkPlaylistId] = useState("");

  useEffect(() => {
    setTitle(series.title);
    setSlug(series.slug);
    setShortTitle(series.shortTitle);
    setDescription(series.description);
    setIntro(series.intro);
    setHeroImage(series.heroImage);
    setHeroImageSource(series.heroImageSource || "");
    setHeroSourceLabel(series.heroSourceLabel || "");
    setSeoTitle(series.seoTitle);
    setSeoDescription(series.seoDescription);
    setFollowYoutubeOrder(series.followYoutubeOrder);
    setIsPublished(series.isPublished);
    setSortOrder(String(series.sortOrder));
    setItems(series.items);
    setAiMeta(series.aiMeta);
    setFeaturedChosenByHuman(Boolean(series.aiMeta.featuredChosenByHuman));
  }, [series]);

  function markScalarEdit(path: string, nextValue: string) {
    setAiMeta((current) => noteSeriesHumanEdit(current, path, nextValue));
  }

  const playlistUrl = series.youtubePlaylistId
    ? youtubePlaylistUrl(series.youtubePlaylistId)
    : null;

  const filteredCandidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates.filter((c) => {
      if (formatFilter === "LONG" && c.format !== "LONG") return false;
      if (formatFilter === "SHORT" && c.format !== "SHORT") return false;
      if (linkFilter === "linked" && !c.youtubeVideoId) return false;
      if (linkFilter === "unlinked" && c.youtubeVideoId) return false;
      if (linkFilter === "published" && !c.published) return false;
      if (!q) return true;
      const hay = [
        c.recipeTitle,
        c.youtubeTitle,
        c.typeName,
        c.recipeSlug,
        c.youtubeVideoId,
        ...c.categorySlugs,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [candidates, formatFilter, linkFilter, query]);

  function addCandidate(c: SeriesPickerCandidate) {
    const exists = items.some(
      (item) =>
        (c.recipeId && item.recipeId === c.recipeId) ||
        (c.youtubeVideoId && item.youtubeVideoId === c.youtubeVideoId && !c.recipeId),
    );
    if (exists) return;
    setItems((current) => [
      ...current,
      {
        recipeId: c.recipeId,
        youtubeVideoId: c.youtubeVideoId,
        customTitle: "",
        customDescription: "",
        featured: current.length === 0,
        sortOrder: current.length,
        removedFromPlaylist: false,
        label: c.recipeTitle || c.youtubeTitle || "Item",
        thumbnail: c.thumbnail,
        meta: [c.typeName, c.format, c.status].filter(Boolean).join(" · "),
        status: c.recipeId ? (c.published ? "ready" : "recipe_unpublished") : "video_only",
        recipeSlug: c.recipeSlug,
        recipePublished: c.published,
        videoPrivacy: "public",
        videoEmbeddable: true,
      },
    ]);
  }

  function moveItem(index: number, direction: -1 | 1) {
    if (isYoutube && followYoutubeOrder) return;
    setItems((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      const tmp = next[index];
      next[index] = next[target];
      next[target] = tmp;
      return next.map((item, i) => ({ ...item, sortOrder: i }));
    });
  }

  function setFeatured(index: number) {
    setFeaturedChosenByHuman(true);
    setAiMeta((current) => ({ ...current, featuredChosenByHuman: true }));
    setItems((current) => current.map((item, i) => ({ ...item, featured: i === index })));
  }

  async function onHeroUpload(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/admin/upload", { method: "POST", body });
      const data = (await response.json()) as { ok?: boolean; url?: string; message?: string };
      if (response.ok && data.url) {
        setHeroImage(data.url);
        setHeroImageSource("manual");
        setHeroSourceLabel("Manual upload");
      } else window.alert(data.message || "Upload failed.");
    } catch {
      window.alert("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-8">
      <form action={saveSeriesAction} className="space-y-8">
        {!isNew ? <input type="hidden" name="id" value={series.id} /> : null}
        <input type="hidden" name="seriesId" value={series.id} />
        <input type="hidden" name="itemsJson" value={JSON.stringify(items)} />
        <input type="hidden" name="followYoutubeOrder" value={followYoutubeOrder ? "1" : "0"} />
        <input type="hidden" name="heroImageSource" value={heroImageSource} />
        <input type="hidden" name="aiMetaJson" value={serializeSeriesAiMeta(aiMeta)} />
        <input type="hidden" name="featuredChosenByHuman" value={featuredChosenByHuman ? "1" : "0"} />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl text-ink">{isNew ? "New custom series" : "Edit series"}</h1>
            <p className="mt-1 text-sm text-muted">
              {isYoutube
                ? "YouTube playlist supplies membership/order; Mesa owns editorial SEO and CTAs."
                : "Mesa-only collection — recipes and videos you curate by hand."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!isNew && series.isPublished ? (
              <Link href={`/series/${series.slug}`} className={`${secondaryBtn} ${adminFocusRing}`} target="_blank">
                Preview
              </Link>
            ) : null}
            <button type="submit" className={`${adminPrimaryButtonClass} ${adminFocusRing}`}>
              Save series
            </button>
          </div>
        </div>

        {isYoutube && !isNew ? (
          <section className="space-y-3 rounded-sm border border-olive/30 bg-olive/5 p-4">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
              YouTube playlist data
            </p>
            <div className="flex flex-wrap items-start gap-4">
              {series.youtubePlaylistThumbnail ? (
                <div className="relative h-20 w-36 shrink-0 overflow-hidden border border-line bg-sand">
                  <Image
                    src={series.youtubePlaylistThumbnail}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="9rem"
                  />
                </div>
              ) : null}
              <div className="min-w-0 flex-1 space-y-1 text-sm">
                <p>
                  <span className="font-semibold text-ink">Playlist:</span>{" "}
                  {series.youtubePlaylistTitle || "Untitled"}
                </p>
                <p className="text-muted">
                  ID: <span className="font-mono text-xs">{series.youtubePlaylistId}</span>
                </p>
                <p className="text-muted">
                  Videos (active): {items.filter((i) => !i.removedFromPlaylist).length}
                </p>
                <p className="text-muted">Last refreshed: {formatSyncedAt(series.youtubePlaylistLastSyncedAt)}</p>
                <p className="text-muted">
                  Order: {followYoutubeOrder ? "Follow YouTube playlist order" : "Custom Mesa order"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                formAction={refreshSeriesFromYoutubeAction}
                className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
              >
                Refresh from YouTube
              </button>
              {playlistUrl ? (
                <a
                  href={playlistUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${secondaryBtn} ${adminFocusRing}`}
                >
                  View playlist on YouTube
                </a>
              ) : null}
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={followYoutubeOrder}
                onChange={(e) => setFollowYoutubeOrder(e.target.checked)}
              />
              Follow YouTube playlist order on refresh
            </label>
            <p className="text-xs text-muted">
              Refresh updates playlist membership and snapshots only. Mesa title, intro, SEO, hero,
              published state, and recipe content are never overwritten.
            </p>
          </section>
        ) : null}

        <section className="space-y-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
            Mesa editorial data
          </p>
          {!isNew ? (
            <SeriesEditorialAiControls seriesId={series.id} aiMeta={aiMeta} />
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">
                Mesa title
                <SeriesAiFieldBadge path="title" aiMeta={aiMeta} />
              </span>
              <input
                className={adminInputClass}
                name="title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  markScalarEdit("title", e.target.value);
                  if (isNew) setSlug(slugify(e.target.value));
                }}
                required
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Slug</span>
              <input
                className={adminInputClass}
                name="slug"
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
                disabled={!isNew}
                required={isNew}
              />
              {!isNew ? <span className="text-xs text-muted">Slug is locked after create.</span> : null}
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">
                Short title
                <SeriesAiFieldBadge path="shortTitle" aiMeta={aiMeta} />
              </span>
              <input
                className={adminInputClass}
                name="shortTitle"
                value={shortTitle}
                onChange={(e) => {
                  setShortTitle(e.target.value);
                  markScalarEdit("shortTitle", e.target.value);
                }}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Sort order</span>
              <input
                className={adminInputClass}
                name="sortOrder"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm md:col-span-2">
              <span className="font-semibold">
                Description
                <SeriesAiFieldBadge path="description" aiMeta={aiMeta} />
              </span>
              <textarea
                className={`${adminInputClass} min-h-20`}
                name="description"
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  markScalarEdit("description", e.target.value);
                }}
              />
            </label>
            <label className="grid gap-1 text-sm md:col-span-2">
              <span className="font-semibold">
                Intro
                <SeriesAiFieldBadge path="intro" aiMeta={aiMeta} />
              </span>
              <textarea
                className={`${adminInputClass} min-h-24`}
                name="intro"
                value={intro}
                onChange={(e) => {
                  setIntro(e.target.value);
                  markScalarEdit("intro", e.target.value);
                }}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">
                SEO title
                <SeriesAiFieldBadge path="seoTitle" aiMeta={aiMeta} />
              </span>
              <input
                className={adminInputClass}
                name="seoTitle"
                value={seoTitle}
                onChange={(e) => {
                  setSeoTitle(e.target.value);
                  markScalarEdit("seoTitle", e.target.value);
                }}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">
                SEO description
                <SeriesAiFieldBadge path="seoDescription" aiMeta={aiMeta} />
              </span>
              <input
                className={adminInputClass}
                name="seoDescription"
                value={seoDescription}
                onChange={(e) => {
                  setSeoDescription(e.target.value);
                  markScalarEdit("seoDescription", e.target.value);
                }}
              />
            </label>
            <div className="grid gap-2 md:col-span-2">
              <span className="text-sm font-semibold">
                Hero image
                {heroImageSource.startsWith("auto_") ? (
                  <span className="ml-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-olive">
                    Auto hero
                  </span>
                ) : heroImageSource === "manual" ? (
                  <span className="ml-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
                    Manual
                  </span>
                ) : null}
              </span>
              <input type="hidden" name="heroImage" value={heroImage} />
              {heroImage ? (
                <div className="relative aspect-video max-w-md overflow-hidden border border-line bg-sand">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={heroImage} alt="" className="h-full w-full object-cover" />
                </div>
              ) : null}
              {heroImage && heroSourceLabel ? (
                <p className="text-xs text-muted">Source: {heroSourceLabel}</p>
              ) : null}
              <input
                type="file"
                accept={ADMIN_IMAGE_ACCEPT}
                disabled={uploading}
                onChange={(e) => void onHeroUpload(e.target.files?.[0] || null)}
              />
              <p className="text-xs text-muted">{RECIPE_HERO_IMAGE_HELP}</p>
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold md:col-span-2">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
              />
              Published
              <input type="hidden" name="isPublished" value={isPublished ? "1" : "0"} />
            </label>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="font-serif text-xl text-ink">Series items</h2>
            <p className="mt-1 text-sm text-muted">
              {isYoutube && followYoutubeOrder
                ? "Order follows the YouTube playlist on refresh. You can still edit Mesa copy per item."
                : "Order controls the public page sequence."}
            </p>
          </div>

          <div className="space-y-3">
            {items.length === 0 ? (
              <p className="text-sm text-muted">No items yet. Add content from the picker below.</p>
            ) : (
              items.map((item, index) => (
                <div
                  key={item.id || `${item.recipeId}-${item.youtubeVideoId}-${index}`}
                  className={`flex flex-wrap items-start gap-3 border p-3 ${
                    item.removedFromPlaylist
                      ? "border-terracotta/40 bg-terracotta/5"
                      : "border-line bg-paper"
                  }`}
                >
                  <div className="relative h-16 w-28 shrink-0 overflow-hidden border border-line bg-sand">
                    {item.thumbnail ? (
                      <Image src={item.thumbnail} alt="" fill className="object-cover" sizes="7rem" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="font-semibold text-ink">{item.label}</p>
                    <p className="text-xs text-muted">{item.meta}</p>
                    {item.removedFromPlaylist && item.id ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="submit"
                          formAction={keepRemovedSeriesItemAction}
                          name="itemId"
                          value={item.id}
                          className={secondaryBtn}
                        >
                          Keep in Mesa Series
                        </button>
                        <button
                          type="submit"
                          formAction={removeSeriesItemAction}
                          name="itemId"
                          value={item.id}
                          className={secondaryBtn}
                          onClick={(event) => {
                            if (!window.confirm("Remove this item from the Series permanently?")) {
                              event.preventDefault();
                            }
                          }}
                        >
                          Remove from Series
                        </button>
                      </div>
                    ) : null}
                    {item.status === "video_only" && item.youtubeVideoId && recipeTypes.length > 0 ? (
                      <CreateRecipeFromYoutubeVideo
                        videoId={item.youtubeVideoId}
                        recipeTypes={recipeTypes}
                      />
                    ) : null}
                    {item.recipeSlug ? (
                      <Link href={`/admin/recipes`} className={`${adminLinkClass} text-xs`}>
                        Recipe: {item.recipeSlug}
                      </Link>
                    ) : null}
                    <label className="grid gap-1 text-sm">
                      <span className="text-xs font-semibold text-muted">
                        Custom title
                        {item.id ? (
                          <SeriesAiFieldBadge path={itemCustomTitlePath(item.id)} aiMeta={aiMeta} />
                        ) : null}
                      </span>
                      <input
                        className={adminInputClass}
                        placeholder="Custom title (optional)"
                        value={item.customTitle}
                        onChange={(e) => {
                          const next = e.target.value;
                          if (item.id) {
                            setAiMeta((current) =>
                              noteSeriesHumanEdit(current, itemCustomTitlePath(item.id!), next),
                            );
                          }
                          setItems((current) =>
                            current.map((row, i) => (i === index ? { ...row, customTitle: next } : row)),
                          );
                        }}
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="text-xs font-semibold text-muted">
                        Short description
                        {item.id ? (
                          <SeriesAiFieldBadge
                            path={itemCustomDescriptionPath(item.id)}
                            aiMeta={aiMeta}
                          />
                        ) : null}
                      </span>
                      <textarea
                        className={`${adminInputClass} min-h-16`}
                        placeholder="Short description (optional)"
                        value={item.customDescription}
                        onChange={(e) => {
                          const next = e.target.value;
                          if (item.id) {
                            setAiMeta((current) =>
                              noteSeriesHumanEdit(
                                current,
                                itemCustomDescriptionPath(item.id!),
                                next,
                              ),
                            );
                          }
                          setItems((current) =>
                            current.map((row, i) =>
                              i === index ? { ...row, customDescription: next } : row,
                            ),
                          );
                        }}
                      />
                    </label>
                  </div>
                  <div className="flex flex-col gap-2">
                    {!(isYoutube && followYoutubeOrder) ? (
                      <>
                        <button type="button" className={secondaryBtn} onClick={() => moveItem(index, -1)}>
                          Up
                        </button>
                        <button type="button" className={secondaryBtn} onClick={() => moveItem(index, 1)}>
                          Down
                        </button>
                      </>
                    ) : null}
                    <button type="button" className={secondaryBtn} onClick={() => setFeatured(index)}>
                      {item.featured ? "Featured" : "Feature"}
                    </button>
                    {!item.removedFromPlaylist ? (
                      <button
                        type="button"
                        className={secondaryBtn}
                        onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="rounded-sm border border-line bg-cream/30 p-4">
            <h3 className="text-sm font-semibold text-ink">
              {isYoutube ? "Add extra Mesa items (optional)" : "Add content"}
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                className={`${adminInputClass} min-w-[12rem] flex-1`}
                placeholder="Search recipes, videos, types…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select
                className={adminSelectClass}
                value={formatFilter}
                onChange={(e) => setFormatFilter(e.target.value)}
              >
                <option value="all">All formats</option>
                <option value="LONG">Long-form</option>
                <option value="SHORT">Shorts</option>
              </select>
              <select
                className={adminSelectClass}
                value={linkFilter}
                onChange={(e) => setLinkFilter(e.target.value)}
              >
                <option value="all">All content</option>
                <option value="linked">Linked YouTube</option>
                <option value="unlinked">No YouTube</option>
                <option value="published">Published recipes</option>
              </select>
            </div>
            <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
              {filteredCandidates.slice(0, 40).map((c) => (
                <li key={c.key} className="flex items-center gap-3 border border-line/70 bg-paper px-2 py-2">
                  <div className="relative h-12 w-20 shrink-0 overflow-hidden bg-sand">
                    {c.thumbnail ? (
                      <Image src={c.thumbnail} alt="" fill className="object-cover" sizes="5rem" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      {c.recipeTitle || c.youtubeTitle}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {[c.youtubeTitle && c.recipeTitle ? c.youtubeTitle : null, c.typeName, c.format, c.status]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <button type="button" className={`${adminLinkClass} text-sm`} onClick={() => addCandidate(c)}>
                    Add
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </form>

      {!isYoutube && !isNew && linkablePlaylists.length > 0 ? (
        <section className="space-y-3 rounded-sm border border-line bg-cream/40 p-4">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">
            Optional YouTube link
          </p>
          <p className="text-sm text-muted">
            Link this custom Series to a channel playlist to enable safe refresh later.
          </p>
          <form
            action={linkSeriesToYoutubePlaylistAction}
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              if (
                !window.confirm(
                  "Link this Series to the selected YouTube playlist? Membership will import from YouTube; Mesa editorial fields stay unchanged.",
                )
              ) {
                event.preventDefault();
              }
            }}
          >
            <input type="hidden" name="id" value={series.id} />
            <label className="grid min-w-[14rem] flex-1 gap-1 text-sm">
              <span className="font-semibold">Playlist</span>
              <select
                className={adminSelectClass}
                name="playlistId"
                value={linkPlaylistId}
                onChange={(e) => setLinkPlaylistId(e.target.value)}
                required
              >
                <option value="">Select playlist…</option>
                {linkablePlaylists.map((p) => (
                  <option key={p.playlistId} value={p.playlistId}>
                    {p.title} ({p.videoCount})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={!linkPlaylistId}
              className={`${secondaryBtn} ${adminFocusRing} disabled:opacity-50`}
            >
              Link / import from YouTube playlist
            </button>
          </form>
        </section>
      ) : null}

      {!isNew ? (
        <div className="border-t border-line pt-6">
          <form
            action={deleteSeriesAction}
            onSubmit={(event) => {
              if (!window.confirm("Delete this series permanently?")) event.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={series.id} />
            <button type="submit" className="text-sm font-semibold text-terracotta hover:underline">
              Delete series
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
