import type { MetadataRoute } from "next";
import { site } from "@/data/site";
import { isSitePrivate } from "@/lib/flags";
import { publicRobotsDisallow, ROBOTS_PRIVATE_ALLOW } from "@/lib/robots-policy";
import { isStudioPublicLaunchEnabled } from "@/lib/studio-public";

export default function robots(): MetadataRoute.Robots {
  if (isSitePrivate()) {
    return {
      rules: {
        userAgent: "*",
        // Keep brand icons crawlable so YouTube/Google can show the site favicon
        // while the rest of the site stays gated.
        allow: [...ROBOTS_PRIVATE_ALLOW],
        disallow: "/",
      },
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: publicRobotsDisallow(isStudioPublicLaunchEnabled()),
      },
    ],
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
