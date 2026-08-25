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
