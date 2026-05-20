import type { MetadataRoute } from "next"

import { SITE_URL } from "@/lib/seo"

const DISALLOW_PATHS = ["/admin", "/api", "/checkout", "/receipt", "/unsubscribe"]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOW_PATHS,
      },
      {
        userAgent: "OAI-SearchBot",
        allow: "/",
        disallow: DISALLOW_PATHS,
      },
      {
        userAgent: "ChatGPT-User",
        allow: "/",
        disallow: DISALLOW_PATHS,
      },
      {
        userAgent: "GPTBot",
        allow: "/",
        disallow: DISALLOW_PATHS,
      },
      {
        userAgent: "Google-Extended",
        allow: "/",
        disallow: DISALLOW_PATHS,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
