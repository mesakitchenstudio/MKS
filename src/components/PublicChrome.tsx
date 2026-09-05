"use client";

import { usePathname } from "next/navigation";
import { RecipeFloatTools } from "./RecipeFloatTools";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import { StaffPreviewBanner } from "./StaffPreviewBanner";
import type { OverlayRecipe } from "./SearchOverlay";

export function PublicChrome({
  children,
  hideTools = false,
  showChrome = true,
  showStaffPreviewBanner = false,
  showStudioStaffPreviewBanner = false,
  recipes = [],
}: {
  children: React.ReactNode;
  hideTools?: boolean;
  /** When false (coming-soon / private mode), omit public header and footer. */
  showChrome?: boolean;
  /** SITE_PRIVATE + valid admin session browsing the public site. */
  showStaffPreviewBanner?: boolean;
  /** Valid admin session previewing /studio while STUDIO_PUBLIC_LAUNCH is off. */
  showStudioStaffPreviewBanner?: boolean;
  recipes?: OverlayRecipe[];
}) {
  const pathname = usePathname() || "";

  // Admin has its own shell — never mount public header/footer/tools there.
  if (pathname.startsWith("/admin")) {
    return children;
  }

  // Standalone newsletter unsubscribe — brand lives in the page; keep chrome off
  // so Coming Soon / private mode and a distraction-free utility surface stay consistent.
  const onNewsletterUnsubscribe = pathname.startsWith("/newsletter/unsubscribe");
  const showPublicChrome = showChrome && !onNewsletterUnsubscribe;
  const showFloatTools = !hideTools && !onNewsletterUnsubscribe;

  const onStudioRoute = pathname === "/studio" || pathname.startsWith("/studio/");

  return (
    <>
      {showStaffPreviewBanner ? <StaffPreviewBanner sitePrivate /> : null}
      {!showStaffPreviewBanner && showStudioStaffPreviewBanner && onStudioRoute ? (
        <StaffPreviewBanner studioUnpublished />
      ) : null}
      {showPublicChrome ? <SiteHeader /> : null}
      {children}
      {showPublicChrome ? <SiteFooter hideNewsletter={pathname === "/"} /> : null}
      {showFloatTools ? <RecipeFloatTools recipes={recipes} /> : null}
    </>
  );
}
