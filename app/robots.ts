import type { MetadataRoute } from "next"

import { SITE_URL } from "@/lib/seo"

const DISALLOW_PATHS = ["/admin", "/api", "/checkout", "/receipt", "/unsubscribe"]

// `/api` 전체를 막으면 블로그 OG 폴백 이미지(/api/og/blog/[slug])까지 크롤되지 않아 공유 카드·검색 미리보기에서
// 이미지가 빠진다. 더 긴 경로(`/api/og/`)가 우선하므로 이 접두사만 허용한다.
const ALLOW_PATHS = ["/", "/api/og/"]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ALLOW_PATHS,
        disallow: DISALLOW_PATHS,
      },
      {
        userAgent: "OAI-SearchBot",
        allow: ALLOW_PATHS,
        disallow: DISALLOW_PATHS,
      },
      {
        userAgent: "ChatGPT-User",
        allow: ALLOW_PATHS,
        disallow: DISALLOW_PATHS,
      },
      {
        userAgent: "GPTBot",
        allow: ALLOW_PATHS,
        disallow: DISALLOW_PATHS,
      },
      {
        userAgent: "Google-Extended",
        allow: ALLOW_PATHS,
        disallow: DISALLOW_PATHS,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
