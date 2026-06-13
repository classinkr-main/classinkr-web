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

export async function GET() {
  let posts: Awaited<ReturnType<typeof getPublishedPostsForStaticSitemap>> = []
  try {
    posts = await getPublishedPostsForStaticSitemap()
  } catch (error) {
    console.error("[blog/rss] failed to load posts:", error)
  }

  const items = posts.slice(0, 50).map((post) => {
    const url = toAbsoluteUrl(`/blog/${post.slug}`)
    const pubDate = post.publishedAt ? new Date(post.publishedAt).toUTCString() : undefined
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
    `    <atom:link href="${escapeXml(`${SITE_URL}/blog/rss.xml`)}" rel="self" type="application/rss+xml"/>`,
    ...items,
    "  </channel>",
    "</rss>",
  ].join("\n")

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  })
}
