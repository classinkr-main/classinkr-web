import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/checkout", "/partner", "/pricing"],
    },
    sitemap: "https://classin.co.kr/sitemap.xml",
  }
}
