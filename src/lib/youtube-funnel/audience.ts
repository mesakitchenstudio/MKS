import { isHumanAudienceGuest } from "@/lib/guest-classification";

/**
 * Website Funnel audience gate — identical Phase 2D Human-only rule as Visitors.
 * Prefer persisted GuestVisitor.clientKind; fall back via resolveGuestAudienceKind.
 */
export function isYoutubeFunnelAudienceHuman(input: {
  clientKind?: string | null;
  userAgent?: string | null;
  pageViewUserAgent?: string | null;
}) {
  const ua =
    String(input.pageViewUserAgent ?? "").trim() || String(input.userAgent ?? "").trim();
  return isHumanAudienceGuest({
    clientKind: input.clientKind,
    userAgent: ua,
  });
}
