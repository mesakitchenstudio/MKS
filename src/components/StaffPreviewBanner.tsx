import Link from "next/link";

/** Slim bar shown only while SITE_PRIVATE and a Studio admin is browsing the public site. */
export function StaffPreviewBanner() {
  return (
    <div
      className="no-print border-b border-olive/30 bg-olive/10 px-4 py-2 text-center text-sm text-ink"
      role="status"
    >
      <span className="font-semibold">Staff preview</span>
      <span className="text-muted"> — visitors still see Coming Soon. </span>
      <Link href="/admin" className="font-semibold text-terracotta hover:underline">
        Back to admin
      </Link>
    </div>
  );
}
