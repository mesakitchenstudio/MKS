"use client";

import { usePathname } from "next/navigation";
import { RecipeFloatTools } from "./RecipeFloatTools";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import type { OverlayRecipe } from "./SearchOverlay";

export function PublicChrome({
  children,
  hideTools = false,
  showChrome = true,
  recipes = [],
  newsletterSubscribed = false,
}: {
  children: React.ReactNode;
  hideTools?: boolean;
  /** When false (coming-soon / private mode), omit public header and footer. */
  showChrome?: boolean;
  recipes?: OverlayRecipe[];
  /** Server-resolved: session email has an active NewsletterSubscriber row. */
  newsletterSubscribed?: boolean;
}) {
  const pathname = usePathname() || "";

  // Admin has its own shell — never mount public header/footer/tools there.
  if (pathname.startsWith("/admin")) {
    return children;
  }

  // Standalone newsletter unsubscribe — brand lives in the page; keep chrome off
  // so Coming Soon / private mode and a distraction-free utility surface stay consistent.
  const onNewsletterUnsubscribe = pathname.startsWith("/newsletter/unsubscribe");
  // Cooking Mode has its own minimal header; hide public chrome for focus.
  const onCookingMode = /^\/recipes\/[^/]+\/cook\/?$/.test(pathname);
  const showPublicChrome = showChrome && !onNewsletterUnsubscribe && !onCookingMode;
  const showFloatTools = !hideTools && !onNewsletterUnsubscribe && !onCookingMode;

  return (
    <>
      {showPublicChrome ? <SiteHeader /> : null}
      {children}
      {showPublicChrome ? (
        <SiteFooter
          hideNewsletter={pathname === "/"}
          newsletterSubscribed={newsletterSubscribed}
        />
      ) : null}
      {showFloatTools ? <RecipeFloatTools recipes={recipes} /> : null}
    </>
  );
}
