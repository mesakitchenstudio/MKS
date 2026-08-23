import type { MetadataRoute } from "next";
import { site } from "@/data/site";
import { isSitePrivate } from "@/lib/flags";

export default function robots(): MetadataRoute.Robots {
  if (isSitePrivate()) {
    return {
      rules: { userAgent: "*", disallow: "/" },
    };
  }

  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${site.url}/sitemap.xml`,
  };
}
