import { resolveBlogContentModifiedAt } from "@/lib/blog-types"
import { getPublishedPostsForStaticSitemap } from "@/lib/repositories/blog"
import { SITE_NAME, SITE_URL, toAbsoluteUrl } from "@/lib/seo"

export const revalidate = 3600

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

// RFC 822 날짜(toUTCString). 해석할 수 없는 값은 Invalid Date 문자열을 피해 undefined 로 돌려보낸다.
function toRfc822(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? new Date(time).toUTCString() : undefined
}

function latestTime(values: Array<string | null | undefined>): number | undefined {
  const times = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((time) => Number.isFinite(time))
  return times.length > 0 ? Math.max(...times) : undefined
}

export async function GET() {
  let posts: Awaited<ReturnType<typeof getPublishedPostsForStaticSitemap>> = []
  let loadFailed = false
  try {
    posts = await getPublishedPostsForStaticSitemap()
  } catch (error) {
    loadFailed = true
    console.error("[blog/rss] failed to load posts:", error)
  }

  const feedPosts = posts.slice(0, 50)
  // 채널 lastBuildDate 는 실린 글들의 가장 최근 변경 시각이다. 글이 없으면(조회 실패 포함) 지어내지 않고 뺀다.
  // 글별 변경 시각은 contentUpdatedAt 우선(대표 글·공개 토글로 바뀌는 updated_at 은 마이그레이션 미적용 폴백일 때만) —
  // 사이트맵 lastmod·JSON-LD dateModified 와 같은 규칙(lib/blog-types.ts resolveBlogContentModifiedAt).
  const lastBuildTime = latestTime(
    feedPosts.flatMap((post) => [resolveBlogContentModifiedAt(post), post.publishedAt, post.createdAt])
  )
  const lastBuildDate = lastBuildTime === undefined ? undefined : new Date(lastBuildTime).toUTCString()

  const items = feedPosts.map((post) => {
    const url = toAbsoluteUrl(`/blog/${post.slug}`)
    // publishedAt 이 없는 레거시 글은 작성 시각으로 폴백한다 — pubDate 가 없으면 리더가 항목 순서를 못 잡는다.
    const pubDate = toRfc822(post.publishedAt) ?? toRfc822(post.createdAt)
    return [
      "    <item>",
      `      <title>${escapeXml(post.title)}</title>`,
      `      <link>${escapeXml(url)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
      `      <description>${escapeXml(post.excerpt)}</description>`,
      post.category ? `      <category>${escapeXml(post.category)}</category>` : undefined,
      pubDate ? `      <pubDate>${pubDate}</pubDate>` : undefined,
      "    </item>",
    ]
      .filter(Boolean)
      .join("\n")
  })

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(`${SITE_NAME} 블로그`)}</title>`,
    `    <link>${escapeXml(toAbsoluteUrl("/blog"))}</link>`,
    `    <description>${escapeXml("학원 운영 노하우, 제품 업데이트, 성공 사례를 전합니다.")}</description>`,
    "    <language>ko-KR</language>",
    lastBuildDate ? `    <lastBuildDate>${lastBuildDate}</lastBuildDate>` : undefined,
    "    <ttl>60</ttl>",
    `    <atom:link href="${escapeXml(`${SITE_URL}/blog/rss.xml`)}" rel="self" type="application/rss+xml"/>`,
    ...items,
    "  </channel>",
    "</rss>",
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n")

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      // 조회 실패로 빈 피드가 나갔다면 캐시하지 않는다 — 순간 장애가 "글 0개"로 1시간 고정되는 걸 막는다.
      "Cache-Control": loadFailed ? "no-store" : "public, max-age=3600",
    },
  })
}
