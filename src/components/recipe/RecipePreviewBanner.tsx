import Link from "next/link";
import {
  adminRecipePreviewBannerCopy,
  type AdminRecipePreviewStatus,
} from "@/lib/recipe-admin-preview";

export function RecipePreviewBanner({
  status,
  editorHref,
  liveHref,
}: {
  status: AdminRecipePreviewStatus;
  editorHref: string;
  liveHref?: string;
}) {
  const copy = adminRecipePreviewBannerCopy(status);

  return (
    <div className="no-print border-b border-olive/25 bg-olive/10">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-olive">
            {copy.eyebrow}
          </p>
          <p className="mt-0.5 text-sm leading-6 text-ink">{copy.detail}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={editorHref}
            className="min-h-10 rounded-full border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink hover:border-terracotta"
          >
            Back to editor
          </Link>
          {status === "published" && liveHref ? (
            <Link
              href={liveHref}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-10 text-sm font-semibold text-olive underline-offset-2 hover:underline"
            >
              Open live page
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
