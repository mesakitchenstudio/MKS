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
  recipes = [],
}: {
  children: React.ReactNode;
  hideTools?: boolean;
  /** When false (coming-soon / private mode), omit public header and footer. */
  showChrome?: boolean;
  /** SITE_PRIVATE + valid admin session browsing the public site. */
  showStaffPreviewBanner?: boolean;
  recipes?: OverlayRecipe[];
}) {
  const pathname = usePathname() || "";

  // Admin has its own shell — never mount public header/footer/tools there.
  if (pathname.startsWith("/admin")) {
    return children;
  }

  return (
    <>
      {showStaffPreviewBanner ? <StaffPreviewBanner /> : null}
      {showChrome ? <SiteHeader /> : null}
      {children}
      {showChrome ? <SiteFooter /> : null}
      {hideTools ? null : <RecipeFloatTools recipes={recipes} />}
    </>
  );
}
