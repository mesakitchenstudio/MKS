"use client";

import { useMemo, useState, useTransition } from "react";
import {
  NEWSLETTER_CAMPAIGN_CANDIDATE_RECIPE_MAX,
  NEWSLETTER_CAMPAIGN_DEFAULT_RECIPE_MAX,
  NEWSLETTER_CAMPAIGN_INTRO_MAX,
  NEWSLETTER_CAMPAIGN_NAME_MAX,
  NEWSLETTER_CAMPAIGN_PREHEADER_MAX,
  NEWSLETTER_CAMPAIGN_SUBJECT_MAX,
  getNewsletterCampaignSendReadiness,
  type NewsletterCampaignContent,
  type ResolvedNewsletterCampaignRecipe,
} from "@/lib/newsletter-campaign";
import {
  newsletterCampaignReadinessLabel,
  type NewsletterCampaignDryRunResult,
  type NewsletterCampaignPickerRecipe,
  type NewsletterCampaignPreviewResult,
} from "@/lib/newsletter-campaign-admin";
import { normalizeRecipePublicationStatus } from "@/lib/recipe-schedule";
import {
  deleteNewsletterCampaignAction,
  dryRunNewsletterCampaignAction,
  previewNewsletterCampaignAction,
  updateNewsletterCampaignAction,
} from "@/app/admin/newsletter-campaign-actions";

const fieldClass =
  "w-full max-w-2xl rounded-sm border border-line bg-paper px-3 py-2 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";
const btnSecondary =
  "rounded-sm border border-line bg-paper px-3 py-2 text-sm font-semibold text-ink hover:bg-cream/40 disabled:opacity-50";
const btnPrimary =
  "rounded-sm bg-ink px-3 py-2 text-sm font-semibold text-paper hover:bg-ink/90 disabled:opacity-50";
const btnDanger =
  "rounded-sm border border-terracotta/40 bg-terracotta/5 px-3 py-2 text-sm font-semibold text-terracotta hover:bg-terracotta/10 disabled:opacity-50";

type PreviewTaxonomyItem = { id: string; title?: string; name?: string };

function recipeLabel(
  id: string,
  resolved: Map<string, ResolvedNewsletterCampaignRecipe>,
  picker: Map<string, NewsletterCampaignPickerRecipe>,
) {
  const live = resolved.get(id);
  if (live) {
    const status = normalizeRecipePublicationStatus(live.status);
    const suffix = status !== "published" ? ` · ${status}` : "";
    return { title: live.title, meta: `/${live.slug}${suffix}`, available: status === "published" };
  }
  const fromPicker = picker.get(id);
  if (fromPicker) {
    return {
      title: fromPicker.title,
      meta: `/${fromPicker.slug}`,
      available: true,
    };
  }
  return { title: id, meta: "Missing or unavailable", available: false };
}

function moveId(ids: string[], index: number, delta: number) {
  const next = [...ids];
  const target = index + delta;
  if (target < 0 || target >= next.length) return next;
  const tmp = next[index]!;
  next[index] = next[target]!;
  next[target] = tmp;
  return next;
}

export function NewsletterCampaignEditor({
  campaignId,
  initialName,
  initialStatus,
  initialContent,
  resolvedRecipes,
  publishedRecipes,
  seriesOptions,
  categoryOptions,
  canCompose,
  canDryRun,
  canDelete,
  errorMessage,
}: {
  campaignId: string;
  initialName: string;
  initialStatus: string;
  initialContent: NewsletterCampaignContent;
  resolvedRecipes: ResolvedNewsletterCampaignRecipe[];
  publishedRecipes: NewsletterCampaignPickerRecipe[];
  seriesOptions: PreviewTaxonomyItem[];
  categoryOptions: PreviewTaxonomyItem[];
  canCompose: boolean;
  canDryRun: boolean;
  canDelete: boolean;
  errorMessage?: string;
}) {
  const locked = initialStatus !== "draft";
  const editable = canCompose && !locked;

  const resolvedMap = useMemo(
    () => new Map(resolvedRecipes.map((row) => [row.id, row])),
    [resolvedRecipes],
  );
  const pickerMap = useMemo(
    () => new Map(publishedRecipes.map((row) => [row.id, row])),
    [publishedRecipes],
  );

  const [name, setName] = useState(initialName);
  const [subject, setSubject] = useState(initialContent.subject);
  const [preheader, setPreheader] = useState(initialContent.preheader);
  const [intro, setIntro] = useState(initialContent.intro);
  const [featuredRecipeId, setFeaturedRecipeId] = useState<string | null>(
    initialContent.featuredRecipeId,
  );
  const [defaultRecipeIds, setDefaultRecipeIds] = useState(
    initialContent.defaultRecipeIds,
  );
  const [candidateRecipeIds, setCandidateRecipeIds] = useState(
    initialContent.candidateRecipeIds,
  );
  const [dirty, setDirty] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(errorMessage ?? null);
  const [pending, startTransition] = useTransition();

  const [previewMode, setPreviewMode] = useState<"general" | "series" | "category">(
    "general",
  );
  const [previewSeriesId, setPreviewSeriesId] = useState(seriesOptions[0]?.id ?? "");
  const [previewCategoryId, setPreviewCategoryId] = useState(
    categoryOptions[0]?.id ?? "",
  );
  const [previewPersonalization, setPreviewPersonalization] = useState(true);
  const [previewWidth, setPreviewWidth] = useState<"desktop" | "mobile">("desktop");
  const [previewTab, setPreviewTab] = useState<"html" | "text">("html");
  const [preview, setPreview] = useState<NewsletterCampaignPreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [dryRunPersonalization, setDryRunPersonalization] = useState(true);
  const [dryRun, setDryRun] = useState<NewsletterCampaignDryRunResult | null>(null);
  const [dryRunError, setDryRunError] = useState<string | null>(null);

  const draftContent: NewsletterCampaignContent = {
    subject,
    preheader,
    intro,
    featuredRecipeId,
    defaultRecipeIds,
    candidateRecipeIds,
  };

  const readiness = getNewsletterCampaignSendReadiness({
    name,
    status: initialStatus,
    content: draftContent,
    resolvedRecipes: resolvedMap,
  });

  function markDirty() {
    setDirty(true);
    setSaveMessage(null);
  }

  function ensureCandidate(id: string, list: string[]) {
    if (list.includes(id)) return list;
    return [...list, id].slice(0, NEWSLETTER_CAMPAIGN_CANDIDATE_RECIPE_MAX);
  }

  function addDefault(id: string) {
    if (!id || defaultRecipeIds.includes(id)) return;
    if (defaultRecipeIds.length >= NEWSLETTER_CAMPAIGN_DEFAULT_RECIPE_MAX) return;
    setDefaultRecipeIds([...defaultRecipeIds, id]);
    setCandidateRecipeIds(ensureCandidate(id, candidateRecipeIds));
    markDirty();
  }

  function removeDefault(id: string) {
    setDefaultRecipeIds(defaultRecipeIds.filter((item) => item !== id));
    markDirty();
  }

  function addCandidate(id: string) {
    if (!id || candidateRecipeIds.includes(id)) return;
    if (candidateRecipeIds.length >= NEWSLETTER_CAMPAIGN_CANDIDATE_RECIPE_MAX) return;
    setCandidateRecipeIds([...candidateRecipeIds, id]);
    markDirty();
  }

  function removeCandidate(id: string) {
    if (defaultRecipeIds.includes(id)) return; // keep defaults in pool
    setCandidateRecipeIds(candidateRecipeIds.filter((item) => item !== id));
    markDirty();
  }

  function onSave() {
    if (!editable) return;
    setSaveError(null);
    startTransition(async () => {
      const result = await updateNewsletterCampaignAction({
        id: campaignId,
        name,
        subject,
        preheader,
        intro,
        featuredRecipeId,
        defaultRecipeIds,
        candidateRecipeIds,
      });
      if (!result.ok) {
        setSaveError(result.message);
        return;
      }
      setDirty(false);
      setSaveMessage("Saved.");
    });
  }

  function onPreview() {
    setPreviewError(null);
    startTransition(async () => {
      const result = await previewNewsletterCampaignAction({
        campaignId,
        mode: previewMode,
        seriesId: previewMode === "series" ? previewSeriesId : null,
        categoryId: previewMode === "category" ? previewCategoryId : null,
        personalizationEnabled: previewPersonalization,
      });
      if (!result.ok) {
        setPreview(null);
        setPreviewError(result.message);
        return;
      }
      setPreview(result.data);
    });
  }

  function onDryRun() {
    if (!canDryRun) return;
    setDryRunError(null);
    startTransition(async () => {
      const result = await dryRunNewsletterCampaignAction({
        campaignId,
        personalizationEnabled: dryRunPersonalization,
      });
      if (!result.ok) {
        setDryRun(null);
        setDryRunError(result.message);
        return;
      }
      setDryRun(result.data);
    });
  }

  const availableDefaults = publishedRecipes.filter(
    (row) => !defaultRecipeIds.includes(row.id),
  );
  const availableCandidates = publishedRecipes.filter(
    (row) => !candidateRecipeIds.includes(row.id),
  );

  return (
    <div className="space-y-8">
      {locked ? (
        <p
          className="rounded-sm border border-line bg-cream/30 px-3 py-2 text-sm text-muted"
          role="status"
        >
          This campaign is <span className="font-semibold capitalize text-ink">{initialStatus}</span>{" "}
          and is read-only. Preview remains available.
        </p>
      ) : null}

      {saveError ? (
        <p className="rounded-sm border border-terracotta/25 bg-terracotta/5 px-3 py-2 text-sm text-terracotta" role="alert">
          {saveError}
        </p>
      ) : null}
      {saveMessage ? (
        <p className="rounded-sm border border-line bg-cream/20 px-3 py-2 text-sm text-ink" role="status">
          {saveMessage}
        </p>
      ) : null}

      <section aria-labelledby="campaign-fields-heading" className="space-y-4">
        <h2 id="campaign-fields-heading" className="font-serif text-xl text-ink">
          Campaign content
        </h2>

        <label className="grid gap-1.5">
          <span className="text-xs font-semibold text-ink">Internal name</span>
          <input
            className={fieldClass}
            value={name}
            maxLength={NEWSLETTER_CAMPAIGN_NAME_MAX}
            disabled={!editable}
            onChange={(e) => {
              setName(e.target.value);
              markDirty();
            }}
          />
          <span className="text-xs text-muted">
            {name.trim().length}/{NEWSLETTER_CAMPAIGN_NAME_MAX}
          </span>
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-semibold text-ink">Subject</span>
          <input
            className={fieldClass}
            value={subject}
            maxLength={NEWSLETTER_CAMPAIGN_SUBJECT_MAX}
            disabled={!editable}
            onChange={(e) => {
              setSubject(e.target.value);
              markDirty();
            }}
          />
          <span className="text-xs text-muted">
            {subject.trim().length}/{NEWSLETTER_CAMPAIGN_SUBJECT_MAX} · required for send readiness
          </span>
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-semibold text-ink">Preheader</span>
          <input
            className={fieldClass}
            value={preheader}
            maxLength={NEWSLETTER_CAMPAIGN_PREHEADER_MAX}
            disabled={!editable}
            onChange={(e) => {
              setPreheader(e.target.value);
              markDirty();
            }}
          />
          <span className="text-xs text-muted">
            {preheader.trim().length}/{NEWSLETTER_CAMPAIGN_PREHEADER_MAX} · optional
          </span>
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-semibold text-ink">Intro</span>
          <textarea
            className={`${fieldClass} min-h-28`}
            value={intro}
            maxLength={NEWSLETTER_CAMPAIGN_INTRO_MAX}
            disabled={!editable}
            onChange={(e) => {
              setIntro(e.target.value);
              markDirty();
            }}
          />
          <span className="text-xs text-muted">
            {intro.trim().length}/{NEWSLETTER_CAMPAIGN_INTRO_MAX} · plain text only
          </span>
        </label>
      </section>

      <section aria-labelledby="featured-heading" className="space-y-3">
        <h2 id="featured-heading" className="font-serif text-xl text-ink">
          Featured Recipe
        </h2>
        <p className="text-sm text-muted">Optional. Shown once as the hero; excluded from the Recipe block.</p>
        {featuredRecipeId ? (
          <div className="flex max-w-2xl flex-wrap items-center justify-between gap-2 rounded-sm border border-line bg-cream/20 px-3 py-2">
            {(() => {
              const info = recipeLabel(featuredRecipeId, resolvedMap, pickerMap);
              return (
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-ink">{info.title}</p>
                  <p className="break-words text-xs text-muted">{info.meta}</p>
                </div>
              );
            })()}
            {editable ? (
              <div className="flex gap-1">
                <button
                  type="button"
                  className={btnSecondary}
                  aria-label="Remove featured Recipe"
                  onClick={() => {
                    setFeaturedRecipeId(null);
                    markDirty();
                  }}
                >
                  Remove
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        {editable ? (
          <label className="grid max-w-2xl gap-1.5">
            <span className="text-xs font-semibold text-ink">
              {featuredRecipeId ? "Replace featured Recipe" : "Select featured Recipe"}
            </span>
            <select
              className={fieldClass}
              value=""
              onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                setFeaturedRecipeId(id);
                markDirty();
                e.target.value = "";
              }}
            >
              <option value="">Select a published recipe…</option>
              {publishedRecipes.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </section>

      <section aria-labelledby="defaults-heading" className="space-y-3">
        <h2 id="defaults-heading" className="font-serif text-xl text-ink">
          Editorial default Recipes
        </h2>
        <p className="text-sm text-muted">
          Fallback block when personalization has no strong match. Maximum{" "}
          {NEWSLETTER_CAMPAIGN_DEFAULT_RECIPE_MAX}. Default Recipes are also included in the
          personalization pool.
        </p>
        <ul className="max-w-2xl space-y-2">
          {defaultRecipeIds.map((id, index) => {
            const info = recipeLabel(id, resolvedMap, pickerMap);
            return (
              <li
                key={id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-line bg-cream/20 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-ink">{info.title}</p>
                  <p className="break-words text-xs text-muted">{info.meta}</p>
                </div>
                {editable ? (
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      className={btnSecondary}
                      aria-label={`Move ${info.title} up`}
                      disabled={index === 0}
                      onClick={() => {
                        setDefaultRecipeIds(moveId(defaultRecipeIds, index, -1));
                        markDirty();
                      }}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className={btnSecondary}
                      aria-label={`Move ${info.title} down`}
                      disabled={index === defaultRecipeIds.length - 1}
                      onClick={() => {
                        setDefaultRecipeIds(moveId(defaultRecipeIds, index, 1));
                        markDirty();
                      }}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      className={btnSecondary}
                      aria-label={`Remove ${info.title}`}
                      onClick={() => removeDefault(id)}
                    >
                      Remove
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {editable && defaultRecipeIds.length < NEWSLETTER_CAMPAIGN_DEFAULT_RECIPE_MAX ? (
          <label className="grid max-w-2xl gap-1.5">
            <span className="text-xs font-semibold text-ink">Add default Recipe</span>
            <select
              className={fieldClass}
              value=""
              onChange={(e) => {
                addDefault(e.target.value);
                e.target.value = "";
              }}
            >
              <option value="">Select a published recipe…</option>
              {availableDefaults.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </section>

      <section aria-labelledby="candidates-heading" className="space-y-3">
        <h2 id="candidates-heading" className="font-serif text-xl text-ink">
          Personalization candidate pool
        </h2>
        <p className="text-sm text-muted">
          Editor-selected pool (max {NEWSLETTER_CAMPAIGN_CANDIDATE_RECIPE_MAX}). Scorer ranks by
          member interests. Defaults stay in this pool.
        </p>
        <ul className="max-w-2xl space-y-2">
          {candidateRecipeIds.map((id) => {
            const info = recipeLabel(id, resolvedMap, pickerMap);
            const isDefault = defaultRecipeIds.includes(id);
            return (
              <li
                key={id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-line bg-cream/20 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-ink">{info.title}</p>
                  <p className="break-words text-xs text-muted">
                    {info.meta}
                    {isDefault ? " · default (kept in pool)" : ""}
                  </p>
                </div>
                {editable ? (
                  <button
                    type="button"
                    className={btnSecondary}
                    aria-label={`Remove ${info.title} from personalization pool`}
                    disabled={isDefault}
                    title={isDefault ? "Defaults remain in the personalization pool" : undefined}
                    onClick={() => removeCandidate(id)}
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
        {editable && candidateRecipeIds.length < NEWSLETTER_CAMPAIGN_CANDIDATE_RECIPE_MAX ? (
          <label className="grid max-w-2xl gap-1.5">
            <span className="text-xs font-semibold text-ink">Add candidate Recipe</span>
            <select
              className={fieldClass}
              value=""
              onChange={(e) => {
                addCandidate(e.target.value);
                e.target.value = "";
              }}
            >
              <option value="">Select a published recipe…</option>
              {availableCandidates.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </section>

      <section
        aria-labelledby="readiness-heading"
        className="max-w-2xl rounded-sm border border-line bg-cream/20 px-4 py-3"
      >
        <h2 id="readiness-heading" className="text-sm font-semibold text-ink">
          Send readiness
        </h2>
        <p className="mt-1 text-sm text-ink" role="status">
          {newsletterCampaignReadinessLabel(readiness.ready)}
        </p>
        {readiness.issues.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            {readiness.issues.map((issue) => (
              <li key={issue.code}>{issue.message}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">All send checks pass (send is not available in this phase).</p>
        )}
        <p className="mt-2 text-xs text-muted">Draft Save is allowed even when not ready.</p>
      </section>

      {editable ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btnPrimary} disabled={pending || !dirty} onClick={onSave}>
            {pending ? "Saving…" : "Save"}
          </button>
          {dirty ? <span className="text-xs text-muted">Unsaved changes</span> : null}
        </div>
      ) : null}

      <section aria-labelledby="preview-heading" className="space-y-3 border-t border-line pt-6">
        <h2 id="preview-heading" className="font-serif text-xl text-ink">
          Preview
        </h2>
        <p className="text-sm text-muted">
          Uses the campaign email renderer. Does not send email or change campaign status.
          Preview loads saved campaign content — Save first to include unsaved edits.
        </p>

        <div className="flex max-w-2xl flex-wrap gap-3">
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-ink">Mode</span>
            <select
              className={fieldClass}
              value={previewMode}
              onChange={(e) =>
                setPreviewMode(e.target.value as "general" | "series" | "category")
              }
            >
              <option value="general">General / anonymous</option>
              <option value="series">Synthetic Series follower</option>
              <option value="category">Synthetic Category follower</option>
            </select>
          </label>
          {previewMode === "series" ? (
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-ink">Series</span>
              <select
                className={fieldClass}
                value={previewSeriesId}
                onChange={(e) => setPreviewSeriesId(e.target.value)}
              >
                {seriesOptions.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {previewMode === "category" ? (
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-ink">Category</span>
              <select
                className={fieldClass}
                value={previewCategoryId}
                onChange={(e) => setPreviewCategoryId(e.target.value)}
              >
                {categoryOptions.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-ink">Personalization simulation</span>
            <select
              className={fieldClass}
              value={previewPersonalization ? "on" : "off"}
              onChange={(e) => setPreviewPersonalization(e.target.value === "on")}
            >
              <option value="on">ON</option>
              <option value="off">OFF (general fallback)</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} disabled={pending} onClick={onPreview}>
            Run preview
          </button>
          <button
            type="button"
            className={btnSecondary}
            aria-pressed={previewWidth === "desktop"}
            onClick={() => setPreviewWidth("desktop")}
          >
            Desktop width
          </button>
          <button
            type="button"
            className={btnSecondary}
            aria-pressed={previewWidth === "mobile"}
            onClick={() => setPreviewWidth("mobile")}
          >
            Mobile width
          </button>
          <button
            type="button"
            className={btnSecondary}
            aria-pressed={previewTab === "html"}
            onClick={() => setPreviewTab("html")}
          >
            HTML Preview
          </button>
          <button
            type="button"
            className={btnSecondary}
            aria-pressed={previewTab === "text"}
            onClick={() => setPreviewTab("text")}
          >
            Plain text
          </button>
        </div>

        {previewError ? (
          <p className="text-sm text-terracotta" role="alert">
            {previewError}
          </p>
        ) : null}

        {preview ? (
          <div className="space-y-3">
            <div className="max-w-2xl space-y-1 text-sm">
              <p>
                <span className="font-semibold text-ink">Subject:</span>{" "}
                <span className="break-words text-muted">{preview.subject}</span>
              </p>
              {preview.preheader ? (
                <p>
                  <span className="font-semibold text-ink">Preheader:</span>{" "}
                  <span className="break-words text-muted">{preview.preheader}</span>
                </p>
              ) : null}
              <p>
                <span className="font-semibold text-ink">Block:</span>{" "}
                <span className="text-muted">
                  {preview.blockHeading} ({preview.blockMode})
                </span>
              </p>
              <ul className="list-disc pl-5 text-muted">
                {preview.explanation.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {!preview.readinessReady ? (
                <p className="text-terracotta" role="status">
                  Not ready — {preview.readinessIssues.map((i) => i.message).join("; ")}
                </p>
              ) : null}
            </div>

            {previewTab === "html" ? (
              <iframe
                title="Newsletter email preview"
                sandbox=""
                srcDoc={preview.html}
                className="min-h-[28rem] rounded-sm border border-line bg-white"
                style={{ width: previewWidth === "mobile" ? "390px" : "100%", maxWidth: "100%" }}
              />
            ) : (
              <pre className="max-w-2xl overflow-x-auto whitespace-pre-wrap break-words rounded-sm border border-line bg-paper p-3 text-xs text-ink">
                {preview.text}
              </pre>
            )}
          </div>
        ) : null}
      </section>

      {canDryRun && !locked ? (
        <section aria-labelledby="dryrun-heading" className="space-y-3 border-t border-line pt-6">
          <h2 id="dryrun-heading" className="font-serif text-xl text-ink">
            Dry run
          </h2>
          <p className="text-sm text-muted">
            Aggregate audience analysis only. Does not send email, write subscribers, or change
            campaign status.
          </p>
          <label className="grid max-w-xs gap-1.5">
            <span className="text-xs font-semibold text-ink">Personalization simulation</span>
            <select
              className={fieldClass}
              value={dryRunPersonalization ? "on" : "off"}
              onChange={(e) => setDryRunPersonalization(e.target.value === "on")}
            >
              <option value="on">ON</option>
              <option value="off">OFF</option>
            </select>
          </label>
          <button type="button" className={btnPrimary} disabled={pending} onClick={onDryRun}>
            Run dry run
          </button>
          {dryRunError ? (
            <p className="text-sm text-terracotta" role="alert">
              {dryRunError}
            </p>
          ) : null}
          {dryRun ? (
            <dl className="grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-sm border border-line bg-cream/20 px-3 py-2">
                <dt className="text-xs font-semibold text-muted">Eligible recipients</dt>
                <dd className="mt-1 text-lg tabular-nums text-ink">{dryRun.eligibleRecipients}</dd>
              </div>
              <div className="rounded-sm border border-line bg-cream/20 px-3 py-2">
                <dt className="text-xs font-semibold text-muted">Personalized</dt>
                <dd className="mt-1 text-lg tabular-nums text-ink">
                  {dryRun.personalizedRecipients}
                </dd>
              </div>
              <div className="rounded-sm border border-line bg-cream/20 px-3 py-2">
                <dt className="text-xs font-semibold text-muted">Editorial fallback</dt>
                <dd className="mt-1 text-lg tabular-nums text-ink">{dryRun.fallbackRecipients}</dd>
              </div>
              <div className="rounded-sm border border-line bg-cream/20 px-3 py-2">
                <dt className="text-xs font-semibold text-muted">Campaign ready</dt>
                <dd className="mt-1 text-sm text-ink">
                  {newsletterCampaignReadinessLabel(dryRun.campaignReady)}
                </dd>
              </div>
            </dl>
          ) : null}
        </section>
      ) : null}

      {canDelete && !locked ? (
        <section aria-labelledby="delete-heading" className="space-y-3 border-t border-line pt-6">
          <h2 id="delete-heading" className="font-serif text-xl text-ink">
            Delete draft
          </h2>
          <p className="text-sm text-muted">
            Deletes this draft campaign only. No effect on subscribers or Recipes.
          </p>
          <form action={deleteNewsletterCampaignAction} className="flex max-w-md flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={campaignId} />
            <label className="grid flex-1 gap-1.5">
              <span className="text-xs font-semibold text-ink">Type delete to confirm</span>
              <input className={fieldClass} name="confirm" autoComplete="off" />
            </label>
            <button type="submit" className={btnDanger}>
              Delete campaign
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
