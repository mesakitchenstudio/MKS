"use client";

import { usePathname } from "next/navigation";
import { AdSenseLoader } from "@/components/ads/AdSenseLoader";

/**
 * Client wrapper so the root layout can gate the future AdSense script by pathname.
 * With ADS_ENABLED unset/false, AdSenseLoader returns null (no network request).
 */
export function AdSensePathLoader({ sitePrivate = false }: { sitePrivate?: boolean }) {
  const pathname = usePathname() || "/";
  return <AdSenseLoader pathname={pathname} sitePrivate={sitePrivate} />;
}
