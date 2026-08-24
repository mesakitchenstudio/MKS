"use client";

import { usePathname } from "next/navigation";
import { RecipeFloatTools } from "./RecipeFloatTools";
import type { OverlayRecipe } from "./SearchOverlay";

export function PublicChrome({
  header,
  footer,
  children,
  hideTools = false,
  recipes = [],
}: {
  header: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
  hideTools?: boolean;
  recipes?: OverlayRecipe[];
}) {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) {
    return <>{children}</>;
  }

  return (
    <>
      {header}
      {children}
      {footer}
      {hideTools ? null : <RecipeFloatTools recipes={recipes} />}
    </>
  );
}
