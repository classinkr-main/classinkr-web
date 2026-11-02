import type { MetadataRoute } from "next"

import { resolveBlogContentModifiedAt } from "@/lib/blog-types"
import { getDocCategoryPath, getDocPath, type DocArticle } from "@/lib/docs"
import { getDocsContent, listListedDocsFromContent } from "@/lib/docs-content"
import { getDocSitemapImages } from "@/lib/docs-structured-data"
import { getPublishedPostsForStaticSitemap } from "@/lib/repositories/blog"
import { listCachedPublicEvents } from "@/lib/repositories/public-events"
import { getPublishedSeminars } from "@/lib/seminars/catalog"
import { SITE_URL } from "@/lib/seo"

const staticRoutes: Array<{
  path: string
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]
  priority: number
  // 근거가 되는 날짜가 없는 경로는 생략한다(임의 날짜를 만들어 넣지 않는다).
  lastModified?: string
}> = [
  { path: "/", changeFrequency: "weekly", priority: 1, lastModified: "2026-05-20" },
  { path: "/docs", changeFrequency: "weekly", priority: 1, lastModified: "2026-05-20" },
  { path: "/docs/first-week", changeFrequency: "monthly", priority: 0.7, lastModified: "2026-10-29" },
  { path: "/product", changeFrequency: "weekly", priority: 0.9, lastModified: "2026-05-20" },
  { path: "/product/sw", changeFrequency: "weekly", priority: 0.9, lastModified: "2026-05-20" },
  { path: "/product/hw", changeFrequency: "weekly", priority: 0.9, lastModified: "2026-05-20" },
  { path: "/product/ai-report", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-08-28" },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-06-10" },
  { path: "/contact", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-04-01" },
  { path: "/showroom", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-08-29" },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.5, lastModified: "2026-04-01" },
  { path: "/terms", changeFrequency: "yearly", priority: 0.5, lastModified: "2026-04-01" },
  { path: "/data-deletion", changeFrequency: "yearly", priority: 0.5, lastModified: "2026-04-01" },
  { path: "/blog", changeFrequency: "daily", priority: 0.8, lastModified: "2026-04-01" },
  { path: "/events", changeFrequency: "weekly", priority: 0.7, lastModified: "2026-04-01" },
  { path: "/resources", changeFrequency: "monthly", priority: 0.7 },
  { path: "/download", changeFrequency: "weekly", priority: 0.8 },
  { path: "/updates", changeFrequency: "weekly", priority: 0.7, lastModified: "2026-04-01" },
  { path: "/faq", changeFrequency: "monthly", priority: 0.7, lastModified: "2026-05-20" },
  { path: "/about", changeFrequency: "monthly", priority: 0.5, lastModified: "2026-04-01" },
]

// 배포 때만 만들어지면 스크립트로 공개한 글이 다음 배포까지 빠진다(2026-10-26: 공개 42편 중 19편만 노출).
// 1시간마다 다시 만든다. 어드민 저장은 revalidatePath("/sitemap.xml")로 즉시 갱신한다.
export const revalidate = 3600

// 빌드 중 조회 실패는 빈 목록으로 넘겨 배포를 막지 않는다. 운영에서 다시 만들 때 실패하면 던져서
// 직전 사이트맵을 계속 내보내게 한다 — 빈 목록이 1시간 동안 굳는 것보다 낫다.
function fallbackOnlyDuringBuild<T>(label: string, fallback: T) {
  return (error: unknown): T => {
    console.error(`[sitemap] failed to load ${label}`, error)
    if (process.env.NEXT_PHASE === "phase-production-build") return fallback
    throw error
  }
}

function toAbsoluteUrl(path: string) {
  return new URL(path, SITE_URL).toString()
}

function latestDate(candidates: Array<string | null | undefined>): Date | null {
  const times = candidates
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((time) => Number.isFinite(time))
  return times.length > 0 ? new Date(Math.max(...times)) : null
}

// 문서가 정식 주소(canonicalPath)를 따로 가진 경우 사이트맵에도 그 주소를 올린다.
// 다른 호스트를 가리키거나 해석할 수 없는 값이면 문서 자신의 경로로 되돌린다(사이트맵은 같은 호스트만 허용).
function resolveDocSitemapUrl(doc: Pick<DocArticle, "category" | "slug" | "canonicalPath">): string {
  const ownUrl = toAbsoluteUrl(getDocPath(doc))
  const canonicalPath = doc.canonicalPath?.trim()
  if (!canonicalPath) return ownUrl

  try {
    const canonicalUrl = toAbsoluteUrl(canonicalPath)
    return new URL(canonicalUrl).origin === new URL(SITE_URL).origin ? canonicalUrl : ownUrl
  } catch {
    return ownUrl
  }
}

// 같은 URL 이 두 번 실리지 않게 먼저 나온 항목만 남긴다(canonicalPath 가 다른 문서·허브와 겹칠 수 있다).
function dedupeByUrl(entries: MetadataRoute.Sitemap): MetadataRoute.Sitemap {
  const seen = new Set<string>()
  return entries.filter((entry) => {
    if (seen.has(entry.url)) return false
    seen.add(entry.url)
    return true
  })
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [publishedPosts, docsContent, publicEvents] = await Promise.all([
    getPublishedPostsForStaticSitemap().catch(fallbackOnlyDuringBuild("published posts", [])),
    getDocsContent().catch(fallbackOnlyDuringBuild("docs content", null)),
    listCachedPublicEvents().catch(fallbackOnlyDuringBuild("public events", [])),
  ])

  const listedDocs = docsContent ? listListedDocsFromContent(docsContent) : []

  // 목록 페이지(lastModified)는 하드코딩 날짜 대신 실제 최신 콘텐츠 날짜를 반영.
  // 블로그는 updated_at(대표 글·공개 토글에도 바뀐다)이 아니라 글 내용이 바뀐 시각을 쓴다.
  const latestBlogDate = latestDate(publishedPosts.map(resolveBlogContentModifiedAt))
  const latestEventDate = latestDate(publicEvents.map((event) => event.updatedAt))
  const latestDocsDate = latestDate(listedDocs.map((doc) => doc.updatedAt))

  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((route) => {
    const staticDate = route.lastModified ? new Date(route.lastModified) : undefined
    const lastModified =
      route.path === "/blog"
        ? latestBlogDate ?? staticDate
        : route.path === "/events"
          ? latestEventDate ?? staticDate
          : route.path === "/docs"
            ? latestDocsDate ?? staticDate
            : staticDate

    return {
      url: toAbsoluteUrl(route.path),
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    }
  })

  // lastmod = contentUpdatedAt → (마이그레이션 미적용 폴백) updatedAt → publishedAt → createdAt,
  // 발행 시각보다 앞서지 않게 맞춘 값(lib/blog-types.ts). 블로그 상세 JSON-LD dateModified 와 같은 값이다.
  const blogEntries: MetadataRoute.Sitemap = publishedPosts.map((post) => ({
    url: toAbsoluteUrl(`/blog/${post.slug}`),
    lastModified: resolveBlogContentModifiedAt(post),
    changeFrequency: "weekly",
    priority: post.featured ? 0.8 : 0.7,
  }))

  const eventEntries: MetadataRoute.Sitemap = publicEvents
    .filter((event) => Boolean(event.slug))
    .map((event) => ({
      url: toAbsoluteUrl(`/events/${event.slug}`),
      lastModified: event.updatedAt ?? undefined,
      changeFrequency: "weekly",
      priority: 0.6,
    }))

  // 행사 영상 상세는 색인 대상이다(페이지 metadata 에 robots 제한이 없고, 비회원에게는 잠금 미리보기가 열린다).
  // SeminarVideo 에는 noindex 개념이 없고, 비공개(isPublished: false) 영상은 getPublishedSeminars 가 이미 거른다.
  const seminarEntries: MetadataRoute.Sitemap = getPublishedSeminars().map((seminar) => ({
    url: toAbsoluteUrl(`/events/videos/${seminar.slug}`),
    lastModified: latestDate([seminar.publishedAt]) ?? undefined,
    changeFrequency: "monthly",
    priority: 0.5,
  }))

  if (!docsContent) {
    return dedupeByUrl([...staticEntries, ...blogEntries, ...eventEntries, ...seminarEntries])
  }

  const docsCategoryEntries: MetadataRoute.Sitemap = docsContent.categories.map((category) => ({
    url: toAbsoluteUrl(getDocCategoryPath(category.id)),
    lastModified:
      latestDate(
        listedDocs.filter((doc) => doc.category === category.id).map((doc) => doc.updatedAt)
      ) ?? undefined,
    changeFrequency: "monthly",
    priority: 0.75,
  }))

  // 이미지 사이트맵: 공개·색인 문서의 화면 사진(문서당 최대 5장). 정식 주소가 다른 문서를 가리키는 문서는
  // getDocSitemapImages 가 빈 배열을 돌려준다(그 사진은 정식 주소 페이지에 없을 수 있다).
  const docsArticleEntries: MetadataRoute.Sitemap = listedDocs.map((doc) => {
    const images = getDocSitemapImages(doc)
    return {
      url: resolveDocSitemapUrl(doc),
      lastModified: new Date(doc.updatedAt),
      changeFrequency: "monthly",
      priority: doc.featured ? 0.8 : 0.65,
      ...(images.length > 0 ? { images } : {}),
    }
  })

  return dedupeByUrl([
    ...staticEntries,
    ...blogEntries,
    ...eventEntries,
    ...seminarEntries,
    ...docsCategoryEntries,
    ...docsArticleEntries,
  ])
}
