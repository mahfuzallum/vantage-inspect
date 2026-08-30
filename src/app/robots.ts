import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        /*
          Private surfaces only.

          /search is deliberately NOT disallowed. It sends `noindex`, and a
          crawler blocked from fetching the page never sees that header — which
          is how blocked URLs end up indexed URL-only, with no title. Allowing
          the crawl lets the noindex actually do its job.
        */
        disallow: ["/account/", "/admin/", "/api/", "/auth/"],
      },
    ],
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  };
}
