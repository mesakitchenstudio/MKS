"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  deleteSeriesAction,
  keepRemovedSeriesItemAction,
  linkSeriesToYoutubePlaylistAction,
  refreshSeriesFromYoutubeAction,
  removeSeriesItemAction,
  saveSeriesAction,
} from "@/app/admin/actions";
import { CreateRecipeFromYoutubeVideo } from "@/components/admin/CreateRecipeFromYoutubeVideo";
import { EditorStatusBadge } from "@/components/admin/EditorStatusBadge";
import {
  SeriesAiFieldBadge,
  SeriesEditorialAiControls,
  seriesAiAssistanceSummary,
} from "@/components/admin/SeriesEditorialAiControls";
import {
  adminFocusRing,
  adminInputClass,
  adminPrimaryButtonClass,
  adminRecipeEditorStickyBleedClass,
  adminSecondaryButtonClass,
  adminSelectClass,
} from "@/lib/admin-ui";
import type {
  AdminSeriesDetail,
  AdminSeriesItemDraft,
  AdminSeriesItemStatus,
  SeriesPickerCandidate,
} from "@/lib/series-admin";
import { noteSeriesHumanEdit, markSeriesAiVerified } from "@/lib/series-ai/provenance";
import {
  itemCustomDescriptionPath,
  itemCustomTitlePath,
  serializeSeriesAiMeta,
  type SeriesAiMeta,
} from "@/lib/series-ai/types";
import { slugify } from "@/lib/fields";
import {
  ADMIN_IMAGE_ACCEPT,
  RECIPE_HERO_IMAGE_HELP,
  resolveAdminImageUploadPolicy,
  validateAdminImageFile,
} from "@/lib/admin-upload";
import { youtubePlaylistUrl } from "@/lib/youtube";

const sectionLabelClass =
  "text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive";

function seriesFormSnapshot(data: {
  title: string;
  slug: string;
  shortTitle: string;
  description: string;
  intro: string;
  heroImage: string;
  heroImageSource: string;
  seoTitle: string;
  seoDescription: string;
  followYoutubeOrder: boolean;
  sortOrder: string;
  items: AdminSeriesItemDraft[];
  aiMeta: SeriesAiMeta;
  featuredChosenByHuman: boolean;
}) {
  return JSON.stringify(data);
}

function validateSeriesForPublish(title: string, slug: string, isNew: boolean): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!title.trim()) {
    errors.title = "Title is required before publishing.";
  }
  if (isNew && !slug.trim()) {
    errors.slug = "Slug is required before publishing.";
  }
  return errors;
}

function formatSyncedAt(iso: string | null) {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function itemStatusLabel(status: AdminSeriesItemStatus) {
  switch (status) {
    case "ready":
      return "Ready";
    case "video_only":
      return "Create recipe";
    case "recipe_unpublished":
      return "Recipe unpublished";
    case "removed_from_playlist":
      return "No longer in YouTube playlist";
    default:
      return "Video unavailable";
  }
}

function itemCompactMeta(item: AdminSeriesItemDraft) {
  const bits: string[] = [];
  if (item.recipeSlug) bits.push(`Recipe · ${item.recipeSlug}`);
  else if (item.recipeId) bits.push("Recipe");
  if (item.youtubeVideoId) bits.push(`Video · ${item.youtubeVideoId}`);
  bits.push(itemStatusLabel(item.status));
  return bits.join(" · ");
}

function removeItemConfirmMessage(item: AdminSeriesItemDraft) {
  if (item.youtubeVideoId) {
    return "Remove this item from the Series? If it remains in the linked YouTube playlist, it may return after a future refresh.";
  }
  return "Remove this item from the Series?";
}

function pickerFormatLabel(format: string) {
  if (!format || format === "UNKNOWN") return null;
  if (format === "LONG") return "Long-form";
  if (format === "SHORT") return "Shorts";
  return format;
}

function pickerCandidateMeta(c: SeriesPickerCandidate) {
  return [
    c.youtubeTitle && c.recipeTitle ? c.youtubeTitle : null,
    c.typeName,
    pickerFormatLabel(c.format),
    c.status,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function SeriesEditor({
  series,
  candidates,
  recipeTypes = [],
  linkablePlaylists = [],
  isNew = false,
  saved = false,
}: {
  series: AdminSeriesDetail;
  candidates: SeriesPickerCandidate[];
  recipeTypes?: { id: string; name: string }[];
  linkablePlaylists?: { playlistId: string; title: string; videoCount: number }[];
  isNew?: boolean;
  saved?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const isPublishedRef = useRef<HTMLInputElement>(null);
  const moveToDraftCancelRef = useRef<HTMLButtonElement>(null);
  const moveToDraftTitleId = useId();
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
  const [moveToDraftOpen, setMoveToDraftOpen] = useState(false);
  const [publishAiWarningOpen, setPublishAiWarningOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [publishAlert, setPublishAlert] = useState("");

  const baselineSnapshot = useMemo(
    () =>
      seriesFormSnapshot({
        title: series.title,
        slug: series.slug,
        shortTitle: series.shortTitle,
        description: series.description,
        intro: series.intro,
        heroImage: series.heroImage,
        heroImageSource: series.heroImageSource || "",
        seoTitle: series.seoTitle,
        seoDescription: series.seoDescription,
        followYoutubeOrder: series.followYoutubeOrder,
        sortOrder: String(series.sortOrder),
        items: series.items,
        aiMeta: series.aiMeta,
        featuredChosenByHuman: Boolean(series.aiMeta.featuredChosenByHuman),
      }),
    [series],
  );

  const isDirty = useMemo(
    () =>
      seriesFormSnapshot({
        title,
        slug,
        shortTitle,
        description,
        intro,
        heroImage,
        heroImageSource,
        seoTitle,
        seoDescription,
        followYoutubeOrder,
        sortOrder,
        items,
        aiMeta,
        featuredChosenByHuman,
      }) !== baselineSnapshot,
    [
      aiMeta,
      baselineSnapshot,
      description,
      featuredChosenByHuman,
      followYoutubeOrder,
      heroImage,
      heroImageSource,
      intro,
      items,
      seoDescription,
      seoTitle,
      shortTitle,
      slug,
      sortOrder,
      title,
    ],
  );

  const draftActionLabel = isPublished ? "Move to draft" : "Save draft";
  const publishButtonLabel = isPublished ? "Update published series" : "Publish";
  const pageTitle = title.trim() || (isNew ? "New custom series" : "Edit series");
  const aiSummary = seriesAiAssistanceSummary(aiMeta);
  const showAiHeaderNote =
    aiMeta.generatedByAI ||
    aiMeta.verificationStatus === "verified" ||
    Boolean(aiMeta.draftStatus);

  useEffect(() => {
    if (!moveToDraftOpen) return;
    moveToDraftCancelRef.current?.focus();
  }, [moveToDraftOpen]);

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
    const formatBit = pickerFormatLabel(c.format);
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
        meta: [c.typeName, formatBit, c.status].filter(Boolean).join(" · "),
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

  function removeLocalItem(index: number) {
    const item = items[index];
    if (!item) return;
    if (!window.confirm(removeItemConfirmMessage(item))) return;
    setItems((current) => current.filter((_, i) => i !== index));
  }

  function submitWithPublished(nextPublished: boolean) {
    setIsPublished(nextPublished);
    if (isPublishedRef.current) isPublishedRef.current.value = nextPublished ? "1" : "0";
    formRef.current?.requestSubmit();
  }

  function proceedSaveDraft() {
    setFieldErrors({});
    setPublishAlert("");
    setMoveToDraftOpen(false);
    submitWithPublished(false);
  }

  function attemptSaveDraft() {
    if (!title.trim()) {
      setFieldErrors({ title: "Title is required to save a draft." });
      setPublishAlert("");
      return;
    }
    if (isPublished) {
      setMoveToDraftOpen(true);
      return;
    }
    proceedSaveDraft();
  }

  function attemptPublish() {
    const errors = validateSeriesForPublish(title, slug, isNew);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const count = Object.keys(errors).length;
      setPublishAlert(
        count === 1
          ? "1 issue must be resolved before publishing."
          : `${count} issues must be resolved before publishing.`,
      );
      return;
    }
    setFieldErrors({});
    setPublishAlert("");
    if (aiMeta.generatedByAI && aiMeta.verificationStatus !== "verified") {
      setPublishAiWarningOpen(true);
      return;
    }
    submitWithPublished(true);
  }

  function proceedPublishAnyway() {
    setPublishAiWarningOpen(false);
    submitWithPublished(true);
  }

  function markSeriesVerified() {
    setAiMeta((current) => markSeriesAiVerified(current));
  }

  async function onHeroUpload(file: File | null) {
    if (!file) return;
    const policy = resolveAdminImageUploadPolicy("series");
    const localCheck = validateAdminImageFile(file, policy);
    if (!localCheck.ok) {
      window.alert(localCheck.error);
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("folder", "series");
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

  const seriesContentHelper = isYoutube
    ? "Playlist membership can refresh from YouTube. Mesa titles and descriptions remain editable here."
    : "Add recipes and videos to curate this Mesa-only collection.";

  return (
    <div className="relative isolate min-w-0 max-w-full space-y-6 overflow-x-clip">
      <header className="min-w-0 space-y-1">
        <Link
          href="/admin/series"
          className={`text-sm font-semibold text-muted transition-colors duration-150 hover:text-terracotta ${adminFocusRing}`}
        >
          ← Series
        </Link>
        <h1 className="font-serif text-2xl leading-tight text-ink md:text-[1.75rem]">
          {isNew ? "New custom series" : pageTitle}
        </h1>
        <p className="text-sm text-muted">
          {isYoutube
            ? "YouTube playlist supplies membership and order; Mesa owns editorial presentation."
            : "Mesa-only collection — recipes and videos you curate by hand."}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          <EditorStatusBadge published={isPublished} />
          {showAiHeaderNote ? (
            <>
              <span aria-hidden>·</span>
              <span>{aiSummary}</span>
            </>
          ) : null}
        </p>
      </header>

      <div
        className={`sticky top-0 z-50 isolate border-b border-line bg-[var(--cream)] py-2.5 ${adminRecipeEditorStickyBleedClass}`}
      >
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {saved ? <span className="text-olive">Saved.</span> : null}
            {isDirty && !saved ? <span className="text-xs font-semibold text-muted">Unsaved changes</span> : null}
            <EditorStatusBadge published={isPublished} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isNew && isPublished ? (
              <Link
                href={`/series/${series.slug}`}
                className={`${adminSecondaryButtonClass} ${adminFocusRing} min-h-11`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Preview
              </Link>
            ) : null}
            <button
              type="button"
              onClick={attemptSaveDraft}
              className={`${adminSecondaryButtonClass} ${adminFocusRing} min-h-11`}
            >
              {draftActionLabel}
            </button>
            <button
              type="button"
              onClick={attemptPublish}
              className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
            >
              {publishButtonLabel}
            </button>
          </div>
        </div>
      </div>

      {!isNew ? (
        <section className="min-w-0 space-y-2" aria-labelledby="series-ai-heading">
          <h2 id="series-ai-heading" className={sectionLabelClass}>
            AI assistance
          </h2>
          <SeriesEditorialAiControls
            seriesId={series.id}
            aiMeta={aiMeta}
            onMarkVerified={markSeriesVerified}
          />
        </section>
      ) : null}

      <form ref={formRef} action={saveSeriesAction} className="min-w-0 space-y-10">
        {!isNew ? <input type="hidden" name="id" value={series.id} /> : null}
        <input type="hidden" name="seriesId" value={series.id} />
        <input type="hidden" name="itemsJson" value={JSON.stringify(items)} />
        <input type="hidden" name="followYoutubeOrder" value={followYoutubeOrder ? "1" : "0"} />
        <input type="hidden" name="heroImageSource" value={heroImageSource} />
        <input type="hidden" name="aiMetaJson" value={serializeSeriesAiMeta(aiMeta)} />
        <input type="hidden" name="featuredChosenByHuman" value={featuredChosenByHuman ? "1" : "0"} />
        <input ref={isPublishedRef} type="hidden" name="isPublished" value={isPublished ? "1" : "0"} />
        {!isNew ? <input type="hidden" name="slug" value={slug} /> : null}

        {publishAlert ? (
          <div
            className="rounded-sm border border-terracotta/30 bg-terracotta/5 px-4 py-3"
            role="alert"
          >
            <p className="text-sm font-semibold text-terracotta">{publishAlert}</p>
          </div>
        ) : null}

        <section className="min-w-0 space-y-4" aria-labelledby="series-editorial-heading">
          <div>
            <h2 id="series-editorial-heading" className={sectionLabelClass}>
              Editorial presentation
            </h2>
            <p className="mt-1 text-sm text-muted">Mesa copy shown on the Series page.</p>
          </div>
          <div className="grid max-w-[72ch] gap-4">
            <label className="grid min-w-0 gap-1 text-sm">
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
                  if (fieldErrors.title) {
                    setFieldErrors((current) => {
                      const next = { ...current };
                      delete next.title;
                      return next;
                    });
                  }
                }}
                required
              />
              {fieldErrors.title ? (
                <p className="text-xs font-semibold text-terracotta">{fieldErrors.title}</p>
              ) : null}
            </label>
            <label className="grid max-w-md min-w-0 gap-1 text-sm">
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
            <label className="grid min-w-0 gap-1 text-sm">
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
            <label className="grid min-w-0 gap-1 text-sm">
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
          </div>
        </section>

        <section className="min-w-0 space-y-3" aria-labelledby="series-visual-heading">
          <div>
            <h2 id="series-visual-heading" className={sectionLabelClass}>
              Visual
            </h2>
          </div>
          <div className="grid max-w-md gap-2">
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
              aria-label="Upload series hero image"
              onChange={(e) => void onHeroUpload(e.target.files?.[0] || null)}
            />
            <p className="text-xs text-muted">{RECIPE_HERO_IMAGE_HELP}</p>
          </div>
        </section>

        <section className="min-w-0 space-y-4" aria-labelledby="series-content-heading">
          <div>
            <h2 id="series-content-heading" className={sectionLabelClass}>
              Series content
            </h2>
            <p className="mt-1 text-sm text-muted">{seriesContentHelper}</p>
          </div>

          <div className="divide-y divide-line/80 border-y border-line/80">
            {items.length === 0 ? (
              <p className="py-6 text-sm text-muted">No items yet. Add content from the picker below.</p>
            ) : (
              items.map((item, index) => (
                <div
                  key={item.id || `${item.recipeId}-${item.youtubeVideoId}-${index}`}
                  className={`flex min-w-0 flex-col gap-3 py-4 sm:flex-row sm:items-start ${
                    item.removedFromPlaylist ? "bg-terracotta/[0.03]" : ""
                  }`}
                >
                  <div className="relative h-16 w-28 shrink-0 overflow-hidden border border-line bg-sand">
                    {item.thumbnail ? (
                      <Image src={item.thumbnail} alt="" fill className="object-cover" sizes="7rem" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="font-semibold text-ink">{item.label}</p>
                    <p className="text-xs text-muted">{itemCompactMeta(item)}</p>
                    {item.removedFromPlaylist && item.id ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="submit"
                          formAction={keepRemovedSeriesItemAction}
                          name="itemId"
                          value={item.id}
                          className={`${adminSecondaryButtonClass} ${adminFocusRing} min-h-11`}
                        >
                          Keep in Mesa Series
                        </button>
                        <button
                          type="submit"
                          formAction={removeSeriesItemAction}
                          name="itemId"
                          value={item.id}
                          className={`${adminSecondaryButtonClass} ${adminFocusRing} min-h-11`}
                          aria-label={`Remove ${item.label} from series`}
                          onClick={(event) => {
                            if (!window.confirm(removeItemConfirmMessage(item))) {
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
                    <label className="grid min-w-0 gap-1 text-sm">
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
                    <label className="grid min-w-0 gap-1 text-sm">
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
                  <div className="flex shrink-0 flex-row flex-wrap gap-2 sm:flex-col">
                    {!(isYoutube && followYoutubeOrder) ? (
                      <>
                        <button
                          type="button"
                          className={`${adminSecondaryButtonClass} ${adminFocusRing} min-h-11`}
                          aria-label={`Move ${item.label} up`}
                          onClick={() => moveItem(index, -1)}
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          className={`${adminSecondaryButtonClass} ${adminFocusRing} min-h-11`}
                          aria-label={`Move ${item.label} down`}
                          onClick={() => moveItem(index, 1)}
                        >
                          Down
                        </button>
                      </>
                    ) : null}
                    {item.featured ? (
                      <span
                        className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-olive"
                        aria-label={`Featured item: ${item.label}`}
                      >
                        Featured
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={`${adminSecondaryButtonClass} ${adminFocusRing} min-h-11`}
                        aria-label={`Set ${item.label} as featured`}
                        onClick={() => setFeatured(index)}
                      >
                        Set as featured
                      </button>
                    )}
                    {!item.removedFromPlaylist ? (
                      <button
                        type="button"
                        className={`${adminSecondaryButtonClass} ${adminFocusRing} min-h-11`}
                        aria-label={`Remove ${item.label} from series`}
                        onClick={() => removeLocalItem(index)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="min-w-0 space-y-3 border-t border-line/60 pt-5">
            <div>
              <h3 className="text-sm font-semibold text-ink">Add Mesa items</h3>
              <p className="text-xs text-muted">Optional</p>
            </div>
            <div className="flex min-w-0 flex-wrap gap-2">
              <input
                className={`${adminInputClass} min-w-0 flex-1 basis-[12rem]`}
                placeholder="Search recipes, videos, types…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search recipes and videos to add"
              />
              <select
                className={adminSelectClass}
                value={formatFilter}
                onChange={(e) => setFormatFilter(e.target.value)}
                aria-label="Filter by format"
              >
                <option value="all">All formats</option>
                <option value="LONG">Long-form</option>
                <option value="SHORT">Shorts</option>
              </select>
              <select
                className={adminSelectClass}
                value={linkFilter}
                onChange={(e) => setLinkFilter(e.target.value)}
                aria-label="Filter by content"
              >
                <option value="all">All content</option>
                <option value="linked">Linked YouTube</option>
                <option value="unlinked">No YouTube</option>
                <option value="published">Published recipes</option>
              </select>
            </div>
            <ul className="max-h-72 divide-y divide-line/70 overflow-y-auto border-y border-line/70">
              {filteredCandidates.slice(0, 40).map((c) => {
                const addLabel = c.recipeTitle || c.youtubeTitle || "item";
                return (
                  <li key={c.key} className="flex min-w-0 items-center gap-3 py-2.5">
                    <div className="relative h-12 w-20 shrink-0 overflow-hidden bg-sand">
                      {c.thumbnail ? (
                        <Image src={c.thumbnail} alt="" fill className="object-cover" sizes="5rem" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {c.recipeTitle || c.youtubeTitle}
                      </p>
                      <p className="truncate text-xs text-muted">{pickerCandidateMeta(c)}</p>
                    </div>
                    <button
                      type="button"
                      className={`${adminSecondaryButtonClass} ${adminFocusRing} min-h-11 shrink-0`}
                      aria-label={`Add ${addLabel}`}
                      onClick={() => addCandidate(c)}
                    >
                      Add
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="min-w-0 space-y-4" aria-labelledby="series-discovery-heading">
          <div>
            <h2 id="series-discovery-heading" className={sectionLabelClass}>
              Discovery
            </h2>
          </div>
          <div className="grid max-w-[72ch] gap-4">
            <label className="grid min-w-0 gap-1 text-sm">
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
            <label className="grid min-w-0 gap-1 text-sm">
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
            {isNew ? (
              <label className="grid min-w-0 gap-1 text-sm">
                <span className="font-semibold">Slug</span>
                <input
                  className={adminInputClass}
                  name="slug"
                  value={slug}
                  onChange={(e) => {
                    setSlug(slugify(e.target.value));
                    if (fieldErrors.slug) {
                      setFieldErrors((current) => {
                        const next = { ...current };
                        delete next.slug;
                        return next;
                      });
                    }
                  }}
                  required
                />
                {fieldErrors.slug ? (
                  <p className="text-xs font-semibold text-terracotta">{fieldErrors.slug}</p>
                ) : null}
              </label>
            ) : (
              <div className="min-w-0">
                <p className={sectionLabelClass}>Slug</p>
                <p className="mt-1 font-mono text-sm text-muted">{slug}</p>
                <p className="mt-0.5 text-xs text-muted">Locked after creation.</p>
              </div>
            )}
            <label className="grid max-w-xs min-w-0 gap-1 text-sm">
              <span className="font-semibold text-muted">Catalog sort order</span>
              <input
                className={adminInputClass}
                name="sortOrder"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
              <span className="text-xs text-muted">Controls Series order in the admin catalog.</span>
            </label>
          </div>
        </section>

        {isYoutube && !isNew ? (
          <section className="min-w-0 space-y-4" aria-labelledby="series-source-heading">
            <div>
              <h2 id="series-source-heading" className={sectionLabelClass}>
                Source
              </h2>
              <p className="mt-1 text-sm font-semibold text-ink">YouTube playlist</p>
            </div>
            <div className="flex min-w-0 flex-wrap items-start gap-4">
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
              <div className="min-w-0 flex-1 space-y-1 text-sm 2xl:grid 2xl:grid-cols-2 2xl:gap-x-6 2xl:gap-y-1 2xl:space-y-0">
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
                <p className="text-muted">
                  Last refreshed: {formatSyncedAt(series.youtubePlaylistLastSyncedAt)}
                </p>
                <p className="text-muted 2xl:col-span-2">
                  Order: {followYoutubeOrder ? "Follow YouTube playlist order" : "Custom Mesa order"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                formAction={refreshSeriesFromYoutubeAction}
                className={`${adminSecondaryButtonClass} ${adminFocusRing} min-h-11`}
              >
                Refresh from YouTube
              </button>
              {playlistUrl ? (
                <a
                  href={playlistUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${adminSecondaryButtonClass} ${adminFocusRing} min-h-11`}
                >
                  View playlist on YouTube
                </a>
              ) : null}
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={followYoutubeOrder}
                onChange={(e) => setFollowYoutubeOrder(e.target.checked)}
              />
              Follow YouTube playlist order on refresh
            </label>
            <p className="max-w-[72ch] text-xs text-muted">
              Refresh updates playlist membership and snapshots only. Mesa title, intro, SEO, hero,
              published state, and recipe content are never overwritten.
            </p>
          </section>
        ) : null}
      </form>

      {!isYoutube && !isNew && linkablePlaylists.length > 0 ? (
        <section className="min-w-0 space-y-3 border-y border-line/80 py-5">
          <p className={sectionLabelClass}>Optional YouTube link</p>
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
              className={`${adminSecondaryButtonClass} ${adminFocusRing} min-h-11 disabled:opacity-50`}
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
            <button
              type="submit"
              className={`text-sm font-semibold text-terracotta hover:underline ${adminFocusRing}`}
            >
              Delete series
            </button>
          </form>
        </div>
      ) : null}

      {moveToDraftOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 px-4"
          role="presentation"
          onClick={() => setMoveToDraftOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={moveToDraftTitleId}
            className="w-full max-w-md border border-line bg-paper p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id={moveToDraftTitleId} className="font-serif text-2xl text-ink">
              Move to draft?
            </h3>
            <p className="mt-3 text-sm leading-6 text-muted">
              This saves your edits and removes{" "}
              <span className="font-semibold text-ink">{pageTitle}</span> from the public site until
              you publish again.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                ref={moveToDraftCancelRef}
                type="button"
                onClick={() => setMoveToDraftOpen(false)}
                className={`rounded-full border border-line px-5 py-2 text-sm font-semibold text-ink hover:border-terracotta ${adminFocusRing}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={proceedSaveDraft}
                className={`rounded-full bg-terracotta px-5 py-2 text-sm font-semibold text-paper hover:bg-terracotta-dark ${adminFocusRing}`}
              >
                Move to draft
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {publishAiWarningOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 px-4"
          role="presentation"
          onClick={() => setPublishAiWarningOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="series-ai-publish-warning-title"
            className="w-full max-w-md border border-line bg-paper p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="series-ai-publish-warning-title" className="font-serif text-2xl text-ink">
              Publish without verification?
            </h3>
            <p className="mt-3 text-sm leading-6 text-muted">
              This series contains AI-generated editorial copy that has not been marked verified.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setPublishAiWarningOpen(false)}
                className={`rounded-full border border-line px-5 py-2 text-sm font-semibold text-ink hover:border-terracotta ${adminFocusRing}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={proceedPublishAnyway}
                className={`rounded-full bg-terracotta px-5 py-2 text-sm font-semibold text-paper hover:bg-terracotta-dark ${adminFocusRing}`}
              >
                Publish anyway
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
