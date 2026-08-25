import type { MetadataRoute } from "next";
import { site } from "@/data/site";
import { isSitePrivate } from "@/lib/flags";

export default function robots(): MetadataRoute.Robots {
  if (isSitePrivate()) {
    return {
      rules: {
        userAgent: "*",
        // Keep brand icons crawlable so YouTube/Google can show the site favicon
        // while the rest of the site stays gated.
        allow: ["/favicon.ico", "/favicon.png", "/icon.png", "/apple-icon.png", "/icon.svg"],
        disallow: "/",
      },
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api/", "/profile", "/auth/", "/coming-soon"],
      },
    ],
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
