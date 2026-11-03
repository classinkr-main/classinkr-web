import type { MetadataRoute } from "next"

import { SITE_URL } from "@/lib/seo"

const DISALLOW_PATHS = ["/admin", "/api", "/checkout", "/receipt", "/unsubscribe"]

// `/api` 전체를 막으면 블로그 OG 폴백 이미지(/api/og/blog/[slug])까지 크롤되지 않아 공유 카드·검색 미리보기에서
// 이미지가 빠진다. 더 긴 경로(`/api/og/`)가 우선하므로 이 접두사만 허용한다.
const ALLOW_PATHS = ["/", "/api/og/"]

// AI 크롤러 정책(2026-11-03 결정: 검색·답변용과 학습용 모두 허용). 공개 마케팅·가이드 페이지는 AI 답변에 인용되는 편이 이득이다.
// `*` 규칙과 같은 내용이지만, 정책을 바꿀 때 어느 봇이 대상인지 한눈에 보이도록 이름을 적어 둔다.
// 학습용만 막으려면 AI_TRAINING_CRAWLERS 를 disallow: ["/"] 규칙으로 옮긴다.
const AI_ANSWER_CRAWLERS = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
]
const AI_TRAINING_CRAWLERS = ["GPTBot", "ClaudeBot", "Google-Extended", "Applebot-Extended", "CCBot"]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: ALLOW_PATHS, disallow: DISALLOW_PATHS },
      { userAgent: [...AI_ANSWER_CRAWLERS, ...AI_TRAINING_CRAWLERS], allow: ALLOW_PATHS, disallow: DISALLOW_PATHS },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
