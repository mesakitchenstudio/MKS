import Script from "next/script";
import { getAdSenseClientId, shouldLoadAdSenseScript } from "@/lib/ads";

/**
 * Future AdSense bootstrap. Renders nothing unless ads are globally enabled,
 * the path is eligible, the site is not private, and a real ca-pub client is set.
 */
export function AdSenseLoader({
  pathname,
  sitePrivate = false,
}: {
  pathname: string;
  sitePrivate?: boolean;
}) {
  if (!shouldLoadAdSenseScript({ pathname, sitePrivate })) return null;

  const client = getAdSenseClientId();
  if (!client) return null;

  return (
    <Script
      id="mesa-adsense"
      async
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`}
      crossOrigin="anonymous"
      strategy="afterInteractive"
    />
  );
}
