import Link from "next/link";

type StaffPreviewBannerProps = {
  /** SITE_PRIVATE staff browsing the public site. */
  sitePrivate?: boolean;
  /** Staff previewing unpublished Studio routes while the site is public. */
  studioUnpublished?: boolean;
};

/** Slim bar shown only to authorized staff during preview modes. */
export function StaffPreviewBanner({
  sitePrivate = false,
  studioUnpublished = false,
}: StaffPreviewBannerProps) {
  const detail = sitePrivate
    ? "visitors still see Coming Soon."
    : studioUnpublished
      ? "Studio is not yet public."
      : null;

  return (
    <div
      className="no-print border-b border-olive/30 bg-olive/10 px-4 py-2 text-center text-sm text-ink"
      role="status"
    >
      <span className="font-semibold">Staff preview</span>
      {detail ? <span className="text-muted"> — {detail} </span> : null}
      <Link href="/admin" className="font-semibold text-terracotta hover:underline">
        Back to admin
      </Link>
    </div>
  );
}
